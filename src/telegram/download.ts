import fetch from "node-fetch";

// ── Download Telegram file to Buffer ─────────────────
export async function downloadTelegramFile(
    fileUrl: string,
): Promise<Buffer> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);
    let response: Awaited<ReturnType<typeof fetch>>;
    try {
        response = await fetch(fileUrl, { signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }
    if (!response.ok) {
        throw new Error(`Failed to download file from Telegram: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}
