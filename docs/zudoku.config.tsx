import type { ZudokuConfig } from "zudoku";

/**
 * Developer Portal Configuration
 * For more information, see:
 * https://zuplo.com/docs/dev-portal/zudoku/configuration/overview
 */
const config: ZudokuConfig = {
  site: {
    title: "Akamai Cloud VM MCP",
  },
  metadata: {
    title: "Akamai Cloud VM MCP",
    description: "MCP server exposing Linode Compute Instance lifecycle management.",
  },
  navigation: [
    {
      type: "category",
      label: "Documentation",
      items: [
        {
          type: "doc",
          file: "overview",
          label: "Overview",
        },
        {
          type: "doc",
          file: "connect-claude-desktop",
          label: "Connect from Claude Desktop",
        },
      ],
    },
    {
      type: "link",
      to: "/api",
      label: "API Reference",
    },
  ],
  redirects: [{ from: "/", to: "/api" }],
  apis: [
    {
      type: "file",
      input: "../config/routes.oas.json",
      path: "api",
    },
  ],
  // No inbound auth on this gateway — each MCP client supplies its own
  // Linode Personal Access Token via Authorization: Bearer passthrough.
  // Auth0 login and API-key issuance don't correspond to anything real here.
  apiKeys: {
    enabled: false,
  },
  plugins: [],
};

export default config;
