import { db } from "./memory/db.js";

const buffer: string[] = [];
const MAX_LINES = 200;

const stmtInsertLog = db.prepare("INSERT INTO logs (t, l) VALUES (?, ?)");

const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

function capture(level: string, args: unknown[]): void {
  const line = args
    .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
    .join(" ");
  const formatted = `[${level.toUpperCase()}] ${new Date().toISOString()} ${line}`;
  buffer.push(formatted);
  if (buffer.length > MAX_LINES) buffer.shift();
  try {
    stmtInsertLog.run(level, formatted);
  } catch { /* db write failures are non-fatal */ }
}

export function initLogger(): void {
  console.log = (...args: unknown[]) => {
    capture("log", args);
    originalLog.apply(console, args);
  };
  console.error = (...args: unknown[]) => {
    capture("error", args);
    originalError.apply(console, args);
  };
  console.warn = (...args: unknown[]) => {
    capture("warn", args);
    originalWarn.apply(console, args);
  };
}

export function getConsoleBuffer(): string[] {
  return [...buffer];
}

export { originalLog, originalError, originalWarn };
