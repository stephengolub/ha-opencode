"""The OpenCode integration."""
from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant

from .const import DOMAIN
from .coordinator import OpenCodeCoordinator
from .services import async_setup_services, async_unload_services
from .websocket_api import async_register_websocket_handlers

_LOGGER = logging.getLogger(__name__)

PLATFORMS: list[Platform] = [Platform.SENSOR, Platform.BINARY_SENSOR]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up OpenCode from a config entry."""
    hass.data.setdefault(DOMAIN, {})

    # Create coordinator
    coordinator = OpenCodeCoordinator(hass)
    hass.data[DOMAIN]["coordinator"] = coordinator

    # Start coordinator
    await coordinator.async_start()

    # Register WebSocket handlers
    async_register_websocket_handlers(hass)

    # Set up services
    await async_setup_services(hass)

    # Set up platforms
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    # Register frontend card
    await async_register_frontend(hass)

    _LOGGER.info("OpenCode integration loaded")
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    # Unload platforms
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)

    if unload_ok:
        # Stop coordinator
        coordinator = hass.data[DOMAIN].get("coordinator")
        if coordinator:
            await coordinator.async_stop()

        # Unload services
        await async_unload_services(hass)

        # Remove data
        hass.data.pop(DOMAIN, None)

    return unload_ok


async def async_register_frontend(hass: HomeAssistant) -> None:
    """Register the frontend card."""
    # Get the path to the card JS file
    card_path = Path(__file__).parent / "opencode-card.js"

    if not card_path.exists():
        _LOGGER.warning("OpenCode card not found at %s", card_path)
        return

    # Register the card as a frontend resource
    hass.http.register_static_path(
        "/opencode/opencode-card.js",
        str(card_path),
        cache_headers=False,
    )

    # Add the resource to the frontend
    await hass.components.frontend.async_register_built_in_panel(
        component_name="lovelace",
        sidebar_title="OpenCode",
        sidebar_icon="mdi:code-braces",
        frontend_url_path="opencode",
        config={"mode": "yaml"},
        require_admin=False,
        update=False,
    )

    # Register the custom card
    hass.components.frontend.async_register_module(
        domain=DOMAIN,
        url_path="/opencode/opencode-card.js",
        type="module",
    )

    _LOGGER.debug("Registered OpenCode frontend card")
