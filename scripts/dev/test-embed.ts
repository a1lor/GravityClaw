import { embed } from "./src/memory/embeddings.js";
import dotenv from "dotenv";
dotenv.config();

async function test() {
    const v = await embed("test");
    console.log("Dimension:", v.length);
    console.log("Vector sample:", v.slice(0, 5));
}
test();
