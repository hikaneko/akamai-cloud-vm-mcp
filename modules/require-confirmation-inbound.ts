import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

/**
 * Blocks destructive operations unless the caller's request body includes
 * `confirm: true`. The tool's input schema documents this requirement so an
 * MCP client is expected to ask the end user before setting it - this policy
 * is the server-side enforcement of that, independent of client behavior.
 */
export default async function requireConfirmationInbound(
  request: ZuploRequest,
  context: ZuploContext,
  _options: unknown,
  policyName: string,
): Promise<ZuploRequest | Response> {
  let body: Record<string, unknown> = {};
  if (request.headers.get("content-length") !== "0") {
    try {
      body = (await request.json()) ?? {};
    } catch {
      body = {};
    }
  }

  if (body.confirm !== true) {
    context.log.warn(
      `${policyName}: blocked ${request.method} ${new URL(request.url).pathname} - missing confirm: true`,
    );
    return new Response(
      JSON.stringify({
        error: "confirmation_required",
        message:
          "This is a destructive operation. Confirm with the user first, then retry this tool call with `confirm: true` in the request body.",
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  context.log.info(
    `${policyName}: confirmed ${request.method} ${new URL(request.url).pathname}`,
  );

  // Linode's API doesn't know about `confirm` - strip it before forwarding.
  const { confirm: _confirm, ...upstreamBody } = body;
  const hasRemainingFields = Object.keys(upstreamBody).length > 0;
  return new ZuploRequest(request, {
    body: hasRemainingFields ? JSON.stringify(upstreamBody) : undefined,
  });
}
