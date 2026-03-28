import OpenAI from "openai";
import { config } from "../config.js";

// ── STT client (Groq Whisper, OpenAI-compatible) ─────
const sttClient = new OpenAI({
    baseURL: "https://api.groq.com/openai/v1",
    apiKey: config.groqApiKey,
});

// ── Transcribe audio buffer ──────────────────────────
export async function transcribeAudio(
    audioBuffer: Buffer,
    filename: string = "voice.ogg",
): Promise<string> {
    const file = new File([new Uint8Array(audioBuffer)], filename, { type: "audio/ogg" });

    const transcription = await sttClient.audio.transcriptions.create({
        model: "whisper-large-v3",
        file,
        language: "en",
    }, { signal: AbortSignal.timeout(20_000) });

    const text = transcription.text.trim();
    return text || "[empty audio]";
}
