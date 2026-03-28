# Gravity Claw — Tool Registry

Every tool the agent can call lives in this directory. They're registered in `definitions.ts` and exposed to the LLM automatically.

---

## 🔧 Utility Tools

| Tool | File | Description |
|------|------|-------------|
| `ping` | `definitions.ts` | Returns "pong". Used to test tool calling. |
| `current_time` | `definitions.ts` | Returns the current date and time in ISO format. |
| `speak` / `voice` | `definitions.ts` | Sends a voice message to the user via ElevenLabs TTS. |
| `get_dashboard_url` | `definitions.ts` | Returns the URL for the local analytics dashboard. |

## 🧠 Memory Tools (SQLite + Vector)

| Tool | File | Description |
|------|------|-------------|
| `save_memory` | `definitions.ts` → `../memory/` | Save a fact or preference with automatic similarity check and vector sync. |
| `search_memories` | `definitions.ts` → `../memory/` | Search stored SQLite memories by keyword. |
| `list_memories` | `definitions.ts` → `../memory/` | List recently accessed memories. |
| `delete_memory` | `definitions.ts` → `../memory/` | Delete a memory by its numeric ID. |

## 📝 Note Tools (Markdown)

| Tool | File | Description |
|------|------|-------------|
| `create_note` | `definitions.ts` → `../memory/markdown.ts` | Create a new persistent Markdown note. |
| `read_note` | `definitions.ts` → `../memory/markdown.ts` | Read the full content of a note by name. |
| `list_notes` | `definitions.ts` → `../memory/markdown.ts` | List all saved Markdown notes. |
| `search_notes` | `definitions.ts` → `../memory/markdown.ts` | Search note contents for a keyword. |
| `delete_note` | `definitions.ts` → `../memory/markdown.ts` | Delete a note by name. |

## 📧 Gmail & Job Search

| Tool | File | Description |
|------|------|-------------|
| `check_emails` | `gmail/checker.ts` | Check for job-related emails in the last 24h. |
| `sync_gmail` | `gmail/checker.ts` | Deep scan Gmail for job applications (last 30 days). |
| `send_email` | `gmail/sender.ts` | Send an email on the user's behalf. |
| `apply_to_job` | `jobs/apply.ts` | Automatic scraping, cover letter generation, and CRM logging. |
| `rank_job` | `jobs/fetcher.ts` | AI ranking (1-10) of a job against user's profile. |
| `list_pipeline` | `jobs/crm.ts` | Show a summary of the application pipeline. |
| `get_pipeline_details`| `jobs/crm.ts` | List jobs grouped by status (Interview, Applied, etc.). |
| `update_job_status` | `jobs/tracker.ts` | Manually move a job through the pipeline. |
| `prepare_interview` | `definitions.ts` | Generate tailored questions/answers for a specific role. |
| `generate_cover_letter`| `definitions.ts` | Generate a professional cover letter from job context. |
| `generate_french_outreach`| `definitions.ts` | Generate personalized French LinkedIn messages. |

## 🗞️ News & Intelligence

| Tool | File | Description |
|------|------|-------------|
| `get_ai_news` | `news.ts` | Fetch a curated AI news digest with read-time estimates. |
| `shell` | `shell.ts` | Execute a shell command (requires manual approval). |

---

## How to add a new tool

```ts
// In definitions.ts
registerTool(
    "my_tool_name",
    "Human-readable description for the LLM.",
    {
        type: "object",
        properties: {
            param1: { type: "string", description: "..." },
        },
        required: ["param1"],
    },
    async (input) => {
        // Your logic here
        return "result string";
    },
);
```
