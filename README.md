# OpenCode Home Assistant Integration

A native Home Assistant integration for [OpenCode](https://opencode.ai), the AI coding assistant. Monitor and control your OpenCode sessions directly from Home Assistant.

## Features

- **Native Integration**: Direct WebSocket connection to OpenCode - no MQTT broker required
- **Secure Pairing**: Simple pairing flow with one-time codes
- **Session Monitoring**: Track session state, model, tokens, cost, and activity
- **Permission Handling**: Approve or reject permission requests from Home Assistant
- **Send Prompts**: Send prompts to OpenCode from automations or the Lovelace card
- **Auto-reconnect**: Persistent connection with automatic reconnection
- **Lovelace Card**: Beautiful card for viewing and interacting with sessions

## Requirements

- Home Assistant 2024.1 or later
- [OpenCode](https://opencode.ai) with the [opencode-homeassistant](https://github.com/stephengolub/opencode-homeassistant) plugin installed

## Installation

### HACS (Recommended)

1. Open HACS in Home Assistant
2. Go to "Integrations" section
3. Click the three dots menu > "Custom repositories"
4. Add `https://github.com/stephengolub/ha-opencode` as "Integration"
5. Search for "OpenCode" and install
6. Restart Home Assistant

### Manual Installation

1. Download the [latest release](https://github.com/stephengolub/ha-opencode/releases)
2. Extract `custom_components/opencode` to your Home Assistant `config/custom_components/` folder
3. Copy `opencode-card.js` to `config/www/`
4. Restart Home Assistant

## Setup

### 1. Add the Integration

1. Go to Settings > Devices & Services
2. Click "Add Integration"
3. Search for "OpenCode"
4. A pairing code will be displayed (e.g., `ABC12DEF`)

### 2. Pair from OpenCode

In your OpenCode session, use the `ha_pair` tool:

```
Pair with Home Assistant using:
- URL: http://homeassistant.local:8123
- Access Token: <your long-lived access token>
- Code: ABC12DEF
```

To create a long-lived access token:
1. Go to your Home Assistant profile (click your name in the sidebar)
2. Scroll to "Long-Lived Access Tokens"
3. Click "Create Token"

### 3. Add the Lovelace Card

Add the card resource:

**Via UI:**
1. Go to Settings > Dashboards
2. Click the three dots menu > Resources
3. Click "Add Resource"
4. URL: `/local/opencode-card.js`
5. Type: JavaScript Module

**Via YAML** (in `configuration.yaml`):
```yaml
lovelace:
  resources:
    - url: /local/opencode-card.js
      type: module
```

## Entities

The integration creates these entities for each OpenCode session:

| Entity | Type | Description |
|--------|------|-------------|
| `sensor.*_state` | Sensor | Session state (idle, working, waiting_permission, error) |
| `sensor.*_session` | Sensor | Session title |
| `sensor.*_model` | Sensor | Current AI model |
| `sensor.*_current_tool` | Sensor | Currently executing tool |
| `sensor.*_input_tokens` | Sensor | Total input tokens used |
| `sensor.*_output_tokens` | Sensor | Total output tokens used |
| `sensor.*_cost` | Sensor | Total session cost |
| `sensor.*_last_activity` | Sensor | Last activity timestamp |
| `binary_sensor.*_permission_pending` | Binary Sensor | Permission request pending |

## Services

### `opencode.send_prompt`

Send a prompt to an OpenCode session.

```yaml
service: opencode.send_prompt
data:
  session_id: ses_abc123
  text: "Fix the bug in main.py"
  agent: code  # optional
```

### `opencode.respond_permission`

Respond to a permission request.

```yaml
service: opencode.respond_permission
data:
  session_id: ses_abc123
  permission_id: perm_xyz789
  response: once  # once, always, or reject
```

## Lovelace Card

Add the card to a dashboard:

```yaml
type: custom:opencode-card
title: OpenCode Sessions
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `title` | string | "OpenCode Sessions" | Card title |
| `device` | string | - | Device ID to pin to (shows detail view only) |
| `working_refresh_interval` | number | 10 | Auto-refresh interval when working |

### Examples

**Basic card:**
```yaml
type: custom:opencode-card
```

**Pinned to specific device:**
```yaml
type: custom:opencode-card
device: opencode_abc123def456
```

## Automations

### Notify when task completes

```yaml
automation:
  - alias: "OpenCode Task Complete"
    trigger:
      - platform: state
        entity_id: sensor.opencode_myproject_state
        from: "working"
        to: "idle"
    action:
      - service: notify.mobile_app
        data:
          title: "OpenCode"
          message: "Task completed!"
```

### Auto-approve safe permissions

```yaml
automation:
  - alias: "Auto-approve OpenCode read permissions"
    trigger:
      - platform: state
        entity_id: binary_sensor.opencode_myproject_permission_pending
        to: "on"
    condition:
      - condition: template
        value_template: "{{ 'read' in state_attr('sensor.opencode_myproject_state', 'permission_type') }}"
    action:
      - service: opencode.respond_permission
        data:
          session_id: "{{ state_attr('sensor.opencode_myproject_state', 'session_id') }}"
          permission_id: "{{ state_attr('sensor.opencode_myproject_state', 'permission_id') }}"
          response: once
```

## States

| State | Description |
|-------|-------------|
| `idle` | Session is idle, waiting for input |
| `working` | AI is actively working |
| `waiting_permission` | Waiting for permission approval |
| `error` | An error occurred |

## Troubleshooting

### Integration not connecting

1. Check that OpenCode is running with the plugin installed
2. Verify your access token is valid
3. Check Home Assistant logs for connection errors

### Entities not updating

1. Verify the WebSocket connection is active (check integration status)
2. Look for errors in Home Assistant logs
3. Try restarting OpenCode and re-pairing

### Card not appearing

1. Verify the resource is loaded (Developer Tools > Network)
2. Check browser console for JavaScript errors
3. Clear browser cache and reload

## Building from Source

```bash
# Frontend (Lovelace card)
npm install
npm run build

# Development with auto-rebuild
npm run dev
```

## Related Projects

- [opencode-homeassistant](https://github.com/stephengolub/opencode-homeassistant) - OpenCode plugin (required)
- [OpenCode](https://opencode.ai) - AI coding assistant

## License

MIT
