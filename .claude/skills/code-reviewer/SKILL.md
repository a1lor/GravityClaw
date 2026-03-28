---
name: code-reviewer
description: Review GravityClaw code changes for security, correctness, TypeScript quality, and async patterns before committing. Pass a file path or describe what was changed.
disable-model-invocation: false
allowed-tools: Read, Glob, Grep
argument-hint: "[file path or description of change]"
---

Perform a structured code review focused on GravityClaw's specific patterns and risk areas.

If `$ARGUMENTS` is provided, review that file or area. Otherwise review recently changed files.

## Review checklist

### 1. Security
- No secrets or API keys hardcoded — all config via `src/config.ts`
- Shell commands in `src/tools/shell.ts` require user Telegram approval before execution
- SQL queries use parameterized statements (better-sqlite3 `.prepare()`)
- Telegram user ID whitelist (`ALLOWED_USER_IDS`) enforced before any action
- No user input passed directly to shell or eval

### 2. TypeScript correctness
- No `any` types without justification
- Async functions have proper `try/catch` or propagate errors intentionally
- Tool definitions in `src/tools/definitions.ts` have accurate JSON schemas (types match runtime behavior)
- LLM response parsing handles missing/null fields gracefully

### 3. Async & error handling
- Promises not fire-and-forget unless intentional (background tasks like fact extraction are acceptable)
- OpenRouter calls handle rate limits and timeouts (check `src/llm/llm.ts` retry logic)
- SQLite operations use synchronous `better-sqlite3` API correctly (no mixing with async)
- Pinecone/Gmail/scraper failures degrade gracefully — bot keeps running

### 4. Agent & tool patterns
- New tools registered in `src/tools/definitions.ts` with clear `description` (the LLM reads this)
- Tool results truncated to avoid blowing context window (check 1000-char limit pattern)
- Tool schemas are precise — avoid overly broad types that cause hallucination
- No tool should have side effects that can't be undone without informing the user

### 5. Telegram-specific
- Messages > 4096 chars are split before sending
- Inline keyboard callbacks are registered and handled in `src/telegram/telegram.ts`
- Error responses sent back to user — no silent failures visible as "bot not responding"

### 6. Code quality
- Module stays focused — no new concerns added to existing files without reason
- ESM imports used (`import`/`export`), no `require()`
- Configuration goes in `src/config.ts`, not scattered in files
- No dead code or commented-out blocks left behind

## Output format
For each issue found:
- **Severity**: Critical / High / Medium / Low
- **Location**: file:line
- **Issue**: what's wrong
- **Fix**: concrete suggestion or corrected code snippet

End with a summary: pass / needs fixes, and the top 1-2 things to address.
