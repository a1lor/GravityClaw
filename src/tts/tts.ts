import fetch from "node-fetch";
import { config } from "../config.js";

// ── TTS client (ElevenLabs) ──────────────────────────

/**
 * Generate speech from text using the ElevenLabs API
 * @param text The text to convert to speech
 * @returns A buffer containing the audio data (MP3)
 */
export async function generateSpeech(text: string): Promise<Buffer> {
    if (!config.elevenlabsApiKey) {
        throw new Error("ElevenLabs API key is missing. Cannot generate voice.");
    }

    // Default to a known good voice (e.g., "Rachel" if undefined)
    const voiceId = config.elevenlabsVoiceId || "21m00Tcm4TlvDq8ikWAM";
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);
    let response: Awaited<ReturnType<typeof fetch>>;
    try {
        response = await fetch(url, {
            method: "POST",
            headers: {
                "Accept": "audio/mpeg",
                "Content-Type": "application/json",
                "xi-api-key": config.elevenlabsApiKey,
            },
            body: JSON.stringify({
                text,
                model_id: "eleven_multilingual_v2",
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.5,
                },
            }),
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeoutId);
    }

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs API error (${response.status}): ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}
