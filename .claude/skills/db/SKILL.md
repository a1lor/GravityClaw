---
name: db
description: Query the GravityClaw SQLite database. Shows a stats snapshot by default. Pass a raw SQL query as argument to run it directly.
disable-model-invocation: false
allowed-tools: Bash(sqlite3 *)
argument-hint: "[SQL query]"
---

Query the GravityClaw SQLite database at `data/memory.db` and show a stats snapshot.

If $ARGUMENTS is provided, run it as a raw SQL query and show the results.
Example: `/db SELECT * FROM memories ORDER BY id DESC LIMIT 5`

Otherwise, show this summary by running each query with `sqlite3 data/memory.db "<query>"` and formatting the output as a table:
- Total conversations: `SELECT COUNT(*) FROM conversations`
- Total memories: `SELECT COUNT(*) FROM memories`
- Total job postings tracked: `SELECT COUNT(*) FROM job_postings`
- Applied jobs: `SELECT COUNT(*) FROM job_postings WHERE applied_at IS NOT NULL`
- Total applications: `SELECT COUNT(*) FROM applications`
- Total job emails: `SELECT COUNT(*) FROM job_emails`
- Today's LLM cost: `SELECT ROUND(SUM(cost_usd),4) FROM usage_log WHERE date(created_at)=date('now')`
- Profile keys set: `SELECT key FROM profile`

Show each result clearly labelled.
