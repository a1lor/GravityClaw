import fs from "fs";
import path from "path";
import process from "process";

const src = path.resolve(process.cwd(), "data", "memory.db");
const dst = path.resolve(process.cwd(), "data", "db_seed.sqlite");

try {
    const data = fs.readFileSync(src);
    fs.writeFileSync(dst, data);
    console.log("Memory DB copied to db_seed.sqlite");
} catch (e) {
    console.error("Failed to copy:", e);
}
