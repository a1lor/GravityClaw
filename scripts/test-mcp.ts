import { initMcpServers, getMcpStatus } from "../src/mcp/bridge.js";

async function test() {
    console.log("🚀 Testing MCP connections...");
    try {
        await initMcpServers();
    } catch (e) {
        console.error("❌ initMcpServers failed:", e);
    }
    const status = getMcpStatus();
    console.log("\n📊 MCP Status:");
    status.forEach(s => {
        console.log(`- ${s.name}: ${s.toolCount} tools available`);
    });
    
    if (status.some(s => s.name === "vercel" && s.toolCount > 0)) {
        console.log("\n✅ Vercel MCP is successfully connected!");
    } else {
        console.log("\n❌ Vercel MCP connection failed or no tools found.");
    }
}


test().catch(console.error);
