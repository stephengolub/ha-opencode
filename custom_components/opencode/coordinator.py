"""Coordinator for managing OpenCode instances and sessions."""
from __future__ import annotations

import asyncio
import logging
import secrets
import string
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Callable

from homeassistant.components.websocket_api import ActiveConnection
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import device_registry as dr, entity_registry as er

from .const import (
    DOMAIN,
    EVENT_PERMISSION_REQUEST,
    EVENT_STATE_CHANGE,
    PAIRING_CODE_EXPIRY_SECONDS,
    PAIRING_CODE_LENGTH,
    STATE_WAITING_PERMISSION,
    DEFAULT_STALE_SESSION_DAYS,
)

_LOGGER = logging.getLogger(__name__)


@dataclass
class PermissionData:
    """Permission request data."""

    permission_id: str
    type: str
    title: str
    session_id: str
    message_id: str
    call_id: str | None = None
    pattern: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class SessionData:
    """Session data from OpenCode plugin."""

    session_id: str
    instance_id: str
    title: str = "Untitled"
    state: str = "idle"
    previous_state: str | None = None
    model: str = "unknown"
    current_tool: str = "none"
    tokens_input: int = 0
    tokens_output: int = 0
    cost: float = 0.0
    last_activity: str = ""
    agent: str | None = None
    current_agent: str | None = None
    hostname: str | None = None
    error_message: str | None = None
    permission: PermissionData | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any], instance_id: str) -> SessionData:
        """Create SessionData from dictionary."""
        permission_data = data.get("permission")
        permission = None
        if permission_data:
            permission = PermissionData(
                permission_id=permission_data.get("id", ""),
                type=permission_data.get("type", ""),
                title=permission_data.get("title", ""),
                session_id=permission_data.get("session_id", data.get("session_id", "")),
                message_id=permission_data.get("message_id", ""),
                call_id=permission_data.get("call_id"),
                pattern=permission_data.get("pattern"),
                metadata=permission_data.get("metadata", {}),
            )

        return cls(
            session_id=data.get("session_id", ""),
            instance_id=instance_id,
            title=data.get("title", "Untitled"),
            state=data.get("state", "idle"),
            previous_state=data.get("previous_state"),
            model=data.get("model", "unknown"),
            current_tool=data.get("current_tool", "none"),
            tokens_input=data.get("tokens_input", 0),
            tokens_output=data.get("tokens_output", 0),
            cost=data.get("cost", 0.0),
            last_activity=data.get("last_activity", ""),
            agent=data.get("agent"),
            current_agent=data.get("current_agent"),
            hostname=data.get("hostname"),
            error_message=data.get("error_message"),
            permission=permission,
        )


@dataclass
class InstanceConnection:
    """Represents a connected OpenCode instance."""

    instance_id: str
    hostname: str
    connection: ActiveConnection
    connected_at: datetime = field(default_factory=datetime.now)
    last_seen: datetime = field(default_factory=datetime.now)

    def update_last_seen(self) -> None:
        """Update last seen timestamp."""
        self.last_seen = datetime.now()


@dataclass
class PairingRequest:
    """Active pairing request."""

    code: str
    created_at: datetime
    expires_at: datetime


