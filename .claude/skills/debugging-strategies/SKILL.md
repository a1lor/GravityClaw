---
name: debugging-strategies
description: Systematically debug issues in GravityClaw — bot crashes, tool failures, LLM errors, DB issues — using structured root cause analysis. Pass a symptom or error description as an argument.
disable-model-invocation: false
allowed-tools: Read, Bash(tail *), Bash(grep *)
argument-hint: "[symptom or error description]"
---

Transform debugging from frustrating guesswork into systematic problem-solving.

## When to use
- Bot crashes or stops responding
- A tool call fails silently or returns wrong results
- LLM errors (OpenRouter timeouts, bad responses)
- Database issues (SQLite locks, missing rows)
- Gmail/job scraper not working
- Morning briefing not firing

## Debugging workflow

### Step 1: Capture the symptom
If `$ARGUMENTS` is provided, use it as the starting symptom. Otherwise ask.

- Check logs first: `tail -n 100 bot.log`
- Filter for errors: `grep -i "error\|exception\|fail\|undefined\|null" bot.log | tail -50`
- Check for the last crash: `grep -i "uncaught\|unhandled\|SIGTERM\|exit" bot.log | tail -20`

### Step 2: Form hypotheses
List 2-3 likely causes ranked by probability. Consider:
- **Environment**: missing env var, expired API key, network timeout
- **State**: stale SQLite data, corrupt conversation history, missing profile rows
- **Code**: unhandled promise rejection, wrong tool schema, type mismatch
- **External**: OpenRouter down, Telegram API rate limit, Pinecone quota

### Step 3: Narrow scope with binary search
Pick the most likely hypothesis and test it with a targeted check:

- **LLM issue**: look for `openrouter` or `openai` error lines in logs
- **DB issue**: run `sqlite3 data/memory.db "PRAGMA integrity_check;"` and check recent rows
- **Tool issue**: look for the tool name in logs to see if it was called and what it returned
- **Config issue**: verify the relevant env var is set in `.env`

### Step 4: Read the relevant code
Once you've narrowed the scope, read the relevant source file to trace the execution path. Key files:
- Agent loop: `src/agent/agent.ts`
- Tool execution: `src/tools/definitions.ts`
- Telegram handler: `src/telegram/telegram.ts`
- LLM client: `src/llm/llm.ts`
- DB layer: `src/memory/db.ts`

### Step 5: Verify the fix
After identifying and proposing a fix:
1. Explain exactly what was wrong and why
2. Show the fix
3. Describe how to verify it works (what to look for in logs, what to test in Telegram)