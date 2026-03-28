import { getAuthenticatedClient } from "./src/tools/gmail/auth.js";
import { google } from "googleapis";

async function test() {
    console.log("Testing Gmail connection...");
    try {
        const client = getAuthenticatedClient();
        if (!client) {
            console.log("❌ No authenticated client. Tokens missing or invalid.");
            return;
        }
        const gmail = google.gmail({ version: "v1", auth: client });
        const res = await gmail.users.getProfile({ userId: "me" });
        console.log("✅ Success! Authenticated as:", res.data.emailAddress);
    } catch (err: any) {
        console.error("❌ Error connecting to Gmail:", err.message);
    }
}

test();
