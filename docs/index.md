# OpenCode Home Assistant Integration

<p align="center">
  <img src="assets/brand/opencode-wordmark-light.png" alt="OpenCode" width="300">
</p>

<p align="center">
  <strong>Unofficial Home Assistant Integration for OpenCode</strong>
</p>

!!! warning "Unofficial Project"
    This is an **unofficial** community project and is not affiliated with, endorsed by, or supported by OpenCode or Anomaly. OpenCode branding is used in accordance with their [brand guidelines](https://opencode.ai/brand).

A native Home Assistant integration for [OpenCode](https://opencode.ai), the AI coding assistant.

## Overview

This integration enables you to:

- **Monitor** OpenCode sessions in real-time
- **Control** sessions from Home Assistant or your mobile device
- **Automate** responses to permission requests
- **Visualize** sessions with a custom Lovelace card

## Architecture

```
┌─────────────────┐    WebSocket     ┌──────────────────┐
│                 │◄────────────────►│                  │
│    OpenCode     │                  │  Home Assistant  │
│    + Plugin     │                  │  + Integration   │
│                 │                  │                  │
└─────────────────┘                  └──────────────────┘
                                            │
                                            ▼
                                    ┌──────────────────┐
                                    │  Lovelace Card   │
                                    │  Mobile App      │
                                    │  Automations     │
                                    └──────────────────┘
```

The integration communicates directly with OpenCode via WebSocket - no MQTT broker required.

## Quick Start

1. [Install the integration](installation.md)
2. [Set up pairing](setup.md)
3. [Add the Lovelace card](card.md)
4. [Configure blueprints](blueprints.md) for mobile notifications

## Requirements

- Home Assistant 2024.1 or later
- [opencode-homeassistant](https://github.com/stephengolub/opencode-homeassistant) plugin installed in OpenCode

## Support

- [GitHub Issues](https://github.com/stephengolub/ha-opencode/issues) - Report bugs or request features
- [OpenCode Plugin Docs](https://stephengolub.github.io/opencode-homeassistant) - Plugin documentation
