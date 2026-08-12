# Akamai Cloud VM MCP

An MCP server, built on [Zuplo](https://zuplo.com), that exposes Linode (Akamai Cloud Computing) Compute Instance management as tools for MCP clients such as Claude Desktop. Each MCP client brings its own Linode Personal Access Token (PAT) — this gateway never stores or has access to your credentials; it just forwards your `Authorization` header through to `api.linode.com`.

## Tools exposed

Scoped to Compute Instance (VM) lifecycle management, not the full Linode API (a smaller, curated tool set keeps AI tool selection reliable):

| Tool | Linode API operation |
| --- | --- |
| `getLinodeInstances` | List instances |
| `createLinodeInstance` | Create an instance |
| `getLinodeInstance` | View instance details |
| `updateLinodeInstance` | Update label/tags |
| `deleteLinodeInstance` | Delete an instance |
| `bootLinodeInstance` | Boot |
| `rebootLinodeInstance` | Reboot |
| `shutdownLinodeInstance` | Shut down |
| `resizeLinodeInstance` | Resize to a different plan |
| `cloneLinodeInstance` | Clone to a new or existing instance |

## Project structure

This is a standard [Zuplo](https://zuplo.com) API gateway project — everything below `config/` and `modules/` is Zuplo's own project layout, not custom to this repo:

| Path | Role |
| --- | --- |
| `config/routes.oas.json` | The single source of truth for routing. An OpenAPI document where every path/operation is a route; each carries an `x-zuplo-route` extension describing its handler. This is where both the Linode proxy routes *and* the `/mcp` MCP-server route are defined. |
| `config/policies.json` | Named, reusable policy instances (auth, rate limiting, transforms, etc.) that routes can reference by name. Empty here — this project intentionally uses no inbound policies, since auth is passed straight through by clients. |
| `modules/zuplo.runtime.ts` | Gateway-wide setup that runs once at boot: plugin registration (OpenTelemetry tracing, the MCP Gateway plugin scaffold) rather than per-route logic. |
| `modules/*.ts` | Custom TypeScript request handlers, referenced from `routes.oas.json` by module path when a route needs code instead of a declarative proxy (`urlForwardHandler`). Not used for the Linode routes in this project — they're pure config. |
| `docs/` | An optional [Zudoku](https://zuplo.com/docs/dev-portal/zudoku/configuration/overview) developer portal (its own `npm` workspace) that renders `config/routes.oas.json` as browsable API reference docs. Not required for the MCP server itself. |

## Deploy your own copy

This repo is meant to be forked and deployed to your own Zuplo account, not used against a shared instance run by someone else — your Linode PAT flows through whichever Zuplo project is running this gateway, so it should be one you control.

1. Fork this repository.
2. In the [Zuplo portal](https://portal.zuplo.com), create a new project and connect it to your fork.
3. No environment variables or secrets need to be configured — auth is supplied per-request by the connecting MCP client (see below).
4. Deploy an environment from the portal and note its URL. Your MCP endpoint is `https://<your-project>.zuplo.app/mcp`.

## Connect from Claude Desktop

1. Create a Linode Personal Access Token (Linode Cloud Manager → *My Profile* → *API Tokens* → *Create a Personal Access Token*) with at least `linodes:read_write` scope.
2. Add an entry to `claude_desktop_config.json` using [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) to bridge Claude Desktop to the remote MCP endpoint with your token as a header:

   ```json
   {
     "mcpServers": {
       "akamai-cloud-vm": {
         "command": "npx",
         "args": [
           "-y",
           "mcp-remote",
           "https://<your-project>.zuplo.app/mcp",
           "--header",
           "Authorization: Bearer ${LINODE_TOKEN}"
         ],
         "env": {
           "LINODE_TOKEN": "<your Linode Personal Access Token>"
         }
       }
     }
   }
   ```

3. Restart Claude Desktop.

## Local development

```bash
npm install
npm run dev
```

Starts the gateway at `http://localhost:9000` (route designer at `:9100`, docs at `:9200`). Requires Node.js >= 24 for the Zuplo CLI.

## Extending

All routing lives in `config/routes.oas.json`. To expose another Linode API operation as an MCP tool:

1. Add it as a new OpenAPI path/operation with a unique `operationId`, an `x-zuplo-route.handler` of `urlForwardHandler` pointed at `baseUrl: "https://api.linode.com/v4"`, and `x-zuplo-route.mcp.type: "tool"`.
2. Add a matching `{ "file": "./config/routes.oas.json", "id": "<operationId>" }` entry to the `/mcp` route's `mcpServerHandler` `operations` array.

See [Linode's API reference](https://www.linode.com/docs/api/) for other available resources (Volumes, Domains, Images, LKE, NodeBalancers, Databases, etc.).
