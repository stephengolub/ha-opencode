"""Service handlers for OpenCode integration."""
from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol

from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv

from .const import (
    CMD_ABORT_SESSION,
    CMD_GET_AGENTS,
    CMD_GET_HISTORY,
    CMD_RESPOND_PERMISSION,
    CMD_RESPOND_QUESTION,
    CMD_SEND_PROMPT,
    DOMAIN,
)

_LOGGER = logging.getLogger(__name__)

SERVICE_SEND_PROMPT = "send_prompt"
SERVICE_RESPOND_PERMISSION = "respond_permission"
SERVICE_RESPOND_QUESTION = "respond_question"
SERVICE_ABORT_SESSION = "abort_session"
SERVICE_GET_HISTORY = "get_history"
SERVICE_GET_AGENTS = "get_agents"

SEND_PROMPT_SCHEMA = vol.Schema(
    {
        vol.Required("session_id"): cv.string,
        vol.Required("text"): cv.string,
        vol.Optional("agent"): cv.string,
    }
)

RESPOND_PERMISSION_SCHEMA = vol.Schema(
    {
        vol.Required("session_id"): cv.string,
        vol.Required("permission_id"): cv.string,
        vol.Required("response"): vol.In(["once", "always", "reject"]),
    }
)

ABORT_SESSION_SCHEMA = vol.Schema(
    {
        vol.Required("session_id"): cv.string,
    }
)

GET_HISTORY_SCHEMA = vol.Schema(
    {
        vol.Required("session_id"): cv.string,
        vol.Optional("since"): cv.string,
        vol.Optional("limit"): cv.positive_int,
        vol.Optional("request_id"): cv.string,
    }
)

GET_AGENTS_SCHEMA = vol.Schema(
    {
        vol.Required("session_id"): cv.string,
        vol.Optional("request_id"): cv.string,
    }
)

RESPOND_QUESTION_SCHEMA = vol.Schema(
    {
        vol.Required("session_id"): cv.string,
        vol.Required("answers"): list,  # Array of arrays of strings
    }
)


async def async_setup_services(hass: HomeAssistant) -> None:
    """Set up OpenCode services."""

    async def handle_send_prompt(call: ServiceCall) -> None:
        """Handle send_prompt service call."""
        coordinator = hass.data[DOMAIN]["coordinator"]
        session_id = call.data["session_id"]
        text = call.data["text"]
        agent = call.data.get("agent")

        data: dict[str, Any] = {"text": text}
        if agent:
            data["agent"] = agent

        success = await coordinator.send_command(session_id, CMD_SEND_PROMPT, data)
        if not success:
            _LOGGER.warning("Failed to send prompt to session %s", session_id)

    async def handle_respond_permission(call: ServiceCall) -> None:
        """Handle respond_permission service call."""
        coordinator = hass.data[DOMAIN]["coordinator"]
        session_id = call.data["session_id"]
        permission_id = call.data["permission_id"]
        response = call.data["response"]

        success = await coordinator.send_command(
            session_id,
            CMD_RESPOND_PERMISSION,
            {"permission_id": permission_id, "response": response},
        )
        if not success:
            _LOGGER.warning("Failed to respond to permission for session %s", session_id)

    async def handle_abort_session(call: ServiceCall) -> None:
        """Handle abort_session service call."""
        coordinator = hass.data[DOMAIN]["coordinator"]
        session_id = call.data["session_id"]

        success = await coordinator.send_command(session_id, CMD_ABORT_SESSION, {})
        if not success:
            _LOGGER.warning("Failed to abort session %s", session_id)

    async def handle_get_history(call: ServiceCall) -> None:
        """Handle get_history service call."""
        coordinator = hass.data[DOMAIN]["coordinator"]
        session_id = call.data["session_id"]
        since = call.data.get("since")
        limit = call.data.get("limit")
        request_id = call.data.get("request_id")

        data: dict[str, Any] = {}
        if since:
            data["since"] = since
        if limit:
            data["limit"] = limit
        if request_id:
            data["request_id"] = request_id

        success = await coordinator.send_command(session_id, CMD_GET_HISTORY, data)
        if not success:
            _LOGGER.warning("Failed to get history for session %s", session_id)

    async def handle_get_agents(call: ServiceCall) -> None:
        """Handle get_agents service call."""
        coordinator = hass.data[DOMAIN]["coordinator"]
        session_id = call.data["session_id"]
        request_id = call.data.get("request_id")

        data: dict[str, Any] = {}
        if request_id:
            data["request_id"] = request_id

        success = await coordinator.send_command(session_id, CMD_GET_AGENTS, data)
        if not success:
            _LOGGER.warning("Failed to get agents for session %s", session_id)

    async def handle_respond_question(call: ServiceCall) -> None:
        """Handle respond_question service call."""
        coordinator = hass.data[DOMAIN]["coordinator"]
        session_id = call.data["session_id"]
        answers = call.data["answers"]

        success = await coordinator.send_command(
            session_id,
            CMD_RESPOND_QUESTION,
            {"answers": answers},
        )
        if not success:
            _LOGGER.warning("Failed to respond to question for session %s", session_id)

    # Register services
    hass.services.async_register(
        DOMAIN, SERVICE_SEND_PROMPT, handle_send_prompt, schema=SEND_PROMPT_SCHEMA
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_RESPOND_PERMISSION,
        handle_respond_permission,
        schema=RESPOND_PERMISSION_SCHEMA,
    )
    hass.services.async_register(
        DOMAIN, SERVICE_ABORT_SESSION, handle_abort_session, schema=ABORT_SESSION_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_GET_HISTORY, handle_get_history, schema=GET_HISTORY_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_GET_AGENTS, handle_get_agents, schema=GET_AGENTS_SCHEMA
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_RESPOND_QUESTION,
        handle_respond_question,
        schema=RESPOND_QUESTION_SCHEMA,
    )

    _LOGGER.debug("Registered OpenCode services")


async def async_unload_services(hass: HomeAssistant) -> None:
    """Unload OpenCode services."""
    hass.services.async_remove(DOMAIN, SERVICE_SEND_PROMPT)
    hass.services.async_remove(DOMAIN, SERVICE_RESPOND_PERMISSION)
    hass.services.async_remove(DOMAIN, SERVICE_RESPOND_QUESTION)
    hass.services.async_remove(DOMAIN, SERVICE_ABORT_SESSION)
    hass.services.async_remove(DOMAIN, SERVICE_GET_HISTORY)
    hass.services.async_remove(DOMAIN, SERVICE_GET_AGENTS)

    _LOGGER.debug("Unregistered OpenCode services")
