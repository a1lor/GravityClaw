import { db } from "./src/memory/db.js";
console.log("Checking DB connectivity...");
try {
    const row = db.prepare("SELECT COUNT(*) as c FROM conversations").get() as any;
    console.log("Conversation count:", row.c);
    const last = db.prepare("SELECT * FROM conversations ORDER BY id DESC LIMIT 1").get() as any;
    console.log("Last message:", last);
} catch (e) {
    console.error("DB check failed:", e);
}
