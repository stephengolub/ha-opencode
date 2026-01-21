"""Sensor platform for OpenCode integration."""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorStateClass,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import dt as dt_util

from .const import (
    ATTR_AGENT,
    ATTR_CURRENT_AGENT,
    ATTR_ERROR_MESSAGE,
    ATTR_HOSTNAME,
    ATTR_INSTANCE_ID,
    ATTR_PARENT_SESSION_ID,
    ATTR_PREVIOUS_STATE,
    ATTR_QUESTION,
    ATTR_SESSION_ID,
    DOMAIN,
)
from .coordinator import OpenCodeCoordinator, SessionData

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up OpenCode sensors from a config entry."""
    coordinator: OpenCodeCoordinator = hass.data[DOMAIN]["coordinator"]

    # Track which sessions we've created entities for
    tracked_sessions: set[str] = set()

    @callback
    def async_update_entities() -> None:
        """Update entities when coordinator data changes."""
        new_entities: list[SensorEntity] = []

        for session_id, session in coordinator.sessions.items():
            if session_id not in tracked_sessions:
                tracked_sessions.add(session_id)
                # Create all sensor entities for this session
                new_entities.extend(
                    [
                        OpenCodeStateSensor(coordinator, session),
                        OpenCodeSessionTitleSensor(coordinator, session),
                        OpenCodeModelSensor(coordinator, session),
                        OpenCodeCurrentToolSensor(coordinator, session),
                        OpenCodeTokensInputSensor(coordinator, session),
                        OpenCodeTokensOutputSensor(coordinator, session),
                        OpenCodeCostSensor(coordinator, session),
                        OpenCodeLastActivitySensor(coordinator, session),
                    ]
                )

        if new_entities:
            async_add_entities(new_entities)

    # Register callback and do initial setup
    coordinator.register_update_callback(async_update_entities)
    async_update_entities()


class OpenCodeSensorBase(SensorEntity):
    """Base class for OpenCode sensors."""

    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(
        self,
        coordinator: OpenCodeCoordinator,
        session: SessionData,
        sensor_type: str,
        name: str,
        icon: str | None = None,
    ) -> None:
        """Initialize the sensor."""
        self._coordinator = coordinator
        self._session_id = session.session_id
        self._sensor_type = sensor_type
        self._device_id = session.session_id.replace("ses_", "opencode_")

        # Entity IDs
        self._attr_unique_id = f"{self._device_id}_{sensor_type}"
        self._attr_name = name
        self._attr_icon = icon

    @property
    def device_info(self) -> DeviceInfo:
        """Return device info to link entity to device."""
        session = self.session
        # Build device name dynamically
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
        # Check if instance is connected
        return self._coordinator.get_instance(session.instance_id) is not None

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


class OpenCodeStateSensor(OpenCodeSensorBase):
    """Sensor for session state."""

    def __init__(self, coordinator: OpenCodeCoordinator, session: SessionData) -> None:
        """Initialize the state sensor."""
        super().__init__(
            coordinator,
            session,
            "state",
            "State",
            "mdi:state-machine",
        )

    @property
    def native_value(self) -> str | None:
        """Return the state."""
        session = self.session
        return session.state if session else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return extra state attributes."""
        session = self.session
        if not session:
            return {}

        return {
            ATTR_PREVIOUS_STATE: session.previous_state,
            ATTR_AGENT: session.agent,
            ATTR_CURRENT_AGENT: session.current_agent,
            ATTR_HOSTNAME: session.hostname,
            ATTR_ERROR_MESSAGE: session.error_message,
            ATTR_SESSION_ID: session.session_id,
            ATTR_INSTANCE_ID: session.instance_id,
            ATTR_PARENT_SESSION_ID: session.parent_session_id,
            ATTR_QUESTION: session.question,
        }


