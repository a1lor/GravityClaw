---
name: restart
description: Restart the GravityClaw bot process cleanly using pm2.
disable-model-invocation: false
allowed-tools: Bash(pm2 *), Bash(sleep *)
---

Restart the GravityClaw bot process cleanly using pm2.

Steps:
1. Check if pm2 process "gravityclaw" exists: `pm2 describe gravityclaw 2>/dev/null || echo "Process not found"`
2. If process exists, restart it: `pm2 restart gravityclaw`
3. If process doesn't exist, start it: `pm2 start dist/index.js --name gravityclaw`
4. Wait 3 seconds for startup: `sleep 3`
5. Show pm2 status and recent logs: `pm2 status && pm2 logs gravityclaw --lines 30 --nostream`
6. Confirm the bot is online (look for "Gravity Claw online" in the output)

Note: This assumes the project has been built (`npm run build`). If restarting fails, check:
- That `npm run build` has been run successfully
- That pm2 is installed globally (`npm install -g pm2`)

If the bot fails to start, show the full log and identify the error.
