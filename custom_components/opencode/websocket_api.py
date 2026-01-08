"""WebSocket API handlers for OpenCode integration."""
from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.util import dt as dt_util

from .const import (
    DOMAIN,
    EVENT_AGENTS_RESPONSE,
    EVENT_HISTORY_RESPONSE,
    WS_TYPE_AGENTS_RESPONSE,
    WS_TYPE_CONNECT,
    WS_TYPE_HISTORY_RESPONSE,
    WS_TYPE_PAIR,
    WS_TYPE_SESSION_REMOVED,
    WS_TYPE_SESSION_UPDATE,
    WS_TYPE_STATE_RESPONSE,
)

_LOGGER = logging.getLogger(__name__)


def async_register_websocket_handlers(hass: HomeAssistant) -> None:
    """Register WebSocket handlers."""
    websocket_api.async_register_command(hass, handle_pair)
    websocket_api.async_register_command(hass, handle_connect)
    websocket_api.async_register_command(hass, handle_session_update)
    websocket_api.async_register_command(hass, handle_session_removed)
    websocket_api.async_register_command(hass, handle_state_response)
    websocket_api.async_register_command(hass, handle_history_response)
    websocket_api.async_register_command(hass, handle_agents_response)

    _LOGGER.debug("Registered OpenCode WebSocket handlers")


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_TYPE_PAIR,
        vol.Required("code"): str,
        vol.Required("hostname"): str,
    }
)
@websocket_api.async_response
async def handle_pair(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Handle pairing request from OpenCode plugin."""
    coordinator = hass.data.get(DOMAIN, {}).get("coordinator")
    if not coordinator:
        connection.send_error(msg["id"], "not_ready", "Integration not ready")
        return

    code = msg["code"].upper()
    hostname = msg["hostname"]

    # Validate pairing code
    if not coordinator.consume_pairing_code(code):
        connection.send_error(msg["id"], "invalid_code", "Invalid or expired pairing code")
        return

    # Generate instance token
    instance_token = coordinator.generate_instance_token()
    instance_id = f"instance_{instance_token[:16]}"

    # Store instance info in config entry
    entry = None
    for e in hass.config_entries.async_entries(DOMAIN):
        entry = e
        break

    if entry:
        instances = dict(entry.data.get("instances", {}))
        instances[instance_id] = {
            "hostname": hostname,
            "token": instance_token,
            "paired_at": dt_util.utcnow().isoformat(),
        }
        hass.config_entries.async_update_entry(entry, data={**entry.data, "instances": instances})

    # Register the connection
    coordinator.register_instance(instance_id, hostname, connection)

    # Set up disconnection handler
    @callback
    def handle_disconnect() -> None:
        coordinator.unregister_instance(instance_id)

    connection.subscriptions[msg["id"]] = handle_disconnect

    connection.send_result(
        msg["id"],
        {
            "success": True,
            "instance_id": instance_id,
            "instance_token": instance_token,
        },
    )

    # Request current state
    await coordinator.request_state(instance_id)

    _LOGGER.info("Paired new OpenCode instance: %s (%s)", instance_id, hostname)


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_TYPE_CONNECT,
        vol.Required("instance_token"): str,
        vol.Required("hostname"): str,
    }
)
@websocket_api.async_response
async def handle_connect(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Handle connection from a previously paired OpenCode plugin."""
    coordinator = hass.data.get(DOMAIN, {}).get("coordinator")
    if not coordinator:
        connection.send_error(msg["id"], "not_ready", "Integration not ready")
        return

    instance_token = msg["instance_token"]
    hostname = msg["hostname"]

    # Find instance by token
    entry = None
    for e in hass.config_entries.async_entries(DOMAIN):
        entry = e
        break

    if not entry:
        connection.send_error(msg["id"], "not_configured", "Integration not configured")
        return

    instance_id = None
    instances = entry.data.get("instances", {})
    for iid, idata in instances.items():
        if idata.get("token") == instance_token:
            instance_id = iid
            break

    if not instance_id:
        connection.send_error(msg["id"], "invalid_token", "Invalid instance token")
        return

    # Check if already connected
    existing = coordinator.get_instance(instance_id)
    if existing:
        _LOGGER.warning("Instance %s already connected, replacing connection", instance_id)
        coordinator.unregister_instance(instance_id)

    # Register the connection
    coordinator.register_instance(instance_id, hostname, connection)

    # Set up disconnection handler
    @callback
    def handle_disconnect() -> None:
        coordinator.unregister_instance(instance_id)

    connection.subscriptions[msg["id"]] = handle_disconnect

    # Update last seen in config entry
    instances = dict(entry.data.get("instances", {}))
    if instance_id in instances:
        instances[instance_id]["last_seen"] = dt_util.utcnow().isoformat()
        instances[instance_id]["hostname"] = hostname
        hass.config_entries.async_update_entry(entry, data={**entry.data, "instances": instances})

    connection.send_result(
        msg["id"],
        {
            "success": True,
            "instance_id": instance_id,
        },
    )

    # Request current state
    await coordinator.request_state(instance_id)

    _LOGGER.info("OpenCode instance connected: %s (%s)", instance_id, hostname)


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_TYPE_SESSION_UPDATE,
        vol.Required("instance_token"): str,
        vol.Required("session"): dict,
    }
)
@websocket_api.async_response
async def handle_session_update(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Handle session update from OpenCode plugin."""
    coordinator = hass.data.get(DOMAIN, {}).get("coordinator")
    if not coordinator:
        connection.send_error(msg["id"], "not_ready", "Integration not ready")
        return

    # Find instance by token
    instance_token = msg["instance_token"]
    instance_id = _get_instance_id_by_token(hass, instance_token)

    if not instance_id:
        connection.send_error(msg["id"], "invalid_token", "Invalid instance token")
        return

    # Handle the session update
    session_data = msg["session"]
    await coordinator.handle_session_update(instance_id, session_data)

    connection.send_result(msg["id"], {"success": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_TYPE_SESSION_REMOVED,
        vol.Required("instance_token"): str,
        vol.Required("session_id"): str,
    }
)
@websocket_api.async_response
async def handle_session_removed(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Handle session removal from OpenCode plugin."""
    coordinator = hass.data.get(DOMAIN, {}).get("coordinator")
    if not coordinator:
        connection.send_error(msg["id"], "not_ready", "Integration not ready")
        return

    # Find instance by token
    instance_token = msg["instance_token"]
    instance_id = _get_instance_id_by_token(hass, instance_token)

    if not instance_id:
        connection.send_error(msg["id"], "invalid_token", "Invalid instance token")
        return

    session_id = msg["session_id"]
    coordinator.remove_session(session_id)

    connection.send_result(msg["id"], {"success": True})

    _LOGGER.info("Session removed: %s", session_id)


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_TYPE_STATE_RESPONSE,
        vol.Required("instance_token"): str,
        vol.Required("sessions"): list,
    }
)
@websocket_api.async_response
async def handle_state_response(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Handle state response from OpenCode plugin (sent after request_state)."""
    coordinator = hass.data.get(DOMAIN, {}).get("coordinator")
    if not coordinator:
        connection.send_error(msg["id"], "not_ready", "Integration not ready")
        return

    # Find instance by token
    instance_token = msg["instance_token"]
    instance_id = _get_instance_id_by_token(hass, instance_token)

    if not instance_id:
        connection.send_error(msg["id"], "invalid_token", "Invalid instance token")
        return

    # Process all sessions
    for session_data in msg["sessions"]:
        await coordinator.handle_session_update(instance_id, session_data)

    connection.send_result(msg["id"], {"success": True})

    _LOGGER.info("Received state for %d sessions from %s", len(msg["sessions"]), instance_id)


def _get_instance_id_by_token(hass: HomeAssistant, token: str) -> str | None:
    """Get instance ID by token."""
    for entry in hass.config_entries.async_entries(DOMAIN):
        instances = entry.data.get("instances", {})
        for instance_id, idata in instances.items():
            if idata.get("token") == token:
                return instance_id
    return None


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_TYPE_HISTORY_RESPONSE,
        vol.Required("instance_token"): str,
        vol.Required("session_id"): str,
        vol.Required("session_title"): str,
        vol.Required("messages"): list,
        vol.Required("fetched_at"): str,
        vol.Optional("since"): str,
        vol.Optional("request_id"): str,
    }
)
@websocket_api.async_response
async def handle_history_response(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Handle history response from OpenCode plugin."""
    # Find instance by token (just for validation)
    instance_token = msg["instance_token"]
    instance_id = _get_instance_id_by_token(hass, instance_token)

    if not instance_id:
        connection.send_error(msg["id"], "invalid_token", "Invalid instance token")
        return

    # Fire an event with the history data
    hass.bus.async_fire(
        EVENT_HISTORY_RESPONSE,
        {
            "session_id": msg["session_id"],
            "request_id": msg.get("request_id"),
            "history": {
                "type": "history",
                "session_id": msg["session_id"],
                "session_title": msg["session_title"],
                "messages": msg["messages"],
                "fetched_at": msg["fetched_at"],
                "since": msg.get("since"),
                "request_id": msg.get("request_id"),
            },
        },
    )

    connection.send_result(msg["id"], {"success": True})

    _LOGGER.debug(
        "Received history for session %s: %d messages",
        msg["session_id"],
        len(msg["messages"]),
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_TYPE_AGENTS_RESPONSE,
        vol.Required("instance_token"): str,
        vol.Required("session_id"): str,
        vol.Required("agents"): list,
        vol.Optional("request_id"): str,
    }
)
@websocket_api.async_response
async def handle_agents_response(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Handle agents response from OpenCode plugin."""
    # Find instance by token (just for validation)
    instance_token = msg["instance_token"]
    instance_id = _get_instance_id_by_token(hass, instance_token)

    if not instance_id:
        connection.send_error(msg["id"], "invalid_token", "Invalid instance token")
        return

    # Fire an event with the agents data
    hass.bus.async_fire(
        EVENT_AGENTS_RESPONSE,
        {
            "session_id": msg["session_id"],
            "request_id": msg.get("request_id"),
            "agents": msg["agents"],
        },
    )

    connection.send_result(msg["id"], {"success": True})

    _LOGGER.debug(
        "Received agents for session %s: %d agents",
        msg["session_id"],
        len(msg["agents"]),
    )
