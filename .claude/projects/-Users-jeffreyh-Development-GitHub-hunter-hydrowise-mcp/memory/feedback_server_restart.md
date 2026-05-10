---
name: User restarts the MCP server
description: Don't kill or restart the hydrowise-mcp server process; the user does that themselves
type: feedback
---

The user restarts the MCP server themselves after builds — do not run `kill`, `pkill`, or background-launch `node dist/server.js` as part of the workflow.

**Why:** User explicitly corrected this ("i restart the server not you"). It also avoids the env-var sourcing dance required to start the server outside a TTY context.

**How to apply:** After a `npm run build`, stop at "build complete" and tell the user to restart the server. Do not attempt to manage the server process.
