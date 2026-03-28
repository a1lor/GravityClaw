import { InlineKeyboard } from "grammy";

function buildUrl(baseUrl: string, path: string, token: string): string {
  const base = baseUrl.replace(/\/$/, "") + path;
  return token ? `${base}${base.includes("?") ? "&" : "?"}token=${token}` : base;
}

/**
 * Builds a dashboard deep-link button for Telegram inline keyboards.
 * - HTTPS base URL → webApp button (Telegram Mini App)
 * - Public HTTP    → url button (opens in browser)
 * - Localhost / 127.0.0.1 → undefined (Telegram rejects these URLs)
 *
 * @param baseUrl  The dashboard root URL (e.g. config.webappUrl)
 * @param path     The route to deep-link to (defaults to "/")
 * @param token    Optional DASHBOARD_TOKEN appended as ?token= for auto-login
 */
export function dashboardButton(baseUrl: string, path = "/", token = ""): InlineKeyboard | undefined {
  const isLocalhost = baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1");
  if (isLocalhost) return undefined;
  const url = buildUrl(baseUrl, path, token);
  return new InlineKeyboard().url("📊 Open Dashboard", url);
}

/**
 * Appends a dashboard deep-link row to an existing InlineKeyboard (mutates in place).
 * No-op if the URL is localhost or empty.
 *
 * @param token  Optional DASHBOARD_TOKEN appended as ?token= for auto-login
 */
export function appendDashboardRow(keyboard: InlineKeyboard, baseUrl: string, path = "/", token = ""): void {
  const isHttps = baseUrl.startsWith("https://");
  const isLocalhost = baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1");
  if (!baseUrl || (isLocalhost && !isHttps)) return;
  const url = buildUrl(baseUrl, path, token);
  keyboard.row();
  keyboard.url("📊 View in Dashboard", url);
}
