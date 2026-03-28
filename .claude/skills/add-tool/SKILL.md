---
name: add-tool
description: Scaffold and register a new tool in src/tools/definitions.ts for GravityClaw. Pass the tool name and description as arguments.
disable-model-invocation: false
allowed-tools: Read, Edit, Glob
argument-hint: "[tool-name description]"
---

Scaffold and register a new tool in `src/tools/definitions.ts` for GravityClaw.

The tool name/description is: $ARGUMENTS

Steps:
1. Read `src/tools/definitions.ts` to understand the existing pattern (registerTool calls)
2. Design the tool:
   - Pick a snake_case name
   - Write a clear description (what it does, when the LLM should call it)
   - Define input parameters with types and descriptions
   - Implement the handler returning a string result
3. Add the new registerTool() block at the appropriate section in definitions.ts
4. If the tool needs a new import, add it
5. Show the user the final added block and confirm it follows the existing patterns

Rules:
- Handler must return a string (success message or error string)
- Always wrap async operations in try/catch returning "Error: ..." on failure
- Use dynamic imports (`await import(...)`) for heavy modules to keep startup fast
- Read profile values with `getProfileValue()` if the tool needs user context
