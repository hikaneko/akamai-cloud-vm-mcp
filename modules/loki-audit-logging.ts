import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";

type LokiAuditOptions = {
  endpoint: string;
  username: string;
  password: string;
};

type StatusClass = "2xx" | "3xx" | "4xx" | "5xx" | "unknown";

type McpAuditEntry = {
  timestamp: string;
  jsonrpcMethod: string | null;
  tool: string;
  linodeId: string | null;
  actorFingerprint: string | null;
  clientIp: string | null;
  status: number;
  statusClass: StatusClass;
  latencyMs: number;
  requestId: string;
  errorBody: string | null;
};

const MAX_ERROR_BODY_CHARS = 2000;

// Called before the downstream mcpServerHandler reads the body, so the clone
// still has an unconsumed stream by the time the final hook runs after it.
export default function lokiAuditLoggingInbound(
  request: ZuploRequest,
  context: ZuploContext,
  options: LokiAuditOptions,
): ZuploRequest {
  const start = Date.now();
  const bodyForLogging = request.clone();
  const authHeader = request.headers.get("authorization");

  context.addResponseSendingFinalHook(async (response) => {
    let jsonrpcMethod: string | null = null;
    let tool = "non-tool-call";
    let linodeId: string | null = null;

    try {
      const body = await bodyForLogging.json();
      jsonrpcMethod = typeof body?.method === "string" ? body.method : null;
      if (jsonrpcMethod === "tools/call") {
        tool = typeof body?.params?.name === "string" ? body.params.name : "unknown-tool";
        const args = body?.params?.arguments ?? {};
        const rawLinodeId = args?.pathParams?.linodeId;
        linodeId = rawLinodeId != null ? String(rawLinodeId) : null;
      } else if (jsonrpcMethod) {
        tool = jsonrpcMethod;
      }
    } catch {
      // non-JSON or empty body - leave the defaults above
    }

    const actorFingerprint = authHeader?.startsWith("Bearer ")
      ? await fingerprintToken(authHeader.slice("Bearer ".length))
      : null;

    const statusClass = classifyStatus(response.status);

    let errorBody: string | null = null;
    if (response.status >= 400) {
      try {
        errorBody = (await response.clone().text()).slice(0, MAX_ERROR_BODY_CHARS);
      } catch {
        errorBody = null;
      }
    }

    const entry: McpAuditEntry = {
      timestamp: new Date().toISOString(),
      jsonrpcMethod,
      tool,
      linodeId,
      actorFingerprint,
      clientIp: context.incomingRequestProperties.ip ?? null,
      status: response.status,
      statusClass,
      latencyMs: Date.now() - start,
      requestId: context.requestId,
      errorBody,
    };

    context.waitUntil(pushToLoki(entry, options, context));
  });

  return request;
}

function classifyStatus(status: number): StatusClass {
  if (status >= 200 && status < 300) return "2xx";
  if (status >= 300 && status < 400) return "3xx";
  if (status >= 400 && status < 500) return "4xx";
  if (status >= 500) return "5xx";
  return "unknown";
}

async function fingerprintToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 16);
}

async function pushToLoki(
  entry: McpAuditEntry,
  options: LokiAuditOptions,
  context: ZuploContext,
): Promise<void> {
  const nowNs = (Date.now() * 1_000_000).toString();
  const payload = {
    streams: [
      {
        stream: {
          app: "akamai-cloud-vm-mcp",
          tool: entry.tool,
          status_class: entry.statusClass,
        },
        values: [[nowNs, JSON.stringify(entry)]],
      },
    ],
  };

  try {
    const res = await fetch(options.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic " + btoa(`${options.username}:${options.password}`),
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      context.log.warn(`loki-audit-logging: push failed with status ${res.status}`);
    }
  } catch (err) {
    context.log.warn(`loki-audit-logging: push threw - ${err}`);
  }
}
