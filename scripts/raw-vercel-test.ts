import fetch from "node-fetch";

async function testVercel() {
    const url = "https://mcp.vercel.com/api/mcp";
    const token = process.env.VERCEL_MCP_TOKEN;
    if (!token) {
        throw new Error("Missing env var VERCEL_MCP_TOKEN");
    }
    
    console.log(`🔗 Testing Vercel MCP at ${url}...`);
    
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json",
                "Accept": "application/json, text/event-stream"
            },
            body: JSON.stringify({
                jsonrpc: "2.0",
                method: "listTools",
                params: {},
                id: 1
            })
        });
        
        console.log(`📡 Status: ${res.status} ${res.statusText}`);
        const text = await res.text();
        console.log(`📄 Response: ${text.slice(0, 500)}`);
        
        if (res.ok) {
            console.log("\n✅ SUCCESS: The token and URL are valid and the server is responding!");
        } else {
            console.log("\n❌ FAILED: The server returned an error.");
        }
    } catch (e) {
        console.error("❌ ERROR:", e);
    }
}

testVercel();
