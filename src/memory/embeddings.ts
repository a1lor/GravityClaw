import OpenAI from "openai";

// ── Mistral embeddings client (free, OpenAI-compatible) ──
// We keep using Mistral for embeddings since they're free.
// Reading the key directly from env to avoid coupling with the main config.
const embeddingsClient = new OpenAI({
    baseURL: "https://api.mistral.ai/v1",
    apiKey: process.env.MISTRAL_API_KEY || "unused",
    timeout: 30_000, // avoid hanging the whole agent loop
});

export const EMBED_MODEL = "mistral-embed";
export const EMBED_DIMENSIONS = 1024;
const MAX_INPUT_CHARS = 8192; // ~2048 tokens, within Mistral's embed limit

// ── Generate a single embedding ───────────────────────
export async function embed(text: string): Promise<number[]> {
    if (!process.env.MISTRAL_API_KEY || process.env.MISTRAL_API_KEY === "unused") {
        return new Array(EMBED_DIMENSIONS).fill(0);
    }

    try {
        // Mistral's OpenAI-compatible embeddings endpoint accepts (model, input).
        // Adding extra params can cause 422s, so keep the payload minimal.
        const response = await embeddingsClient.embeddings.create({
            model: EMBED_MODEL,
            input: text.slice(0, MAX_INPUT_CHARS),
        });

        const result = response.data[0].embedding;
        return result;
    } catch (err) {
        throw err;
    }
}
