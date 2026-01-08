# Installation

## HACS (Recommended)

1. Open HACS in Home Assistant
2. Go to "Integrations" section
3. Click the three dots menu > "Custom repositories"
4. Add `https://github.com/stephengolub/ha-opencode` as "Integration"
5. Search for "OpenCode" and install
6. Restart Home Assistant

## Manual Installation

1. Download the [latest release](https://github.com/stephengolub/ha-opencode/releases)

2. Extract `custom_components/opencode` to your Home Assistant config:
   ```
   config/
   └── custom_components/
       └── opencode/
           ├── __init__.py
           ├── manifest.json
           ├── sensor.py
           └── ...
   ```

3. Copy the Lovelace card:
   ```
   config/
   └── www/
       └── opencode-card.js
   ```

4. Restart Home Assistant

## Install the OpenCode Plugin

The integration requires the companion plugin installed in OpenCode.

See [opencode-homeassistant](https://github.com/stephengolub/opencode-homeassistant) for plugin installation instructions.

## Verify Installation

After restarting:

1. Go to Settings > Devices & Services
2. Click "Add Integration"
3. Search for "OpenCode"

If it appears, installation was successful!
