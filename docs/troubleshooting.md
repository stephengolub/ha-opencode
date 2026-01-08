# Troubleshooting

Common issues and solutions for the OpenCode Home Assistant integration.

## Connection Issues

### Integration not connecting

**Symptoms:** Integration shows as disconnected, no entities appear.

**Solutions:**

1. Verify OpenCode is running with the plugin installed:
   ```bash
   # Check if plugin is in opencode.json
   cat ~/.config/opencode/opencode.json | grep ha-opencode
   ```

2. Check if the plugin is paired:
   ```bash
   # Config file should exist after pairing
   cat ~/.config/opencode/ha-config.json
   ```

3. Verify access token is valid:
   - Go to your HA profile
   - Check "Long-Lived Access Tokens"
   - Revoke and create a new one if needed

4. Check Home Assistant logs:
   - Settings > System > Logs
   - Filter for "opencode"

### Pairing fails

**Symptoms:** "Invalid pairing code" or connection refused.

**Solutions:**

1. The pairing code expires after 5 minutes - generate a new one

2. Verify your HA URL is accessible:
   ```bash
   curl http://homeassistant.local:8123/api/
   ```

3. Check firewall rules allow the connection

4. Try using IP address instead of mDNS hostname

### Disconnects frequently

**Symptoms:** Entities become unavailable intermittently.

**Solutions:**

1. Check network stability between OpenCode and HA

2. Verify HA is not restarting/updating

3. Check HA logs for WebSocket errors

4. The plugin auto-reconnects - wait 5-10 seconds

## Entity Issues

### Entities not updating

**Symptoms:** State shows old values, tokens don't increase.

**Solutions:**

1. Verify the WebSocket connection is active:
   - Check integration status in Devices & Services
   - Look for connection indicator

2. Force entity refresh:
   - Developer Tools > Services
   - Call `homeassistant.update_entity` on OpenCode entities

3. Check HA logs for errors

4. Restart OpenCode and check if updates resume

### Entities unavailable

**Symptoms:** All entities show "Unavailable".

**Solutions:**

1. This is normal when OpenCode disconnects

2. Entities return when OpenCode reconnects

3. Start a new OpenCode session

4. If persistent, re-pair the integration

### Wrong session data

**Symptoms:** Entities show data from different session.

**Solutions:**

1. Each session creates unique entities

2. Check you're looking at the right device

3. Old sessions may linger - refresh the page

## Card Issues

### Card not appearing

**Symptoms:** "Custom element doesn't exist" error.

**Solutions:**

1. Verify the resource is added:
   - Settings > Dashboards > Resources
   - Check `/local/opencode-card.js` is listed

2. Verify the file exists:
   ```bash
   ls -la config/www/opencode-card.js
   ```

3. Clear browser cache:
   - Hard refresh (Ctrl+Shift+R)
   - Or clear site data

4. Check browser console for JavaScript errors

### History not loading

**Symptoms:** Spinner shows indefinitely.

**Solutions:**

1. Verify the session is connected

2. Check HA logs for history errors

3. Try a different session

4. Refresh the page and try again

### Permission buttons not working

**Symptoms:** Click approve/reject, nothing happens.

**Solutions:**

1. Check browser console for errors

2. Verify the permission is still pending

3. Check HA logs for service call errors

4. Try responding via Developer Tools > Services

## Blueprint Issues

### Notifications not sending

**Symptoms:** No mobile notifications appear.

**Solutions:**

1. Verify notification service is correct:
   - Check exact service name (e.g., `notify.mobile_app_phone`)
   - Test with Developer Tools > Services

2. Check mobile app is connected to HA

3. Check notification channel settings (Android)

4. Verify automation is enabled

### Permission response not working

**Symptoms:** Tap approve, but permission stays pending.

**Solutions:**

1. Both blueprints must be installed

2. Check automation logs:
   - Settings > Automations > click automation > Traces

3. Verify `permission_id` is being passed correctly

4. Check HA logs for service call errors

## Logs

### Enable Debug Logging

Add to `configuration.yaml`:

```yaml
logger:
  default: warning
  logs:
    custom_components.opencode: debug
```

Restart Home Assistant to apply.

### View Logs

- Settings > System > Logs
- Filter for "opencode"
- Click "Load Full Logs" for more detail

### Plugin Logs

The plugin logs to terminal when notifications are triggered. Check OpenCode output for:

- Connection status
- Command received
- Errors