class OpenCodeSessionTitleSensor(OpenCodeSensorBase):
    """Sensor for session title."""

    def __init__(self, coordinator: OpenCodeCoordinator, session: SessionData) -> None:
        """Initialize the session title sensor."""
        super().__init__(
            coordinator,
            session,
            "session_title",
            "Session",
            "mdi:message-text",
        )

    @property
    def native_value(self) -> str | None:
        """Return the session title."""
        session = self.session
        return session.title if session else None


class OpenCodeModelSensor(OpenCodeSensorBase):
    """Sensor for model."""

    def __init__(self, coordinator: OpenCodeCoordinator, session: SessionData) -> None:
        """Initialize the model sensor."""
        super().__init__(
            coordinator,
            session,
            "model",
            "Model",
            "mdi:brain",
        )

    @property
    def native_value(self) -> str | None:
        """Return the model."""
        session = self.session
        return session.model if session else None


class OpenCodeCurrentToolSensor(OpenCodeSensorBase):
    """Sensor for current tool."""

    def __init__(self, coordinator: OpenCodeCoordinator, session: SessionData) -> None:
        """Initialize the current tool sensor."""
        super().__init__(
            coordinator,
            session,
            "current_tool",
            "Current Tool",
            "mdi:tools",
        )

    @property
    def native_value(self) -> str | None:
        """Return the current tool."""
        session = self.session
        return session.current_tool if session else None


class OpenCodeTokensInputSensor(OpenCodeSensorBase):
    """Sensor for input tokens."""

    _attr_native_unit_of_measurement = "tokens"
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator: OpenCodeCoordinator, session: SessionData) -> None:
        """Initialize the tokens input sensor."""
        super().__init__(
            coordinator,
            session,
            "tokens_input",
            "Input Tokens",
            "mdi:arrow-right-bold",
        )

    @property
    def native_value(self) -> int | None:
        """Return the input tokens."""
        session = self.session
        return session.tokens_input if session else None


class OpenCodeTokensOutputSensor(OpenCodeSensorBase):
    """Sensor for output tokens."""

    _attr_native_unit_of_measurement = "tokens"
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator: OpenCodeCoordinator, session: SessionData) -> None:
        """Initialize the tokens output sensor."""
        super().__init__(
            coordinator,
            session,
            "tokens_output",
            "Output Tokens",
            "mdi:arrow-left-bold",
        )

    @property
    def native_value(self) -> int | None:
        """Return the output tokens."""
        session = self.session
        return session.tokens_output if session else None


class OpenCodeCostSensor(OpenCodeSensorBase):
    """Sensor for session cost."""

    _attr_native_unit_of_measurement = "USD"
    _attr_state_class = SensorStateClass.TOTAL_INCREASING

    def __init__(self, coordinator: OpenCodeCoordinator, session: SessionData) -> None:
        """Initialize the cost sensor."""
        super().__init__(
            coordinator,
            session,
            "cost",
            "Cost",
            "mdi:currency-usd",
        )

    @property
    def native_value(self) -> float | None:
        """Return the cost."""
        session = self.session
        return session.cost if session else None


class OpenCodeLastActivitySensor(OpenCodeSensorBase):
    """Sensor for last activity."""

    _attr_device_class = SensorDeviceClass.TIMESTAMP

    def __init__(self, coordinator: OpenCodeCoordinator, session: SessionData) -> None:
        """Initialize the last activity sensor."""
        super().__init__(
            coordinator,
            session,
            "last_activity",
            "Last Activity",
            "mdi:clock-outline",
        )

    @property
    def native_value(self) -> datetime | None:
        """Return the last activity timestamp."""
        session = self.session
        if not session or not session.last_activity:
            return None
        
        try:
            # Parse ISO 8601 timestamp and ensure it has timezone info
            parsed = datetime.fromisoformat(session.last_activity.replace("Z", "+00:00"))
            # Convert to local timezone for HA
            return dt_util.as_local(parsed)
        except (ValueError, AttributeError):
            return None
