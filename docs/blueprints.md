# Blueprints

Ready-to-use automation blueprints for common OpenCode workflows.

## Installation

Copy blueprints to your Home Assistant config:

```bash
mkdir -p config/blueprints/automation/opencode
cp blueprints/automation/*.yaml config/blueprints/automation/opencode/
```

Then reload automations: Developer Tools > YAML > Reload Automations.

## State Notifications

**File:** `opencode_state_notifications.yaml`

Sends mobile notifications when OpenCode sessions need attention.

### Notification Types

| Event | Notification |
|-------|--------------|
| Task Complete | Session finished working |
| Permission Required | Approval needed with Approve/Reject buttons |
| Error | An error occurred |

### Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `notify_service` | Notification service (e.g., `notify.mobile_app_phone`) | `notify.mobile_app_phone` |
| `notify_on_complete` | Notify when tasks complete | `true` |
| `notify_on_permission` | Notify when permission needed | `true` |
| `notify_on_error` | Notify when errors occur | `true` |
| `notification_channel` | Android channel name | `OpenCode` |
| `dashboard_path` | Dashboard path for click action | `/lovelace/opencode` |

### Permission Notification Details

When a permission is required, the notification includes:

- Permission type (bash, edit, write, etc.)
- Permission title (what's being requested)
- Pattern (command or file path)
- Approve/Reject buttons

### Setup

1. Go to Settings > Automations > Create Automation > Use Blueprint
2. Select "OpenCode State Notifications"
3. Configure your notification service
4. Choose which notifications to enable
5. Save

## Permission Response Handler

**File:** `opencode_permission_response.yaml`

Handles button taps from permission notifications.

### How It Works

1. User taps "Approve" or "Reject" on notification
2. Blueprint extracts session and permission IDs
3. Calls `opencode.respond_permission` service
4. OpenCode continues or aborts

### Setup

1. Go to Settings > Automations > Create Automation > Use Blueprint
2. Select "OpenCode Permission Response Handler"
3. Save (no configuration needed)

### Requirements

- Works with iOS and Android via Companion app
- Must be used together with State Notifications blueprint
- Both blueprints must be installed for permission flow to work

## Example: Both Blueprints

For the complete permission notification flow:

1. Install both blueprints
2. Create automation from "State Notifications":
   - Set your notification service
   - Enable permission notifications
3. Create automation from "Permission Response Handler"
4. Test by triggering a permission request in OpenCode

## Events Used

| Event | Description |
|-------|-------------|
| `opencode_state_change` | Session state changed |
| `opencode_permission_request` | Detailed permission info |
| `mobile_app_notification_action` | Notification button tapped |

## Customization

The blueprints can be used as templates for custom automations. Key patterns:

### Permission Data

```yaml
# Get permission details from event
permission_id: "{{ trigger.event.data.permission_id }}"
permission_type: "{{ trigger.event.data.type }}"
permission_title: "{{ trigger.event.data.title }}"
permission_pattern: "{{ trigger.event.data.pattern }}"
```

### Notification Actions

```yaml
actions:
  - action: "OPENCODE_APPROVE_{{ session_id }}"
    title: "Approve"
  - action: "OPENCODE_REJECT_{{ session_id }}"
    title: "Reject"
action_data:
  session_id: "{{ session_id }}"
  permission_id: "{{ permission_id }}"
```
