"""Config flow for OpenCode integration."""
from __future__ import annotations

import logging
from typing import Any

from homeassistant import config_entries
from homeassistant.core import callback

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)


class OpenCodeConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for OpenCode."""

    VERSION = 1

    def __init__(self) -> None:
        """Initialize the config flow."""
        self._pairing_code: str | None = None

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.FlowResult:
        """Handle the initial step."""
        # Check if already configured
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()

        if user_input is not None:
            # Create the config entry
            return self.async_create_entry(
                title="OpenCode",
                data={"instances": {}},
            )

        return self.async_show_form(
            step_id="user",
            description_placeholders={},
        )

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: config_entries.ConfigEntry,
    ) -> OpenCodeOptionsFlowHandler:
        """Get the options flow for this handler."""
        return OpenCodeOptionsFlowHandler(config_entry)


class OpenCodeOptionsFlowHandler(config_entries.OptionsFlow):
    """Handle OpenCode options."""

    def __init__(self, config_entry: config_entries.ConfigEntry) -> None:
        """Initialize options flow."""
        # In HA 2024.x+, config_entry is a property set by parent class
        self._pairing_code: str | None = None

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.FlowResult:
        """Manage the options."""
        return await self.async_step_menu()

    async def async_step_menu(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.FlowResult:
        """Show the options menu."""
        return self.async_show_menu(
            step_id="menu",
            menu_options=["pair_new", "manage_instances"],
        )

    async def async_step_pair_new(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.FlowResult:
        """Show pairing code for new instance."""
        # If user submitted the form, close the options flow
        if user_input is not None:
            return self.async_create_entry(title="", data={})

        coordinator = self.hass.data.get(DOMAIN, {}).get("coordinator")
        if not coordinator:
            return self.async_abort(reason="not_ready")

        # Generate a new pairing code
        self._pairing_code = coordinator.generate_pairing_code()

        return self.async_show_form(
            step_id="pair_new",
            description_placeholders={
                "pairing_code": self._pairing_code,
            },
            last_step=True,
        )

    async def async_step_manage_instances(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.FlowResult:
        """Manage connected instances."""
        instances = self.config_entry.data.get("instances", {})

        if not instances:
            return self.async_show_form(
                step_id="manage_instances",
                description_placeholders={"instances": "No instances connected"},
            )

        # Build instance list for display
        instance_list = []
        for instance_id, data in instances.items():
            hostname = data.get("hostname", "Unknown")
            last_seen = data.get("last_seen", "Never")
            instance_list.append(f"- {hostname} (Last seen: {last_seen})")

        return self.async_show_form(
            step_id="manage_instances",
            description_placeholders={
                "instances": "\n".join(instance_list) if instance_list else "None"
            },
        )
