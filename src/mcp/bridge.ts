import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { readFileSync, existsSync } from "fs";
import path from "path";

// ── Types ────────────────────────────────────────────
interface McpServerConfig {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
}

interface McpConfig {
    mcpServers: Record<string, McpServerConfig>;
}

interface ConnectedServer {
    name: string;
    client: Client;
    tools: { name: string; description: string; inputSchema: any }[];
    headers?: Record<string, string>;
}

// ── State ────────────────────────────────────────────
const connectedServers: ConnectedServer[] = [];

// ── Load config ──────────────────────────────────────
function loadConfig(): McpConfig | null {
    // Check multiple config locations
    const paths = [
        path.join(process.cwd(), "mcp_config.json"),
        path.join(process.env.HOME ?? "", ".gemini", "antigravity", "mcp_config.json"),
    ];

    for (const p of paths) {
        if (existsSync(p)) {
            try {
                return JSON.parse(readFileSync(p, "utf-8"));
            } catch (e) {
                console.warn(`⚠️ Failed to parse MCP config at ${p}:`, e);
            }
        }
    }
    return null;
}

// ── Connect to a single stdio server ─────────────────
async function connectStdioServer(name: string, config: McpServerConfig): Promise<ConnectedServer | null> {
    if (!config.command) return null;

    try {
        const transport = new StdioClientTransport({
            command: config.command,
            args: config.args ?? [],
            env: config.env ? { ...process.env, ...config.env } as Record<string, string> : undefined,
        });

        const client = new Client({
            name: "gravity-claw",
            version: "1.0.0",
        }, {
            capabilities: {},
        });

        const connectTimeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`MCP [${name}] connect timed out after 10s`)), 10_000)
        );
        await Promise.race([client.connect(transport), connectTimeout]);

        const result = await client.listTools();
        const tools = (result.tools ?? []).map((t: any) => ({
            name: t.name,
            description: t.description ?? "",
            inputSchema: t.inputSchema ?? { type: "object", properties: {} },
        }));

        console.log(`✅ MCP [${name}]: ${tools.length} tools available`);
        for (const t of tools.slice(0, 5)) {
            console.log(`   🔧 ${t.name} — ${t.description.slice(0, 60)}`);
        }
        if (tools.length > 5) console.log(`   … and ${tools.length - 5} more`);

        return { name, client, tools };
    } catch (error) {
        console.warn(`⚠️ MCP [${name}] failed to connect:`, (error as Error).message);
        return null;
    }
}

// ── Connect to a URL-based server (SSE) ──────────────
async function connectUrlServer(name: string, config: McpServerConfig): Promise<ConnectedServer | null> {
    if (!config.url) return null;

    try {
        const url = new URL(config.url);
        const transport = new SSEClientTransport(url, {
            eventSourceInit: {
                headers: config.headers ?? {}
            } as unknown as EventSourceInit
        });

        const client = new Client({
            name: "gravity-claw",
            version: "1.0.0",
        }, {
            capabilities: {},
        });

        const connectTimeoutUrl = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`MCP [${name}] connect timed out after 10s`)), 10_000)
        );
        await Promise.race([client.connect(transport), connectTimeoutUrl]);

        const result = await client.listTools();
        const tools = (result.tools ?? []).map((t: any) => ({
            name: t.name,
            description: t.description ?? "",
            inputSchema: t.inputSchema ?? { type: "object", properties: {} },
        }));

        console.log(`✅ MCP [${name}]: ${tools.length} tools available (URL)`);
        for (const t of tools.slice(0, 5)) {
            console.log(`   🔧 ${t.name} — ${t.description.slice(0, 60)}`);
        }

        return { name, client, tools };
    } catch (error) {
        console.warn(`⚠️ MCP [${name}] failed to connect (URL):`, (error as Error).message);
        return null;
    }
}

// ── Initialize all MCP servers ───────────────────────
export async function initMcpServers(): Promise<void> {
    const config = loadConfig();
    if (!config || Object.keys(config.mcpServers).length === 0) {
        console.log("📡 No MCP servers configured");
        return;
    }

    console.log(`📡 Connecting to ${Object.keys(config.mcpServers).length} MCP server(s)…`);

    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
        let server: ConnectedServer | null = null;

        if (serverConfig.command) {
            server = await connectStdioServer(name, serverConfig);
        } else if (serverConfig.url) {
            server = await connectUrlServer(name, serverConfig);
        }

        if (server) {
            connectedServers.push(server);
        }
    }

    console.log(`📡 ${connectedServers.length} MCP server(s) connected`);
}

// ── Get all MCP tools as OpenAI-compatible schemas ───
export function getMcpToolSchemas(): { type: "function"; function: { name: string; description: string; parameters: any } }[] {
    const schemas: any[] = [];

    for (const server of connectedServers) {
        for (const tool of server.tools) {
            schemas.push({
                type: "function",
                function: {
                    name: `mcp_${server.name}_${tool.name}`,
                    description: `[MCP:${server.name}] ${tool.description}`,
                    parameters: tool.inputSchema,
                },
            });
        }
    }

    return schemas;
}

// ── Execute an MCP tool call ─────────────────────────
export async function executeMcpTool(fullName: string, args: Record<string, unknown>): Promise<string> {
    // fullName format: mcp_{serverName}_{toolName}
    const match = fullName.match(/^mcp_([^_]+)_(.+)$/);
    if (!match) return `Error: Invalid MCP tool name format: ${fullName}`;

    const [, serverName, toolName] = match;
    const server = connectedServers.find(s => s.name === serverName);
    if (!server) return `Error: MCP server "${serverName}" not connected`;

    try {
        const callToolTimeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), 30_000)
        );
        const result = await Promise.race([
            server.client.callTool({ name: toolName, arguments: args }),
            callToolTimeout,
        ]).catch((err: Error) => {
            if (err.message === "timeout") return "Error: MCP tool timed out after 30s";
            throw err;
        });

        if (typeof result === "string") return result;

        // Extract text from result content
        if (Array.isArray(result.content)) {
            return result.content
                .map((c: any) => c.text ?? JSON.stringify(c))
                .join("\n");
        }
        return JSON.stringify(result.content);
    } catch (error) {
        return `Error calling MCP tool "${toolName}" on "${serverName}": ${(error as Error).message}`;
    }
}

// ── Check if a tool name is an MCP tool ──────────────
export function isMcpTool(name: string): boolean {
    return name.startsWith("mcp_");
}

// ── Get connected server info ────────────────────────
export function getMcpStatus(): { name: string; toolCount: number }[] {
    return connectedServers.map(s => ({
        name: s.name,
        toolCount: s.tools.length,
    }));
}
