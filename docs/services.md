# Services

The integration provides services to interact with OpenCode sessions.

## opencode.send_prompt

Send a text prompt to an OpenCode session.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `session_id` | Yes | Target session ID (e.g., `ses_abc123`) |
| `text` | Yes | The prompt text |
| `agent` | No | Specific agent to use |

### Example

```yaml
service: opencode.send_prompt
data:
  session_id: ses_abc123
  text: "Fix the TypeScript errors in src/index.ts"
  agent: code
```

### Developer Tools

You can test this in Developer Tools > Services.

## opencode.respond_permission

Respond to a pending permission request.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `session_id` | Yes | Session with the pending permission |
| `permission_id` | Yes | ID of the permission request |
| `response` | Yes | `once`, `always`, or `reject` |

### Response Options

| Response | Effect |
|----------|--------|
| `once` | Allow this specific action only |
| `always` | Create a rule to auto-approve matching actions |
| `reject` | Deny the action |

### Example

```yaml
service: opencode.respond_permission
data:
  session_id: ses_abc123
  permission_id: perm_xyz789
  response: once
```

## opencode.get_history

Request conversation history for a session.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `session_id` | Yes | Session to get history for |
| `since` | No | ISO timestamp to filter messages after |

### Example

```yaml
service: opencode.get_history
data:
  session_id: ses_abc123
```

The response is sent via the `opencode_history_response` event.

## opencode.get_agents

Request the list of available agents.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `session_id` | Yes | Any active session ID |

### Example

```yaml
service: opencode.get_agents
data:
  session_id: ses_abc123
```

The response is sent via the `opencode_agents_response` event.

## opencode.abort_session

Abort the current operation in a session.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `session_id` | Yes | Session to abort |

### Example

```yaml
service: opencode.abort_session
data:
  session_id: ses_abc123
```
