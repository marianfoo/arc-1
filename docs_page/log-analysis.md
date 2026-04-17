# ARC-1 Log Analysis Guide

## Enabling File Logging

Set the `ARC1_LOG_FILE` environment variable to enable JSON line audit logging:

```bash
# Local development
ARC1_LOG_FILE=/tmp/arc1-audit.jsonl npm run dev

# Docker
docker run -v /data/logs:/logs -e ARC1_LOG_FILE=/logs/arc1-audit.jsonl ghcr.io/marianfoo/arc-1

# BTP Cloud Foundry (in manifest.yml)
env:
  ARC1_LOG_FILE: /tmp/arc1-audit.jsonl
```

## Log Levels

Control stderr verbosity with `ARC1_LOG_LEVEL`:

```bash
ARC1_LOG_LEVEL=debug  # Show everything (HTTP requests, CSRF fetches)
ARC1_LOG_LEVEL=info   # Default — tool calls, auth events
ARC1_LOG_LEVEL=warn   # Only warnings and errors
ARC1_LOG_LEVEL=error  # Only errors
```

The file sink always receives ALL events regardless of stderr level.

## Event Types

| Event | Level | Description |
|-------|-------|-------------|
| `tool_call_start` | info | MCP tool call received |
| `tool_call_end` | info/error | Tool call completed (with status, duration, error details) |
| `http_request` | debug/warn | HTTP request to SAP ADT |
| `http_csrf_fetch` | debug | CSRF token fetch |
| `auth_scope_denied` | warn | Tool blocked by insufficient auth scope |
| `auth_pp_created` | info/error | Per-user ADT client created via principal propagation |
| `safety_blocked` | warn | Operation blocked by safety system |
| `server_start` | info | ARC-1 server started |
| `elicitation_sent` | info | Elicitation prompt sent to client |
| `elicitation_response` | info | User response to elicitation |

## Analyzing Logs with jq

### Recent Errors

```bash
# All errors in the last hour
jq 'select(.level == "error")' arc1-audit.jsonl

# Failed tool calls with error details
jq 'select(.event == "tool_call_end" and .status == "error")' arc1-audit.jsonl

# Failed tool calls grouped by error class
jq -s '[.[] | select(.event == "tool_call_end" and .status == "error")] | group_by(.errorClass) | map({errorClass: .[0].errorClass, count: length})' arc1-audit.jsonl
```

### Bad/Wrong Tool Calls (for improving LLM feedback)

```bash
# Tool calls with unknown types (LLM sent wrong type parameter)
jq 'select(.event == "tool_call_end" and .status == "error" and (.errorMessage | contains("Unknown")))' arc1-audit.jsonl

# Tool calls blocked by safety (LLM tried a blocked operation)
jq 'select(.event == "tool_call_end" and .errorClass == "AdtSafetyError")' arc1-audit.jsonl

# Auth scope denials (LLM called a tool the user can't access)
jq 'select(.event == "auth_scope_denied")' arc1-audit.jsonl

# All error messages — useful to find patterns in LLM mistakes
jq -s '[.[] | select(.event == "tool_call_end" and .status == "error") | .errorMessage] | group_by(.) | map({message: .[0], count: length}) | sort_by(-.count)' arc1-audit.jsonl
```

### Slow Operations

```bash
# Tool calls taking >5 seconds
jq 'select(.event == "tool_call_end" and .durationMs > 5000)' arc1-audit.jsonl

# HTTP requests taking >10 seconds
jq 'select(.event == "http_request" and .durationMs > 10000)' arc1-audit.jsonl

# Average duration by tool
jq -s '[.[] | select(.event == "tool_call_end")] | group_by(.tool) | map({tool: .[0].tool, avgMs: (map(.durationMs) | add / length | round), count: length})' arc1-audit.jsonl
```

### Correlating Events by Request ID

Every tool call generates a unique `requestId` (e.g., `REQ-42`). All HTTP requests made during that tool call share the same ID:

```bash
# Trace a specific tool call through all its HTTP requests
jq 'select(.requestId == "REQ-42")' arc1-audit.jsonl

# Find tool calls that made many HTTP requests (potential performance issue)
jq -s '[.[] | select(.event == "http_request")] | group_by(.requestId) | map({requestId: .[0].requestId, httpCalls: length}) | sort_by(-.httpCalls) | .[:10]' arc1-audit.jsonl
```

### HTTP-Level Analysis

```bash
# Failed HTTP requests (4xx/5xx)
jq 'select(.event == "http_request" and .statusCode >= 400)' arc1-audit.jsonl

# HTTP requests with error bodies (SAP error messages)
jq 'select(.event == "http_request" and .errorBody != null)' arc1-audit.jsonl

# Most common ADT paths called
jq -s '[.[] | select(.event == "http_request") | .path] | group_by(.) | map({path: .[0], count: length}) | sort_by(-.count) | .[:10]' arc1-audit.jsonl
```

### User Activity

```bash
# Tool calls per user
jq -s '[.[] | select(.event == "tool_call_start" and .user != null)] | group_by(.user) | map({user: .[0].user, calls: length})' arc1-audit.jsonl

# What tools a specific user called
jq 'select(.event == "tool_call_start" and .user == "john.doe@company.com")' arc1-audit.jsonl
```

## BTP Audit Log Service

When deployed on BTP with the Audit Log Service premium plan bound, ARC-1 automatically sends audit events to the BTP Audit Log Viewer. Events are categorized as:

- **security-events**: auth failures, scope denials, safety blocks
- **data-accesses**: tool calls that read SAP data (SAPRead, SAPSearch, SAPQuery)
- **data-modifications**: tool calls that write data (SAPWrite, SAPManage)
- **configuration-changes**: transport and activation operations (SAPTransport, SAPActivate)

View these in the BTP cockpit under **Instances and Subscriptions > Audit Log Viewer**.

## Docker Volume Mount Example

```bash
# Run with persistent log file
docker run -d \
  -v /data/arc1-logs:/logs \
  -e ARC1_LOG_FILE=/logs/audit.jsonl \
  -e SAP_URL=http://sap:50000 \
  -e SAP_USER=admin \
  -e SAP_PASSWORD=secret \
  ghcr.io/marianfoo/arc-1

# Tail logs in real-time
tail -f /data/arc1-logs/audit.jsonl | jq .

# Watch for errors only
tail -f /data/arc1-logs/audit.jsonl | jq 'select(.level == "error")'
```
