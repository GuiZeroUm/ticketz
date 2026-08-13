// Package exports use explicit .js paths even when compiled from TypeScript.
// eslint-disable-next-line import/no-unresolved
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
// eslint-disable-next-line import/no-unresolved
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import McpAudit from "../../models/McpAudit";
import * as McpDataService from "../../services/McpServices/McpDataService";
import { createServer } from "../../services/McpServices/McpServerService";

const auth = {
  grantId: "00000000-0000-4000-8000-000000000001",
  userId: 7,
  companyId: 42,
  clientId: "ticketz_client",
  scopes: ["conversations:read", "reports:read"],
  expiresAt: Date.now() + 60_000
};

describe("MCP server tools", () => {
  it("announces all six tools and passes company-scoped auth to data reads", async () => {
    jest.spyOn(McpAudit, "create").mockResolvedValue({} as McpAudit);
    jest.spyOn(McpDataService, "getTicketzContext").mockResolvedValue({
      tenant: { id: auth.companyId, name: "Empresa", slug: "empresa" }
    } as never);
    jest.spyOn(McpDataService, "listConversations").mockResolvedValue({
      conversations: [],
      coverage: { returnedConversations: 0 }
    } as never);
    jest.spyOn(McpDataService, "readConversation").mockResolvedValue({
      conversation: { id: 321 },
      messages: [],
      coverage: { returnedMessages: 0 }
    } as never);

    const server = createServer(auth);
    const client = new Client({ name: "ticketz-test", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const listed = await client.listTools();
    expect(listed.tools.map(tool => tool.name).sort()).toEqual(
      [
        "get_attendant_metrics",
        "get_conversation_stats",
        "get_ticketz_context",
        "list_conversations",
        "read_conversation",
        "read_conversations"
      ].sort()
    );

    await client.callTool({ name: "get_ticketz_context", arguments: {} });
    await client.callTool({ name: "list_conversations", arguments: {} });
    await client.callTool({
      name: "read_conversation",
      arguments: { ticket_id: 321 }
    });

    expect(McpDataService.getTicketzContext).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 42 })
    );
    expect(McpDataService.listConversations).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 42 }),
      {}
    );
    expect(McpDataService.readConversation).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 42 }),
      { ticket_id: 321 }
    );

    await client.close();
    await server.close();
    jest.restoreAllMocks();
  });
});