class OpenCodeCoordinator:
    """Coordinator for OpenCode integration."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize the coordinator."""
        self.hass = hass
        self.instances: dict[str, InstanceConnection] = {}
        self.sessions: dict[str, SessionData] = {}
        self.pairing_requests: dict[str, PairingRequest] = {}
        self._update_callbacks: list[Callable[[], None]] = []
        self._cleanup_task: asyncio.Task | None = None

    async def async_start(self) -> None:
        """Start the coordinator."""
        # Start periodic cleanup task
        self._cleanup_task = asyncio.create_task(self._periodic_cleanup())
        _LOGGER.debug("OpenCode coordinator started")

    async def async_stop(self) -> None:
        """Stop the coordinator."""
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
        _LOGGER.debug("OpenCode coordinator stopped")

    def generate_pairing_code(self) -> str:
        """Generate a new pairing code."""
        # Clean up expired codes first
        self._cleanup_expired_pairing_codes()

        # Generate 8-character alphanumeric code
        alphabet = string.ascii_uppercase + string.digits
        code = "".join(secrets.choice(alphabet) for _ in range(PAIRING_CODE_LENGTH))

        now = datetime.now()
        self.pairing_requests[code] = PairingRequest(
            code=code,
            created_at=now,
            expires_at=now + timedelta(seconds=PAIRING_CODE_EXPIRY_SECONDS),
        )

        _LOGGER.debug("Generated pairing code: %s", code)
        return code

    def validate_pairing_code(self, code: str) -> bool:
        """Validate a pairing code."""
        self._cleanup_expired_pairing_codes()

        if code not in self.pairing_requests:
            return False

        request = self.pairing_requests[code]
        if datetime.now() > request.expires_at:
            del self.pairing_requests[code]
            return False

        return True

    def consume_pairing_code(self, code: str) -> bool:
        """Consume a pairing code (use it once)."""
        if not self.validate_pairing_code(code):
            return False

        del self.pairing_requests[code]
        return True

    def _cleanup_expired_pairing_codes(self) -> None:
        """Remove expired pairing codes."""
        now = datetime.now()
        expired = [
            code
            for code, request in self.pairing_requests.items()
            if now > request.expires_at
        ]
        for code in expired:
            del self.pairing_requests[code]

    def generate_instance_token(self) -> str:
        """Generate a secure instance token."""
        return secrets.token_urlsafe(32)

    def register_instance(
        self, instance_id: str, hostname: str, connection: ActiveConnection
    ) -> None:
        """Register a connected instance."""
        self.instances[instance_id] = InstanceConnection(
            instance_id=instance_id,
            hostname=hostname,
            connection=connection,
        )
        _LOGGER.info("Registered OpenCode instance: %s (%s)", instance_id, hostname)

    def unregister_instance(self, instance_id: str) -> None:
        """Unregister an instance.
        
        Note: We intentionally do NOT remove sessions when an instance disconnects.
        Sessions and their entities should persist and become "unavailable" until
        the instance reconnects. This allows seamless reconnection without losing
        entity history or device associations.
        """
        if instance_id in self.instances:
            del self.instances[instance_id]
            _LOGGER.info("Unregistered OpenCode instance: %s", instance_id)
            
            # Notify listeners so entities update their availability
            self._notify_update()

    def get_instance(self, instance_id: str) -> InstanceConnection | None:
        """Get an instance by ID."""
        return self.instances.get(instance_id)

    def get_instance_for_session(self, session_id: str) -> InstanceConnection | None:
        """Get the instance that owns a session."""
        session = self.sessions.get(session_id)
        if not session:
            return None
        return self.instances.get(session.instance_id)

    async def handle_session_update(
        self, instance_id: str, session_data: dict[str, Any]
    ) -> None:
        """Handle a session update from a plugin."""
        session_id = session_data.get("session_id")
        if not session_id:
            _LOGGER.warning("Session update missing session_id")
            return

        # Update instance last seen
        instance = self.instances.get(instance_id)
        if instance:
            instance.update_last_seen()

        # Get previous state for comparison
        old_session = self.sessions.get(session_id)
        old_state = old_session.state if old_session else None

        # Create/update session
        session = SessionData.from_dict(session_data, instance_id)
        
        # Preserve previous_state from the transition
        if old_state and old_state != session.state:
            session.previous_state = old_state

        self.sessions[session_id] = session

        # Ensure device exists
        await self._ensure_device(session)

        # Fire events
        if old_state != session.state:
            self.hass.bus.async_fire(
                EVENT_STATE_CHANGE,
                {
                    "session_id": session_id,
                    "previous_state": old_state,
                    "new_state": session.state,
                    "hostname": session.hostname,
                    "session_title": session.title,
                    "instance_id": instance_id,
                },
            )

        # Fire permission event if waiting for permission
        if session.state == STATE_WAITING_PERMISSION and session.permission:
            self.hass.bus.async_fire(
                EVENT_PERMISSION_REQUEST,
                {
                    "session_id": session_id,
                    "permission_id": session.permission.permission_id,
                    "type": session.permission.type,
                    "title": session.permission.title,
                    "pattern": session.permission.pattern,
                    "instance_id": instance_id,
                },
            )

        # Notify listeners
        self._notify_update()

    def remove_session(self, session_id: str) -> None:
        """Remove a session."""
        if session_id in self.sessions:
            session = self.sessions[session_id]
            del self.sessions[session_id]
            _LOGGER.info("Removed session: %s", session_id)

            # Remove device and entities
            self._remove_device(session_id)

            # Notify listeners
            self._notify_update()

    async def _ensure_device(self, session: SessionData) -> None:
        """Ensure device exists for session and update its name if needed."""
        device_registry = dr.async_get(self.hass)

        # Device identifier uses session ID (without ses_ prefix for cleaner IDs)
        device_id = session.session_id.replace("ses_", "opencode_")

        # Build device name
        if session.hostname:
            device_name = f"OpenCode - {session.hostname} - {session.title}"
        else:
            device_name = f"OpenCode - {session.title}"

        # Check if device already exists
        existing_device = device_registry.async_get_device(identifiers={(DOMAIN, device_id)})
        
        if existing_device:
            # Update the device name if it changed
            if existing_device.name != device_name:
                device_registry.async_update_device(
                    existing_device.id,
                    name=device_name,
                )
        else:
            # Create new device
            device_registry.async_get_or_create(
                config_entry_id=self._get_config_entry_id(),
                identifiers={(DOMAIN, device_id)},
                name=device_name,
                manufacturer="OpenCode",
                model="AI Coding Assistant",
                sw_version=session.session_id,
            )

    def _remove_device(self, session_id: str) -> None:
        """Remove device for session."""
        device_registry = dr.async_get(self.hass)
        device_id = session_id.replace("ses_", "opencode_")

        device = device_registry.async_get_device(identifiers={(DOMAIN, device_id)})
        if device:
            device_registry.async_remove_device(device.id)

    def _get_config_entry_id(self) -> str:
        """Get the config entry ID."""
        for entry in self.hass.config_entries.async_entries(DOMAIN):
            return entry.entry_id
        return ""

    async def send_command(
        self, session_id: str, command: str, data: dict[str, Any]
    ) -> bool:
        """Send a command to the plugin managing a session."""
        instance = self.get_instance_for_session(session_id)
        if not instance:
            _LOGGER.warning("No instance found for session: %s", session_id)
            return False

        try:
            instance.connection.send_message(
                {
                    "type": "opencode/command",
                    "command": command,
                    "session_id": session_id,
                    "data": data,
                }
            )
            return True
        except Exception as err:
            _LOGGER.error("Failed to send command: %s", err)
            return False

    async def request_state(self, instance_id: str) -> None:
        """Request current state from an instance."""
        instance = self.instances.get(instance_id)
        if not instance:
            return

        try:
            instance.connection.send_message({"type": "opencode/request_state"})
        except Exception as err:
            _LOGGER.error("Failed to request state: %s", err)

    @callback
    def register_update_callback(self, callback: Callable[[], None]) -> Callable[[], None]:
        """Register a callback for updates."""
        self._update_callbacks.append(callback)

        def remove_callback() -> None:
            self._update_callbacks.remove(callback)

        return remove_callback

    def _notify_update(self) -> None:
        """Notify all registered callbacks of an update."""
        for callback in self._update_callbacks:
            try:
                callback()
            except Exception as err:
                _LOGGER.error("Error in update callback: %s", err)

    async def _periodic_cleanup(self) -> None:
        """Periodically clean up stale sessions."""
        while True:
            try:
                await asyncio.sleep(3600)  # Run every hour
                await self._cleanup_stale_sessions()
            except asyncio.CancelledError:
                break
            except Exception as err:
                _LOGGER.error("Error in periodic cleanup: %s", err)

    async def _cleanup_stale_sessions(self) -> None:
        """Clean up sessions that haven't been active for a while."""
        cutoff = datetime.now() - timedelta(days=DEFAULT_STALE_SESSION_DAYS)

        stale_sessions = []
        for session_id, session in self.sessions.items():
            if session.last_activity:
                try:
                    last_activity = datetime.fromisoformat(
                        session.last_activity.replace("Z", "+00:00")
                    )
                    if last_activity < cutoff:
                        stale_sessions.append(session_id)
                except ValueError:
                    pass

        for session_id in stale_sessions:
            _LOGGER.info("Cleaning up stale session: %s", session_id)
            self.remove_session(session_id)
