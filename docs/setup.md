# Setup

## Add the Integration

1. Go to **Settings > Devices & Services**
2. Click **Add Integration**
3. Search for "OpenCode"
4. A pairing code will be displayed (e.g., `ABC12DEF`)

The code is valid for 5 minutes.

## Create Access Token

The OpenCode plugin needs a long-lived access token to connect.

1. Click your profile name in the Home Assistant sidebar
2. Scroll to "Long-Lived Access Tokens"
3. Click "Create Token"
4. Give it a name (e.g., "OpenCode")
5. Copy the token immediately - it won't be shown again!

## Pair from OpenCode

In your OpenCode session, use the `ha_pair` tool:

```
Pair with Home Assistant:
- URL: http://homeassistant.local:8123
- Access Token: <paste your token>
- Code: ABC12DEF
```

### URL Options

You can use various URL formats:

| Type | Example |
|------|---------|
| mDNS | `http://homeassistant.local:8123` |
| IP Address | `http://192.168.1.100:8123` |
| External (SSL) | `https://your-ha.duckdns.org` |

## After Pairing

Once paired:

1. Home Assistant shows the OpenCode instance as connected
2. OpenCode displays a success notification
3. Session entities appear automatically

The plugin stores credentials and will reconnect automatically in future sessions.

## Re-pairing

If you need to re-pair (new token, different HA instance):

1. In OpenCode, delete `~/.config/opencode/ha-config.json`
2. In HA, remove the OpenCode integration
3. Add the integration again to get a new pairing code
4. Pair from OpenCode
