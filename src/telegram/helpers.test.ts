import { test } from "node:test";
import { strict as assert } from "node:assert";
import { dashboardButton } from "./keyboards.js";

test("dashboardButton returns undefined for localhost URL", () => {
  const result = dashboardButton("http://localhost:3200");
  assert.equal(result, undefined);
});

test("dashboardButton returns undefined for 127.0.0.1 URL", () => {
  const result = dashboardButton("http://127.0.0.1:3200");
  assert.equal(result, undefined);
});

test("dashboardButton returns webApp button for HTTPS URL", () => {
  const kb = dashboardButton("https://myapp.railway.app");
  assert.ok(kb !== undefined);
  const btn = kb.inline_keyboard[0][0] as any;
  assert.ok("web_app" in btn, "expected web_app button");
  assert.equal(btn.web_app.url, "https://myapp.railway.app/");
});

test("dashboardButton returns url button for public HTTP URL", () => {
  const kb = dashboardButton("http://myapp.example.com");
  assert.ok(kb !== undefined);
  const btn = kb.inline_keyboard[0][0] as any;
  assert.ok("url" in btn, "expected url button");
  assert.equal(btn.url, "http://myapp.example.com/");
});

test("dashboardButton appends path to HTTPS URL", () => {
  const kb = dashboardButton("https://myapp.railway.app", "/pipeline");
  assert.ok(kb !== undefined);
  const btn = kb.inline_keyboard[0][0] as any;
  assert.equal(btn.web_app.url, "https://myapp.railway.app/pipeline");
});

test("dashboardButton strips trailing slash from base before appending path", () => {
  const kb = dashboardButton("https://myapp.railway.app/", "/inbox");
  assert.ok(kb !== undefined);
  const btn = kb.inline_keyboard[0][0] as any;
  assert.equal(btn.web_app.url, "https://myapp.railway.app/inbox");
});

test("dashboardButton uses webApp for HTTPS and path defaults to /", () => {
  const kb = dashboardButton("https://myapp.railway.app");
  assert.ok(kb !== undefined);
  const btn = kb.inline_keyboard[0][0] as any;
  assert.equal(btn.web_app.url, "https://myapp.railway.app/");
});

test("dashboardButton appends token as query param when provided", () => {
  const kb = dashboardButton("https://myapp.railway.app", "/", "secret123");
  assert.ok(kb !== undefined);
  const btn = kb.inline_keyboard[0][0] as any;
  assert.equal(btn.web_app.url, "https://myapp.railway.app/?token=secret123");
});

test("dashboardButton appends token after path", () => {
  const kb = dashboardButton("https://myapp.railway.app", "/pipeline", "secret123");
  assert.ok(kb !== undefined);
  const btn = kb.inline_keyboard[0][0] as any;
  assert.equal(btn.web_app.url, "https://myapp.railway.app/pipeline?token=secret123");
});

test("dashboardButton omits token param when token is empty string", () => {
  const kb = dashboardButton("https://myapp.railway.app", "/", "");
  assert.ok(kb !== undefined);
  const btn = kb.inline_keyboard[0][0] as any;
  assert.equal(btn.web_app.url, "https://myapp.railway.app/");
});
