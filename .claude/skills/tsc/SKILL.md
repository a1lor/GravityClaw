---
name: tsc
description: Run the TypeScript compiler check on GravityClaw without emitting files. Use when checking for type errors after code changes.
disable-model-invocation: false
allowed-tools: Bash(npx tsc *)
---

Run the TypeScript compiler check on the GravityClaw project without emitting files.

Steps:
1. Run `npx tsc --noEmit 2>&1` from the project root
2. If there are errors, show them grouped by file with the line numbers
3. If there are no errors, confirm "✅ No TypeScript errors"
4. Ignore errors in `src/mcp/bridge.ts` related to `EventSourceInit` — this is a known upstream type issue that doesn't affect runtime

After showing errors, briefly explain what each unique error type means and suggest the fix.
