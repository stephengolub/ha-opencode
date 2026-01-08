# Lovelace Card

A custom card for viewing and interacting with OpenCode sessions.

## Installation

### Add Resource

**Via UI:**

1. Go to Settings > Dashboards
2. Click the three dots menu > Resources
3. Click "Add Resource"
4. URL: `/local/opencode-card.js`
5. Type: JavaScript Module

**Via YAML:**

```yaml
lovelace:
  resources:
    - url: /local/opencode-card.js
      type: module
```

## Basic Usage

Add to your dashboard:

```yaml
type: custom:opencode-card
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `title` | string | "OpenCode Sessions" | Card title |
| `device` | string | - | Device ID to pin to |
| `working_refresh_interval` | number | 10 | Refresh interval (seconds) when working |

## Examples

### Basic Card

Shows all sessions with list view:

```yaml
type: custom:opencode-card
title: OpenCode Sessions
```

### Pinned Device

Shows detail view for a specific session:

```yaml
type: custom:opencode-card
device: opencode_abc123def456
```

### Custom Refresh

Faster updates when AI is working:

```yaml
type: custom:opencode-card
working_refresh_interval: 5
```

## Card Views

### List View

Shows all active sessions with:

- Session title
- State indicator (idle/working/permission/error)
- Model name
- Token counts
- Cost

Click a session to see details.

### Detail View

Shows single session with:

- Full session information
- Chat history
- Permission approval buttons (when pending)
- Prompt input field

## Permission Handling

When a permission is pending:

1. Card shows permission details (type, title, pattern)
2. Approve/Reject buttons appear
3. Click to respond

## Chat History

The detail view can load session history:

- Click "Load History" or "Refresh"
- Messages show user prompts and AI responses
- Tool calls are displayed with names and results

## Troubleshooting

### Card not appearing

1. Check that the resource URL is correct
2. Verify the file exists in `config/www/`
3. Clear browser cache and reload
4. Check browser console for errors

### History not loading

1. Ensure the session is connected
2. Check HA logs for errors
3. Try refreshing the page
