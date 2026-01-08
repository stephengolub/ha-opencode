# Automations

Examples of automations you can create with the OpenCode integration.

## State Change Triggers

### Task Complete Notification

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

### Error Alert

```yaml
automation:
  - alias: "OpenCode Error Alert"
    trigger:
      - platform: state
        entity_id: sensor.opencode_myproject_state
        to: "error"
    action:
      - service: notify.mobile_app
        data:
          title: "OpenCode Error"
          message: "{{ state_attr('sensor.opencode_myproject_state', 'error_message') }}"
```

## Permission Handling

### Auto-approve Read Operations

```yaml
automation:
  - alias: "Auto-approve OpenCode reads"
    trigger:
      - platform: state
        entity_id: binary_sensor.opencode_myproject_permission_pending
        to: "on"
    condition:
      - condition: template
        value_template: "{{ state_attr('binary_sensor.opencode_myproject_permission_pending', 'type') == 'read' }}"
    action:
      - service: opencode.respond_permission
        data:
          session_id: "{{ state_attr('binary_sensor.opencode_myproject_permission_pending', 'session_id') }}"
          permission_id: "{{ state_attr('binary_sensor.opencode_myproject_permission_pending', 'permission_id') }}"
          response: once
```

### Auto-approve Git Status

```yaml
automation:
  - alias: "Auto-approve git status"
    trigger:
      - platform: event
        event_type: opencode_permission_request
    condition:
      - condition: template
        value_template: "{{ 'git status' in trigger.event.data.title }}"
    action:
      - service: opencode.respond_permission
        data:
          session_id: "{{ trigger.event.data.session_id }}"
          permission_id: "{{ trigger.event.data.permission_id }}"
          response: always
```

## Event-based Automations

### Permission Request Event

```yaml
automation:
  - alias: "Custom Permission Handler"
    trigger:
      - platform: event
        event_type: opencode_permission_request
    action:
      - service: notify.mobile_app
        data:
          title: "Permission: {{ trigger.event.data.type }}"
          message: |
            {{ trigger.event.data.title }}
            Pattern: {{ trigger.event.data.pattern }}
```

### History Response Event

```yaml
automation:
  - alias: "Log History Response"
    trigger:
      - platform: event
        event_type: opencode_history_response
    action:
      - service: system_log.write
        data:
          message: "History received for {{ trigger.event.data.session_id }}: {{ trigger.event.data.history.messages | length }} messages"
          level: info
```

## Voice Control

### Send Prompt via Voice

```yaml
automation:
  - alias: "Voice prompt to OpenCode"
    trigger:
      - platform: conversation
        command: "Tell OpenCode to {prompt}"
    action:
      - service: opencode.send_prompt
        data:
          session_id: ses_abc123
          text: "{{ trigger.slots.prompt }}"
```

## Time-based

### Daily Cost Summary

```yaml
automation:
  - alias: "OpenCode Daily Cost"
    trigger:
      - platform: time
        at: "18:00:00"
    condition:
      - condition: template
        value_template: "{{ states('sensor.opencode_myproject_cost') | float > 0 }}"
    action:
      - service: notify.mobile_app
        data:
          title: "OpenCode Daily Summary"
          message: "Today's cost: ${{ states('sensor.opencode_myproject_cost') }}"
```

## Tips

### Get Session ID Dynamically

If you have multiple sessions, find the active one:

```yaml
variables:
  active_session: >
    {% for state in states.sensor if '_state' in state.entity_id and 'opencode' in state.entity_id %}
      {% if state.state == 'working' %}
        {{ state.attributes.session_id }}
      {% endif %}
    {% endfor %}
```

### Check Permission Type

```yaml
condition:
  - condition: template
    value_template: "{{ trigger.event.data.type in ['read', 'glob', 'grep'] }}"
```

### Pattern Matching

```yaml
condition:
  - condition: template
    value_template: "{{ trigger.event.data.pattern | regex_match('^npm (test|lint|build)') }}"
```
