"""Constants for the OpenCode integration."""
from typing import Final

DOMAIN: Final = "opencode"

# Config entry keys
CONF_INSTANCES: Final = "instances"

# Instance data keys
CONF_HOSTNAME: Final = "hostname"
CONF_TOKEN: Final = "token"
CONF_PAIRED_AT: Final = "paired_at"
CONF_LAST_SEEN: Final = "last_seen"

# Pairing
PAIRING_CODE_LENGTH: Final = 8
PAIRING_CODE_EXPIRY_SECONDS: Final = 300  # 5 minutes

# Session states
STATE_IDLE: Final = "idle"
STATE_WORKING: Final = "working"
STATE_WAITING_PERMISSION: Final = "waiting_permission"
STATE_ERROR: Final = "error"

# Events
EVENT_STATE_CHANGE: Final = "opencode_state_change"
EVENT_PERMISSION_REQUEST: Final = "opencode_permission_request"
EVENT_HISTORY_RESPONSE: Final = "opencode_history_response"

# WebSocket command types
WS_TYPE_PAIR: Final = "opencode/pair"
WS_TYPE_CONNECT: Final = "opencode/connect"
WS_TYPE_DISCONNECT: Final = "opencode/disconnect"
WS_TYPE_SESSION_UPDATE: Final = "opencode/session_update"
WS_TYPE_SESSION_REMOVED: Final = "opencode/session_removed"
WS_TYPE_COMMAND: Final = "opencode/command"
WS_TYPE_COMMAND_RESPONSE: Final = "opencode/command_response"
WS_TYPE_REQUEST_STATE: Final = "opencode/request_state"
WS_TYPE_STATE_RESPONSE: Final = "opencode/state_response"

# Command types (HA -> Plugin)
CMD_SEND_PROMPT: Final = "send_prompt"
CMD_RESPOND_PERMISSION: Final = "respond_permission"
CMD_ABORT_SESSION: Final = "abort_session"
CMD_GET_HISTORY: Final = "get_history"
CMD_GET_AGENTS: Final = "get_agents"

# Cleanup
DEFAULT_STALE_SESSION_DAYS: Final = 7

# Attributes
ATTR_PREVIOUS_STATE: Final = "previous_state"
ATTR_AGENT: Final = "agent"
ATTR_CURRENT_AGENT: Final = "current_agent"
ATTR_HOSTNAME: Final = "hostname"
ATTR_ERROR_MESSAGE: Final = "error_message"
ATTR_PERMISSION_ID: Final = "permission_id"
ATTR_PERMISSION_TYPE: Final = "permission_type"
ATTR_PERMISSION_TITLE: Final = "permission_title"
ATTR_PERMISSION_PATTERN: Final = "pattern"
ATTR_PERMISSION_METADATA: Final = "metadata"
ATTR_SESSION_ID: Final = "session_id"
ATTR_INSTANCE_ID: Final = "instance_id"
