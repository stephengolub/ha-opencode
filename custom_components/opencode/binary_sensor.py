"""Binary sensor platform for OpenCode integration."""
from __future__ import annotations

import logging
from typing import Any

from homeassistant.components.binary_sensor import (
    BinarySensorDeviceClass,
    BinarySensorEntity,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import (
    ATTR_PERMISSION_ID,
    ATTR_PERMISSION_METADATA,
    ATTR_PERMISSION_PATTERN,
    ATTR_PERMISSION_TITLE,
    ATTR_PERMISSION_TYPE,
    ATTR_SESSION_ID,
    DOMAIN,
    STATE_WAITING_PERMISSION,
)
from .coordinator import OpenCodeCoordinator, SessionData

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up OpenCode binary sensors from a config entry."""
    coordinator: OpenCodeCoordinator = hass.data[DOMAIN]["coordinator"]

    # Track which sessions we've created entities for
    tracked_sessions: set[str] = set()

    @callback
    def async_update_entities() -> None:
        """Update entities when coordinator data changes."""
        new_entities: list[BinarySensorEntity] = []

        for session_id, session in coordinator.sessions.items():
            if session_id not in tracked_sessions:
                tracked_sessions.add(session_id)
                new_entities.append(
                    OpenCodePermissionPendingSensor(coordinator, session)
                )

        if new_entities:
            async_add_entities(new_entities)

    # Register callback and do initial setup
    coordinator.register_update_callback(async_update_entities)
    async_update_entities()


class OpenCodePermissionPendingSensor(BinarySensorEntity):
    """Binary sensor for permission pending state."""

    _attr_has_entity_name = True
    _attr_device_class = BinarySensorDeviceClass.PROBLEM
    _attr_should_poll = False

    def __init__(
        self, coordinator: OpenCodeCoordinator, session: SessionData
    ) -> None:
        """Initialize the binary sensor."""
        self._coordinator = coordinator
        self._session_id = session.session_id
        self._device_id = session.session_id.replace("ses_", "opencode_")

        # Entity IDs
        self._attr_unique_id = f"{self._device_id}_permission_pending"
        self._attr_name = "Permission Pending"
        self._attr_icon = "mdi:shield-alert"

    @property
    def device_info(self) -> DeviceInfo:
        """Return device info to link entity to device."""
        session = self.session
        if session and session.hostname:
            device_name = f"OpenCode - {session.hostname} - {session.title}"
        elif session:
            device_name = f"OpenCode - {session.title}"
        else:
            device_name = f"OpenCode - {self._device_id}"
            
        return DeviceInfo(
            identifiers={(DOMAIN, self._device_id)},
            name=device_name,
            manufacturer="OpenCode",
            model="AI Coding Assistant",
        )

    @property
    def session(self) -> SessionData | None:
        """Get the current session data."""
        return self._coordinator.sessions.get(self._session_id)

    @property
    def available(self) -> bool:
        """Return if the sensor is available."""
        session = self.session
        if not session:
            return False
        return self._coordinator.get_instance(session.instance_id) is not None

    @property
    def is_on(self) -> bool | None:
        """Return true if permission is pending."""
        session = self.session
        if not session:
            return None
        return session.state == STATE_WAITING_PERMISSION

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return extra state attributes."""
        session = self.session
        if not session or not session.permission:
            return {}

        perm = session.permission
        return {
            ATTR_PERMISSION_ID: perm.permission_id,
            ATTR_PERMISSION_TYPE: perm.type,
            ATTR_PERMISSION_TITLE: perm.title,
            ATTR_PERMISSION_PATTERN: perm.pattern,
            ATTR_PERMISSION_METADATA: perm.metadata,
            ATTR_SESSION_ID: session.session_id,
        }

    @callback
    def _handle_coordinator_update(self) -> None:
        """Handle updated data from the coordinator."""
        self.async_write_ha_state()

    async def async_added_to_hass(self) -> None:
        """When entity is added to hass."""
        self.async_on_remove(
            self._coordinator.register_update_callback(
                self._handle_coordinator_update
            )
        )
