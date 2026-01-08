# Entities

Each OpenCode session creates a device in Home Assistant with the following entities.

## Sensors

| Entity | Description |
|--------|-------------|
| `sensor.*_state` | Session state: `idle`, `working`, `waiting_permission`, `error` |
| `sensor.*_session` | Session title |
| `sensor.*_model` | Current AI model (e.g., `anthropic/claude-sonnet-4-20250514`) |
| `sensor.*_current_tool` | Currently executing tool |
| `sensor.*_input_tokens` | Total input tokens used |
| `sensor.*_output_tokens` | Total output tokens used |
| `sensor.*_cost` | Total session cost in USD |
| `sensor.*_last_activity` | Timestamp of last activity |

## Binary Sensors

| Entity | Description |
|--------|-------------|
| `binary_sensor.*_permission_pending` | `on` when a permission request is waiting |

## State Sensor Attributes

The state sensor includes additional attributes:

| Attribute | Description |
|-----------|-------------|
| `previous_state` | State before the current one |
| `session_id` | Full session ID |
| `hostname` | Machine running OpenCode |
| `agent` | Primary agent selected |
| `current_agent` | Sub-agent currently executing |
| `error_message` | Error details (when in error state) |

## Permission Sensor Attributes

When a permission is pending:

| Attribute | Description |
|-----------|-------------|
| `permission_id` | Unique ID (required for response) |
| `type` | Permission type (bash, edit, write, etc.) |
| `title` | Human-readable description |
| `pattern` | Command or file pattern |
| `session_id` | Associated session |

## Session States

| State | Description |
|-------|-------------|
| `idle` | Waiting for input |
| `working` | AI is processing |
| `waiting_permission` | Permission approval needed |
| `error` | An error occurred |

## Entity Naming

Entity IDs follow this pattern:

```
sensor.opencode_{session_id_suffix}_{entity_type}
```

For example:
```
sensor.opencode_abc123def456_state
sensor.opencode_abc123def456_cost
binary_sensor.opencode_abc123def456_permission_pending
```

The session ID suffix is derived from the OpenCode session ID with the `ses_` prefix removed.
