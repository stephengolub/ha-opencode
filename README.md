# OpenCode Card for Home Assistant

A custom Lovelace card that displays OpenCode AI coding assistant sessions and allows interaction via MQTT.

## Features

- **Session List View**: Shows all active OpenCode sessions with status, model, and current tool
- **Detail View**: Detailed session information including token counts, cost, and last activity
- **Chat Interface**: Send prompts and view conversation history in a chat-style UI
- **Agent Selection**: Choose which agent to use when sending prompts
- **Permission Handling**: Approve or reject permission requests directly from the card
- **Auto-refresh**: Automatically updates when the session is working or state changes
- **Real-time Updates**: Live status updates via MQTT

## Requirements

- Home Assistant 2023.1 or later
- MQTT integration configured
- [ha-opencode](https://github.com/stephengolub/opencode-homeassistant) plugin installed and connected to MQTT

## Installation

### HACS (Recommended)

1. Open HACS in Home Assistant
2. Go to "Frontend" section
3. Click the three dots menu > "Custom repositories"
4. Add `https://gitlab.com/opencode-home-assistant/opencode-card` as "Lovelace"
5. Search for "OpenCode Card" and install
6. Refresh your browser

### Manual Installation

1. Download `opencode-card.js` from the [latest release](https://gitlab.com/opencode-home-assistant/opencode-card/-/releases)

2. Copy to your Home Assistant `www` folder:
   ```bash
   cp opencode-card.js /config/www/opencode-card.js
   ```

3. Add as a resource in Home Assistant:

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

4. Refresh your browser

## Usage

Add the card to a dashboard:

```yaml
type: custom:opencode-card
title: OpenCode Sessions
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `title` | string | "OpenCode Sessions" | Card title (hidden when pinned to device) |
| `device` | string | - | Device ID to pin to (shows detail view only) |
| `working_refresh_interval` | number | 10 | Auto-refresh interval in seconds when session is working |

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

**Custom refresh interval:**
```yaml
type: custom:opencode-card
working_refresh_interval: 5
```

## States

The card displays these session states:

| State | Icon | Color | Description |
|-------|------|-------|-------------|
| `idle` | sleep | green | Session is idle, waiting for input |
| `working` | cog (animated) | blue | AI is actively working |
| `waiting_permission` | shield-alert | orange | Waiting for permission approval |
| `error` | alert-circle | red | An error occurred |

## Building from Source

```bash
npm install
npm run build
```

For development with auto-rebuild:

```bash
npm run dev
```

## Related Projects

- [opencode-plugin](https://gitlab.com/opencode-home-assistant/opencode-plugin) - OpenCode plugin for Home Assistant integration (required)
- [OpenCode](https://opencode.ai) - AI coding assistant

## Troubleshooting

### Card not appearing
1. Check browser console for JavaScript errors
2. Verify the resource is loaded (Developer Tools > Network)
3. Clear browser cache and reload

### No devices showing
1. Verify MQTT is connected in Home Assistant
2. Check that the ha-opencode plugin is running
3. Look for OpenCode devices in Settings > Devices

### Permission buttons not working
1. Check browser console for errors
2. Verify the command_topic attribute is set on the device_id entity
3. Test MQTT publishing manually via Developer Tools > Services

## License

MIT
