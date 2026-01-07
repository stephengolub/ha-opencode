/**
 * OpenCode Card - Home Assistant Custom Card
 * Displays OpenCode sessions with their states
 */

interface HomeAssistant {
  states: Record<string, HassEntity>;
  callService: (domain: string, service: string, data?: Record<string, unknown>) => Promise<void>;
  callWS: (msg: Record<string, unknown>) => Promise<unknown>;
  connection: {
    subscribeEvents: (callback: (event: unknown) => void, eventType: string) => Promise<() => void>;
    subscribeMessage: (callback: (event: unknown) => void, msg: Record<string, unknown>) => Promise<() => void>;
  };
}

interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

interface DeviceRegistryEntry {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  identifiers: [string, string][];
}

interface EntityRegistryEntry {
  entity_id: string;
  device_id: string;
  platform: string;
  unique_id: string;
}

interface OpenCodeDevice {
  deviceId: string;
  deviceName: string;
  entities: Map<string, HassEntity>;
}

interface CardConfig {
  type: string;
  title?: string;
  device?: string; // Device ID to pin to
  working_refresh_interval?: number; // Auto-refresh interval in seconds when working (default: 10)
}

// Agent types
interface AgentInfo {
  name: string;
  description?: string;
  mode: "subagent" | "primary" | "all";
}

interface AgentsResponse {
  type: "agents";
  request_id?: string;
  agents: AgentInfo[];
}

interface PermissionDetails {
  permission_id: string;
  type: string;
  title: string;
  session_id: string;
  message_id: string;
  call_id?: string;
  pattern?: string;
  metadata?: Record<string, unknown>;
  commandTopic: string;
}

// History types matching plugin output
interface HistoryPart {
  type: "text" | "tool_call" | "tool_result" | "image" | "other";
  content?: string;
  tool_name?: string;
  tool_id?: string;
  tool_args?: Record<string, unknown>;
  tool_output?: string;
  tool_error?: string;
}

interface HistoryMessage {
  id: string;
  role: "user" | "assistant";
  timestamp: string;
  model?: string;
  provider?: string;
  tokens_input?: number;
  tokens_output?: number;
  cost?: number;
  parts: HistoryPart[];
}

interface HistoryResponse {
  type: "history";
  request_id?: string;
  session_id: string;
  session_title: string;
  messages: HistoryMessage[];
  fetched_at: string;
  since?: string;
}

interface CachedHistory {
  data: HistoryResponse;
  lastFetched: string;
}

// Cache key helper
function getHistoryCacheKey(deviceId: string): string {
  return `opencode_history_${deviceId}`;
}

// Time formatting helper
function formatRelativeTime(timestamp: string): { display: string; tooltip: string } {
  const date = new Date(timestamp);
  
  // Check for invalid date
  if (isNaN(date.getTime())) {
    return { display: "Unknown", tooltip: "Invalid timestamp" };
  }
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  
  const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateStr = date.toLocaleDateString([], { month: "short", day: "numeric" });
  const fullStr = date.toLocaleString();
  
  const isToday = date.toDateString() === now.toDateString();
  
  // More than 2 hours ago: show actual time (and date if not today)
  if (diffHours >= 2) {
    if (isToday) {
      return { display: timeStr, tooltip: fullStr };
    } else {
      return { display: `${dateStr} ${timeStr}`, tooltip: fullStr };
    }
  }
  
  // Less than 2 hours: show relative time
  if (diffMins < 1) {
    return { display: "Just now", tooltip: fullStr };
  } else if (diffMins < 60) {
    return { display: `${diffMins}m ago`, tooltip: fullStr };
  } else {
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    if (mins === 0) {
      return { display: `${hours}h ago`, tooltip: fullStr };
    }
    return { display: `${hours}h ${mins}m ago`, tooltip: fullStr };
  }
}

// State icons and colors
const STATE_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  idle: { icon: "mdi:sleep", color: "#4caf50", label: "Idle" },
  working: { icon: "mdi:cog", color: "#2196f3", label: "Working" },
  waiting_permission: { icon: "mdi:shield-alert", color: "#ff9800", label: "Needs Permission" },
  error: { icon: "mdi:alert-circle", color: "#f44336", label: "Error" },
  unknown: { icon: "mdi:help-circle", color: "#9e9e9e", label: "Unknown" },
};

class OpenCodeCard extends HTMLElement {
  private _hass?: HomeAssistant;
  private _config?: CardConfig;
  private _devices: Map<string, OpenCodeDevice> = new Map();
  private _deviceRegistry: Map<string, DeviceRegistryEntry> = new Map();
  private _entityRegistry: Map<string, EntityRegistryEntry> = new Map();
  private _initialized = false;
  private _showPermissionModal = false;
  private _activePermission: PermissionDetails | null = null;
  private _selectedDeviceId: string | null = null; // For navigating into a device from list view
  private _showHistoryView = false;
  private _historyLoading = false;
  private _historyData: HistoryResponse | null = null;
  private _historyDeviceId: string | null = null;
  private _historyCommandTopic: string | null = null;
  private _historyResponseTopic: string | null = null;
  private _mqttUnsubscribe: (() => void) | null = null;
  // Lazy loading state
  private _historyVisibleCount = 10; // Number of messages to show initially
  private _historyLoadingMore = false;
  private static readonly HISTORY_PAGE_SIZE = 10; // Messages to load per scroll
  // Scroll tracking
  private _isAtBottom = true;
  // Track pending permissions per device (persists even if entity state lags)
  private _pendingPermissions: Map<string, PermissionDetails> = new Map();
  // Track last rendered state to avoid unnecessary re-renders
  private _lastRenderHash: string = "";
  // Agent selection
  private _availableAgents: AgentInfo[] = [];
  private _selectedAgent: string | null = null;
  private _agentsLoading = false;
  // Auto-refresh when working
  private _autoRefreshInterval: ReturnType<typeof setInterval> | null = null;
  private _lastDeviceState: string | null = null;

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    if (!this._initialized) {
      this._initialize();
    } else {
      this._updateDevices();
      
      // Check for state changes on the active chat device
      if (this._showHistoryView && this._historyDeviceId) {
        const device = this._devices.get(this._historyDeviceId);
        const stateEntity = device?.entities.get("state");
        const currentState = stateEntity?.state ?? "unknown";
        
        // If state changed, refresh history
        if (this._lastDeviceState !== null && this._lastDeviceState !== currentState) {
          this._refreshHistory();
        }
        this._lastDeviceState = currentState;
        
        // Manage auto-refresh interval based on working state
        this._manageAutoRefresh(currentState);
        return;
      }
      
      if (this._showPermissionModal && this._activePermission) {
        // Check if we now have full details when we didn't before
        const deviceId = this._findDeviceIdForPermission(this._activePermission);
        if (deviceId) {
          const updatedPermission = this._pendingPermissions.get(deviceId);
          if (updatedPermission && updatedPermission.permission_id && !this._activePermission.permission_id) {
            // We got the full details - update and re-render
            this._activePermission = updatedPermission;
            this._render();
            return;
          }
        }
        // Otherwise skip re-render to prevent losing focus
        return;
      }
      // Only re-render if relevant state has changed
      const currentHash = this._computeStateHash();
      if (currentHash !== this._lastRenderHash) {
        this._lastRenderHash = currentHash;
        this._render();
      }
    }
  }
  
  private _manageAutoRefresh(currentState: string) {
    const refreshInterval = (this._config?.working_refresh_interval ?? 10) * 1000;
    
    if (currentState === "working") {
      // Start auto-refresh if not already running
      if (!this._autoRefreshInterval) {
        this._autoRefreshInterval = setInterval(() => {
          if (this._showHistoryView && !this._historyLoading) {
            this._refreshHistory();
          }
        }, refreshInterval);
      }
    } else {
      // Stop auto-refresh when not working
      if (this._autoRefreshInterval) {
        clearInterval(this._autoRefreshInterval);
        this._autoRefreshInterval = null;
      }
    }
  }

  private _computeStateHash(): string {
    // Create a hash of the state that affects rendering
    const hashParts: string[] = [];
    
    for (const [deviceId, device] of this._devices) {
      const stateEntity = device.entities.get("state");
      const sessionEntity = device.entities.get("session_title");
      const modelEntity = device.entities.get("model");
      const toolEntity = device.entities.get("current_tool");
      const costEntity = device.entities.get("cost");
      const tokensInEntity = device.entities.get("tokens_input");
      const tokensOutEntity = device.entities.get("tokens_output");
      const permissionEntity = device.entities.get("permission");
      const activityEntity = device.entities.get("last_activity");
      
      // Include agent attributes from state entity
      const agent = stateEntity?.attributes?.agent as string | null;
      const currentAgent = stateEntity?.attributes?.current_agent as string | null;
      
      hashParts.push(`${deviceId}:${stateEntity?.state}:${sessionEntity?.state}:${modelEntity?.state}:${toolEntity?.state}:${costEntity?.state}:${tokensInEntity?.state}:${tokensOutEntity?.state}:${permissionEntity?.state}:${activityEntity?.state}:${agent}:${currentAgent}`);
      
      // Include permission attributes if pending
      if (permissionEntity?.state === "pending") {
        hashParts.push(`perm:${permissionEntity.attributes?.permission_id}`);
      }
    }
    
    // Include pending permissions
    for (const [deviceId, perm] of this._pendingPermissions) {
      hashParts.push(`pending:${deviceId}:${perm.permission_id}`);
    }
    
    return hashParts.join("|");
  }

  private _findDeviceIdForPermission(permission: PermissionDetails): string | null {
    for (const [deviceId, device] of this._devices) {
      const deviceIdEntity = device.entities.get("device_id");
      const commandTopic = deviceIdEntity?.attributes?.command_topic as string;
      if (commandTopic === permission.commandTopic) {
        return deviceId;
      }
    }
    return null;
  }

  setConfig(config: CardConfig) {
    this._config = config;
  }

  private async _initialize() {
    if (!this._hass) return;
    
    this._initialized = true;
    
    // Fetch device and entity registries
    await this._fetchRegistries();
    this._updateDevices();
    this._render();
  }

  private async _fetchRegistries() {
    if (!this._hass) return;

    try {
      // Fetch device registry
      const deviceResponse = await this._hass.callWS({
        type: "config/device_registry/list",
      }) as DeviceRegistryEntry[];
      
      for (const device of deviceResponse) {
        if (device.manufacturer === "OpenCode") {
          this._deviceRegistry.set(device.id, device);
        }
      }

      // Fetch entity registry
      const entityResponse = await this._hass.callWS({
        type: "config/entity_registry/list",
      }) as EntityRegistryEntry[];

      for (const entity of entityResponse) {
        if (entity.platform === "mqtt" && this._deviceRegistry.has(entity.device_id)) {
          this._entityRegistry.set(entity.entity_id, entity);
        }
      }
    } catch (err) {
      console.error("[opencode-card] Failed to fetch registries:", err);
    }
  }

  private _updateDevices() {
    if (!this._hass) return;

    this._devices.clear();

    // Group entities by device
    for (const [entityId, entityEntry] of this._entityRegistry) {
      const device = this._deviceRegistry.get(entityEntry.device_id);
      if (!device) continue;

      const state = this._hass.states[entityId];
      if (!state) continue;

      let openCodeDevice = this._devices.get(device.id);
      if (!openCodeDevice) {
        openCodeDevice = {
          deviceId: device.id,
          deviceName: device.name,
          entities: new Map(),
        };
        this._devices.set(device.id, openCodeDevice);
      }

      // Extract entity key from unique_id
      // Format: "{deviceId}_{key}" where deviceId is like "opencode_global" and key is like "device_id"
      // So unique_id "opencode_global_device_id" should give key "device_id"
      const uniqueId = entityEntry.unique_id || "";
      
      // Find the device identifier prefix (e.g., "opencode_global") from device identifiers
      // Then remove it to get the entity key
      let entityKey = "";
      const deviceIdentifier = device.identifiers?.[0]?.[1] || "";
      if (deviceIdentifier && uniqueId.startsWith(deviceIdentifier + "_")) {
        entityKey = uniqueId.slice(deviceIdentifier.length + 1);
      } else {
        // Fallback: try to match known keys at the end of unique_id
        const knownKeys = ["device_id", "state", "session_title", "model", "current_tool", 
                          "tokens_input", "tokens_output", "cost", "last_activity", "permission"];
        for (const key of knownKeys) {
          if (uniqueId.endsWith("_" + key)) {
            entityKey = key;
            break;
          }
        }
      }
      
      if (entityKey) {
        openCodeDevice.entities.set(entityKey, state);
      }
    }

    // Update pending permissions tracking
    this._updatePendingPermissions();
  }

  private _updatePendingPermissions() {
    for (const [deviceId, device] of this._devices) {
      const permissionEntity = device.entities.get("permission");
      const stateEntity = device.entities.get("state");
      const deviceIdEntity = device.entities.get("device_id");

      // If permission entity shows "pending" with valid attributes, capture it
      if (permissionEntity?.state === "pending" && permissionEntity.attributes) {
        const attrs = permissionEntity.attributes;
        if (attrs.permission_id && attrs.title) {
          this._pendingPermissions.set(deviceId, {
            permission_id: attrs.permission_id as string,
            type: attrs.type as string || "unknown",
            title: attrs.title as string,
            session_id: attrs.session_id as string || "",
            message_id: attrs.message_id as string || "",
            call_id: attrs.call_id as string | undefined,
            pattern: attrs.pattern as string | undefined,
            metadata: attrs.metadata as Record<string, unknown> | undefined,
            commandTopic: (deviceIdEntity?.attributes?.command_topic as string) ?? "",
          });
        }
      }
      // If state is no longer waiting_permission or permission is "none", clear tracking
      else if (stateEntity?.state !== "waiting_permission" || permissionEntity?.state === "none") {
        this._pendingPermissions.delete(deviceId);
      }
      // If state IS waiting_permission but we don't have permission details yet,
      // try to build from deviceIdEntity at least (for command topic)
      else if (stateEntity?.state === "waiting_permission" && !this._pendingPermissions.has(deviceId)) {
        // Store a partial permission - we have the command topic but not full details
        const commandTopic = (deviceIdEntity?.attributes?.command_topic as string) ?? "";
        if (commandTopic) {
          this._pendingPermissions.set(deviceId, {
            permission_id: "",  // Will be filled when permission entity updates
            type: "pending",
            title: "Permission Required",
            session_id: "",
            message_id: "",
            commandTopic,
          });
        }
      }
    }
  }

  private _getPinnedDevice(): OpenCodeDevice | null {
    if (!this._config?.device) return null;
    return this._devices.get(this._config.device) || null;
  }

  private _getPermissionDetails(device: OpenCodeDevice): PermissionDetails | null {
    // First check our tracked permissions (more reliable, persists across timing issues)
    const tracked = this._pendingPermissions.get(device.deviceId);
    if (tracked && tracked.permission_id) {
      return tracked;
    }

    // Fall back to direct entity check
    const permissionEntity = device.entities.get("permission");
    const deviceIdEntity = device.entities.get("device_id");
    
    if (permissionEntity?.state !== "pending" || !permissionEntity.attributes) {
      // If we have a tracked permission without full details, return it anyway
      // (allows clicking the alert even if permission_id isn't set yet)
      if (tracked) {
        return tracked;
      }
      return null;
    }

    const attrs = permissionEntity.attributes;
    return {
      permission_id: attrs.permission_id as string,
      type: attrs.type as string,
      title: attrs.title as string,
      session_id: attrs.session_id as string,
      message_id: attrs.message_id as string,
      call_id: attrs.call_id as string | undefined,
      pattern: attrs.pattern as string | undefined,
      metadata: attrs.metadata as Record<string, unknown> | undefined,
      commandTopic: (deviceIdEntity?.attributes?.command_topic as string) ?? "",
    };
  }

  private _showPermission(permission: PermissionDetails) {
    this._activePermission = permission;
    this._showPermissionModal = true;
    this._render();
  }

  private _hidePermissionModal() {
    this._showPermissionModal = false;
    this._activePermission = null;
    this._render();
  }

  private _selectDevice(deviceId: string) {
    this._selectedDeviceId = deviceId;
    this._render();
  }

  private _goBack() {
    this._selectedDeviceId = null;
    this._render();
  }

  private _isPinned(): boolean {
    return !!this._config?.device;
  }

  private async _sendChatMessage(text: string) {
    if (!this._hass || !this._historyCommandTopic || !text.trim()) return;

    try {
      // Optimistically add user message to history
      if (this._historyData) {
        const userMessage: HistoryMessage = {
          id: `temp_${Date.now()}`,
          role: "user",
          timestamp: new Date().toISOString(),
          parts: [{ type: "text", content: text.trim() }],
        };
        this._historyData.messages.push(userMessage);
        this._render();
        
        // Scroll to bottom
        setTimeout(() => {
          const historyBody = this.querySelector(".history-body");
          if (historyBody) {
            historyBody.scrollTop = historyBody.scrollHeight;
          }
        }, 0);
      }

      const payload: Record<string, unknown> = {
        command: "prompt",
        text: text.trim(),
      };
      
      // Include agent if selected
      if (this._selectedAgent) {
        payload.agent = this._selectedAgent;
      }

      await this._hass.callService("mqtt", "publish", {
        topic: this._historyCommandTopic,
        payload: JSON.stringify(payload),
      });
    } catch (err) {
      console.error("[opencode-card] Failed to send chat message:", err);
    }
  }

  private async _showHistory(deviceId: string, commandTopic: string, responseTopic: string) {
    this._historyDeviceId = deviceId;
    this._historyCommandTopic = commandTopic;
    this._historyResponseTopic = responseTopic;
    this._showHistoryView = true;
    this._historyLoading = true;
    this._selectedAgent = null;
    
    // Track current state for auto-refresh
    const device = this._devices.get(deviceId);
    const stateEntity = device?.entities.get("state");
    this._lastDeviceState = stateEntity?.state ?? "unknown";
    
    // Start auto-refresh if currently working
    this._manageAutoRefresh(this._lastDeviceState);
    
    this._render();

    // Fetch agents in parallel with history
    this._fetchAgents();

    // Check cache first
    const cached = this._loadHistoryFromCache(deviceId);
    if (cached) {
      this._historyData = cached.data;
      this._historyLoading = false;
      this._render();
      
      // Fetch updates since last fetch
      await this._fetchHistorySince(cached.lastFetched);
    } else {
      // Fetch full history
      await this._fetchFullHistory();
    }
  }
  
  private async _fetchAgents() {
    if (!this._hass || !this._historyCommandTopic || !this._historyResponseTopic) return;
    
    this._agentsLoading = true;
    
    const requestId = `agents_${Date.now()}`;
    
    try {
      // Subscribe to response
      const unsubscribe = await this._hass.connection.subscribeMessage(
        (event: unknown) => {
          const triggerEvent = event as { 
            variables?: { 
              trigger?: { 
                topic?: string; 
                payload?: string;
                payload_json?: Record<string, unknown>;
              } 
            } 
          };
          
          const trigger = triggerEvent.variables?.trigger;
          if (trigger?.topic === this._historyResponseTopic) {
            try {
              const response = (trigger.payload_json || JSON.parse(trigger.payload || "{}")) as AgentsResponse;
              if (response.type === "agents" && (!response.request_id || response.request_id === requestId)) {
                this._availableAgents = response.agents;
                this._agentsLoading = false;
                this._render();
                unsubscribe();
              }
            } catch (err) {
              console.error("[opencode-card] Failed to parse agents response:", err);
            }
          }
        },
        {
          type: "subscribe_trigger",
          trigger: {
            platform: "mqtt",
            topic: this._historyResponseTopic,
          },
        }
      );

      // Send agents request
      await this._hass.callService("mqtt", "publish", {
        topic: this._historyCommandTopic,
        payload: JSON.stringify({
          command: "get_agents",
          request_id: requestId,
        }),
      });

      // Auto-unsubscribe after 10 seconds (timeout)
      setTimeout(() => {
        if (this._agentsLoading) {
          this._agentsLoading = false;
          unsubscribe();
        }
      }, 10000);
    } catch (err) {
      console.error("[opencode-card] Failed to fetch agents:", err);
      this._agentsLoading = false;
    }
  }

  private _hideHistoryView() {
    this._showHistoryView = false;
    this._historyLoading = false;
    this._historyData = null;
    this._historyDeviceId = null;
    this._historyCommandTopic = null;
    this._historyResponseTopic = null;
    this._historyVisibleCount = 10; // Reset for next open
    this._isAtBottom = true; // Reset scroll state
    this._availableAgents = [];
    this._selectedAgent = null;
    this._agentsLoading = false;
    this._lastDeviceState = null;
    
    // Stop auto-refresh
    if (this._autoRefreshInterval) {
      clearInterval(this._autoRefreshInterval);
      this._autoRefreshInterval = null;
    }
    
    this._render();
  }

  private _scrollToBottom() {
    const historyBody = this.querySelector(".history-body");
    if (historyBody) {
      historyBody.scrollTop = historyBody.scrollHeight;
      this._isAtBottom = true;
      // Update button visibility
      const scrollBtn = this.querySelector(".scroll-to-bottom-btn");
      if (scrollBtn) {
        scrollBtn.classList.add("hidden");
      }
    }
  }

  private _loadHistoryFromCache(deviceId: string): CachedHistory | null {
    try {
      const cached = localStorage.getItem(getHistoryCacheKey(deviceId));
      if (cached) {
        return JSON.parse(cached) as CachedHistory;
      }
    } catch (err) {
      console.error("[opencode-card] Failed to load history from cache:", err);
    }
    return null;
  }

  private _saveHistoryToCache(deviceId: string, data: HistoryResponse) {
    try {
      const cached: CachedHistory = {
        data,
        lastFetched: data.fetched_at,
      };
      localStorage.setItem(getHistoryCacheKey(deviceId), JSON.stringify(cached));
    } catch (err) {
      console.error("[opencode-card] Failed to save history to cache:", err);
    }
  }

  private async _fetchFullHistory() {
    if (!this._hass || !this._historyCommandTopic || !this._historyResponseTopic || !this._historyDeviceId) return;

    const requestId = `req_${Date.now()}`;

    // Subscribe to response topic
    await this._subscribeToResponse(requestId);

    // Send get_history command
    try {
      await this._hass.callService("mqtt", "publish", {
        topic: this._historyCommandTopic,
        payload: JSON.stringify({
          command: "get_history",
          request_id: requestId,
        }),
      });
    } catch (err) {
      console.error("[opencode-card] Failed to request history:", err);
      this._historyLoading = false;
      this._render();
    }
  }

  private async _fetchHistorySince(since: string) {
    if (!this._hass || !this._historyCommandTopic || !this._historyResponseTopic || !this._historyDeviceId) return;

    const requestId = `req_${Date.now()}`;

    // Subscribe to response topic
    await this._subscribeToResponse(requestId);

    // Send get_history_since command
    try {
      await this._hass.callService("mqtt", "publish", {
        topic: this._historyCommandTopic,
        payload: JSON.stringify({
          command: "get_history_since",
          since,
          request_id: requestId,
        }),
      });
    } catch (err) {
      console.error("[opencode-card] Failed to request history update:", err);
    }
  }

  private async _subscribeToResponse(requestId: string) {
    if (!this._hass || !this._historyResponseTopic) return;

    // Use subscribe_trigger with MQTT trigger for proper MQTT subscription
    try {
      const unsubscribe = await this._hass.connection.subscribeMessage(
        (event: unknown) => {
          // The event from subscribe_trigger contains trigger variables
          const triggerEvent = event as { 
            variables?: { 
              trigger?: { 
                topic?: string; 
                payload?: string;
                payload_json?: Record<string, unknown>;
              } 
            } 
          };
          
          const trigger = triggerEvent.variables?.trigger;
          if (trigger?.topic === this._historyResponseTopic) {
            try {
              // Use payload_json if available, otherwise parse payload
              const response = (trigger.payload_json || JSON.parse(trigger.payload || "{}")) as HistoryResponse;
              if (response.type === "history" && (!response.request_id || response.request_id === requestId)) {
                this._handleHistoryResponse(response);
              }
            } catch (err) {
              console.error("[opencode-card] Failed to parse history response:", err);
            }
          }
        },
        {
          type: "subscribe_trigger",
          trigger: {
            platform: "mqtt",
            topic: this._historyResponseTopic,
          },
        }
      );

      // Store unsubscribe function
      this._mqttUnsubscribe = unsubscribe;

      // Auto-unsubscribe after 30 seconds (timeout)
      setTimeout(() => {
        if (this._mqttUnsubscribe) {
          this._mqttUnsubscribe();
          this._mqttUnsubscribe = null;
        }
        if (this._historyLoading) {
          this._historyLoading = false;
          this._render();
        }
      }, 30000);
    } catch (err) {
      console.error("[opencode-card] Failed to subscribe to response topic:", err);
    }
  }

  private _handleHistoryResponse(response: HistoryResponse) {
    if (!this._historyDeviceId) return;

    const hadNewMessages = response.since && response.messages.length > 0;
    const isInitialLoad = !this._historyData;

    // If this is a "since" response, merge with existing data
    if (response.since && this._historyData) {
      // Append new messages to existing data
      const existingIds = new Set(this._historyData.messages.map(m => m.id));
      const newMessages = response.messages.filter(m => !existingIds.has(m.id));
      this._historyData.messages.push(...newMessages);
      this._historyData.fetched_at = response.fetched_at;
    } else {
      // Full history replacement
      this._historyData = response;
    }

    // Save to cache
    this._saveHistoryToCache(this._historyDeviceId, this._historyData);

    this._historyLoading = false;
    this._render();

    // Auto-scroll to bottom on initial load or when new messages arrive (if already at bottom)
    if (isInitialLoad || (hadNewMessages && this._isAtBottom)) {
      setTimeout(() => this._scrollToBottom(), 0);
    }

    // Unsubscribe
    if (this._mqttUnsubscribe) {
      this._mqttUnsubscribe();
      this._mqttUnsubscribe = null;
    }
  }

  private _refreshHistory() {
    if (!this._historyDeviceId || !this._historyData) return;
    this._historyLoading = true;
    this._render();
    this._fetchHistorySince(this._historyData.fetched_at);
  }

  private async _respondToPermission(response: "once" | "always" | "reject") {
    if (!this._hass || !this._activePermission) return;

    const { commandTopic, permission_id } = this._activePermission;

    // Validate we have required fields before sending
    if (!commandTopic) {
      console.error("[opencode-card] Cannot respond: missing command topic");
      return;
    }
    if (!permission_id) {
      console.error("[opencode-card] Cannot respond: missing permission_id (still loading)");
      return;
    }

    try {
      await this._hass.callService("mqtt", "publish", {
        topic: commandTopic,
        payload: JSON.stringify({
          command: "permission_response",
          permission_id,
          response,
        }),
      });
      
      this._hidePermissionModal();
    } catch (err) {
      console.error("[opencode-card] Failed to send permission response:", err);
    }
  }

  private _render() {
    const title = this._config?.title ?? "OpenCode Sessions";
    const pinnedDevice = this._getPinnedDevice();
    const selectedDevice = this._selectedDeviceId ? this._devices.get(this._selectedDeviceId) : null;

    let content = "";

    // If a device is pinned (via config), show only that device in detailed view (no back button)
    if (pinnedDevice) {
      content = `
        <ha-card>
          <div class="card-content pinned">
            ${this._renderDetailView(pinnedDevice, false)}
          </div>
        </ha-card>
      `;
    } else if (selectedDevice) {
      // If a device is selected (via click), show detail view with back button
      content = `
        <ha-card>
          <div class="card-content pinned">
            ${this._renderDetailView(selectedDevice, true)}
          </div>
        </ha-card>
      `;
    } else {
      // Otherwise show all devices in list view
      content = `
        <ha-card>
          <div class="card-header">
            <div class="name">${title}</div>
          </div>
          <div class="card-content">
            ${this._devices.size === 0 ? this._renderEmpty() : this._renderDevices()}
          </div>
        </ha-card>
      `;
    }

    // Add modal if showing permission
    if (this._showPermissionModal && this._activePermission) {
      content += this._renderPermissionModal(this._activePermission);
    }

    // Add chat/history view if showing
    if (this._showHistoryView) {
      content += this._renderHistoryView();
    }

    this.innerHTML = `
      ${content}
      <style>
        ${this._getStyles()}
      </style>
    `;

    // Attach event listeners after render
    this._attachEventListeners();
  }

  private _attachEventListeners() {
    // Device card click handlers (only in list view, not pinned)
    if (!this._isPinned() && !this._selectedDeviceId) {
      this.querySelectorAll(".device-card[data-device-id]").forEach((el) => {
        el.addEventListener("click", (e) => {
          // Don't navigate if clicking on permission alert
          if ((e.target as HTMLElement).closest(".permission-alert")) {
            return;
          }
          const deviceId = (el as HTMLElement).dataset.deviceId;
          if (deviceId) {
            this._selectDevice(deviceId);
          }
        });
      });
    }

    // Back button handler
    this.querySelector(".back-button")?.addEventListener("click", () => {
      this._goBack();
    });

    // Permission alert click handlers
    this.querySelectorAll(".permission-alert[data-device-id]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const deviceId = (el as HTMLElement).dataset.deviceId;
        if (deviceId) {
          const device = this._devices.get(deviceId);
          if (device) {
            const permission = this._getPermissionDetails(device);
            if (permission) {
              this._showPermission(permission);
            } else {
              // Fallback: show modal with loading state even without permission details
              // This can happen if the fallback alert is rendered but tracking hasn't caught up
              const deviceIdEntity = device.entities.get("device_id");
              const commandTopic = (deviceIdEntity?.attributes?.command_topic as string) ?? "";
              if (commandTopic) {
                this._showPermission({
                  permission_id: "",
                  type: "pending",
                  title: "Permission Required",
                  session_id: "",
                  message_id: "",
                  commandTopic,
                });
              }
            }
          }
        }
      });
    });

    // Permission modal close button (exclude prompt and history modals)
    this.querySelector(".modal-backdrop:not(.history-modal-backdrop)")?.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).classList.contains("modal-backdrop")) {
        this._hidePermissionModal();
      }
    });

    this.querySelector(".modal-close:not(.history-close)")?.addEventListener("click", () => {
      this._hidePermissionModal();
    });

    // Permission response buttons
    this.querySelector(".btn-allow-once")?.addEventListener("click", () => {
      this._respondToPermission("once");
    });

    this.querySelector(".btn-allow-always")?.addEventListener("click", () => {
      this._respondToPermission("always");
    });

    this.querySelector(".btn-reject")?.addEventListener("click", () => {
      this._respondToPermission("reject");
    });

    // Open chat button in detail view
    this.querySelector(".open-chat-btn")?.addEventListener("click", () => {
      const btn = this.querySelector(".open-chat-btn") as HTMLElement;
      const deviceId = btn?.dataset.deviceId;
      const commandTopic = btn?.dataset.commandTopic;
      const responseTopic = btn?.dataset.responseTopic;
      if (deviceId && commandTopic && responseTopic) {
        this._showHistory(deviceId, commandTopic, responseTopic);
      }
    });



    // History modal handlers
    this.querySelector(".history-modal-backdrop")?.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).classList.contains("history-modal-backdrop")) {
        this._hideHistoryView();
      }
    });

    this.querySelector(".history-close")?.addEventListener("click", () => {
      this._hideHistoryView();
    });

    this.querySelector(".history-refresh-btn")?.addEventListener("click", () => {
      this._refreshHistory();
    });

    // Load more history on click
    this.querySelector(".history-load-more")?.addEventListener("click", () => {
      this._loadMoreHistory();
    });

    // Load more history on scroll to top + track scroll position
    const historyBody = this.querySelector(".history-body");
    if (historyBody) {
      historyBody.addEventListener("scroll", () => {
        // If scrolled near top (within 50px), load more
        if (historyBody.scrollTop < 50 && !this._historyLoadingMore) {
          const totalMessages = this._historyData?.messages.length || 0;
          const startIndex = Math.max(0, totalMessages - this._historyVisibleCount);
          if (startIndex > 0) {
            this._loadMoreHistory();
          }
        }
        
        // Track if user is at bottom (within 50px)
        const isAtBottom = historyBody.scrollHeight - historyBody.scrollTop - historyBody.clientHeight < 50;
        if (isAtBottom !== this._isAtBottom) {
          this._isAtBottom = isAtBottom;
          // Update button visibility without full re-render
          const scrollBtn = this.querySelector(".scroll-to-bottom-btn");
          if (scrollBtn) {
            scrollBtn.classList.toggle("hidden", isAtBottom);
          }
        }
      });
    }

    // Scroll to bottom button
    this.querySelector(".scroll-to-bottom-btn")?.addEventListener("click", () => {
      this._scrollToBottom();
    });

    // Chat input handlers
    this.querySelector(".chat-send-btn")?.addEventListener("click", () => {
      const textarea = this.querySelector(".chat-input") as HTMLTextAreaElement;
      if (textarea?.value.trim()) {
        this._sendChatMessage(textarea.value.trim());
        textarea.value = "";
      }
    });

    // Allow Enter to send (Shift+Enter for newline)
    this.querySelector(".chat-input")?.addEventListener("keydown", (e) => {
      const keyEvent = e as KeyboardEvent;
      if (keyEvent.key === "Enter" && !keyEvent.shiftKey) {
        e.preventDefault();
        const textarea = e.target as HTMLTextAreaElement;
        if (textarea?.value.trim()) {
          this._sendChatMessage(textarea.value.trim());
          textarea.value = "";
        }
      }
    });
    
    // Agent selector
    this.querySelector(".agent-selector")?.addEventListener("change", (e) => {
      const select = e.target as HTMLSelectElement;
      this._selectedAgent = select.value || null;
    });
    
    // Inline permission response buttons
    this.querySelectorAll(".inline-perm-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const response = (btn as HTMLElement).dataset.response as "once" | "always" | "reject";
        if (response) {
          this._respondToInlinePermission(response);
        }
      });
    });
  }
  
  private async _respondToInlinePermission(response: "once" | "always" | "reject") {
    if (!this._hass || !this._historyDeviceId) return;
    
    const permission = this._pendingPermissions.get(this._historyDeviceId);
    if (!permission?.permission_id || !permission?.commandTopic) {
      console.error("[opencode-card] Cannot respond: missing permission details");
      return;
    }
    
    try {
      await this._hass.callService("mqtt", "publish", {
        topic: permission.commandTopic,
        payload: JSON.stringify({
          command: "permission_response",
          permission_id: permission.permission_id,
          response,
        }),
      });
      
      // Clear the pending permission for this device
      this._pendingPermissions.delete(this._historyDeviceId);
      
      // Refresh history to show the result
      setTimeout(() => this._refreshHistory(), 500);
    } catch (err) {
      console.error("[opencode-card] Failed to respond to permission:", err);
    }
  }

  private _renderPermissionModal(permission: PermissionDetails): string {
    const hasFullDetails = !!permission.permission_id;
    const buttonsDisabled = !hasFullDetails ? "disabled" : "";
    
    return `
      <div class="modal-backdrop">
        <div class="modal">
          <div class="modal-header">
            <ha-icon icon="mdi:shield-alert"></ha-icon>
            <span class="modal-title">Permission Required</span>
            <button class="modal-close">
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>
          <div class="modal-body">
            <div class="permission-info">
              <div class="permission-main-title">${permission.title}</div>
              <div class="permission-type-badge">${permission.type}</div>
            </div>
            ${!hasFullDetails ? `
              <div class="permission-section">
                <div class="permission-loading">
                  <ha-icon icon="mdi:loading" class="spinning"></ha-icon>
                  <span>Loading permission details...</span>
                </div>
              </div>
            ` : ""}
            ${permission.pattern ? `
              <div class="permission-section">
                <div class="section-label">Pattern</div>
                <code class="pattern-code">${permission.pattern}</code>
              </div>
            ` : ""}
            ${permission.metadata && Object.keys(permission.metadata).length > 0 ? `
              <div class="permission-section">
                <div class="section-label">Details</div>
                <div class="metadata-list">
                  ${Object.entries(permission.metadata).map(([key, value]) => `
                    <div class="metadata-item">
                      <span class="metadata-key">${key}:</span>
                      <span class="metadata-value">${typeof value === "object" ? JSON.stringify(value) : String(value)}</span>
                    </div>
                  `).join("")}
                </div>
              </div>
            ` : ""}
          </div>
          <div class="modal-actions">
            <button class="btn btn-reject" ${buttonsDisabled}>
              <ha-icon icon="mdi:close-circle"></ha-icon>
              Reject
            </button>
            <button class="btn btn-allow-once" ${buttonsDisabled}>
              <ha-icon icon="mdi:check"></ha-icon>
              Allow Once
            </button>
            <button class="btn btn-allow-always" ${buttonsDisabled}>
              <ha-icon icon="mdi:check-all"></ha-icon>
              Always Allow
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private _renderHistoryView(): string {
    const lastFetched = this._historyData?.fetched_at 
      ? new Date(this._historyData.fetched_at).toLocaleString() 
      : "";
    
    // Get current device state for status indicator
    const device = this._historyDeviceId ? this._devices.get(this._historyDeviceId) : null;
    const stateEntity = device?.entities.get("state");
    const currentState = stateEntity?.state ?? "unknown";
    const isWorking = currentState === "working";

    return `
      <div class="modal-backdrop history-modal-backdrop">
        <div class="modal history-modal chat-modal">
          <div class="modal-header history-header">
            <ha-icon icon="mdi:chat"></ha-icon>
            <span class="modal-title">${this._historyData?.session_title || "Chat"}</span>
            <div class="history-header-actions">
              ${isWorking ? `<span class="working-indicator"><ha-icon icon="mdi:loading" class="spinning"></ha-icon></span>` : ""}
              <button class="history-refresh-btn" title="Refresh history" ${this._historyLoading ? "disabled" : ""}>
                <ha-icon icon="mdi:refresh" class="${this._historyLoading ? "spinning" : ""}"></ha-icon>
              </button>
              <button class="modal-close history-close" title="Close">
                <ha-icon icon="mdi:close"></ha-icon>
              </button>
            </div>
          </div>
          <div class="history-body-container">
            <div class="modal-body history-body">
              ${this._historyLoading && !this._historyData ? this._renderHistoryLoading() : ""}
              ${this._historyData ? this._renderHistoryMessages() : ""}
            </div>
            <button class="scroll-to-bottom-btn ${this._isAtBottom ? "hidden" : ""}" title="Scroll to latest">
              <ha-icon icon="mdi:chevron-down"></ha-icon>
            </button>
          </div>
          <div class="chat-input-container">
            ${this._renderAgentSelector()}
            <textarea class="chat-input" placeholder="Type a message... (Enter to send, Shift+Enter for newline)" rows="1"></textarea>
            <button class="chat-send-btn" title="Send message">
              <ha-icon icon="mdi:send"></ha-icon>
            </button>
          </div>
        </div>
      </div>
    `;
  }
  
  private _renderAgentSelector(): string {
    if (this._agentsLoading) {
      return `
        <div class="agent-selector loading">
          <ha-icon icon="mdi:loading" class="spinning"></ha-icon>
        </div>
      `;
    }
    
    if (this._availableAgents.length === 0) {
      return "";
    }
    
    // Filter to only show primary or all mode agents (not subagent-only)
    const selectableAgents = this._availableAgents.filter(a => a.mode === "primary" || a.mode === "all");
    
    if (selectableAgents.length === 0) {
      return "";
    }
    
    const options = selectableAgents.map(agent => {
      const selected = this._selectedAgent === agent.name ? "selected" : "";
      const desc = agent.description ? ` - ${agent.description}` : "";
      return `<option value="${agent.name}" ${selected}>${agent.name}${desc}</option>`;
    }).join("");
    
    return `
      <select class="agent-selector" title="Select agent">
        <option value="" ${!this._selectedAgent ? "selected" : ""}>Default Agent</option>
        ${options}
      </select>
    `;
  }

  private _renderHistoryLoading(): string {
    return `
      <div class="history-loading">
        <ha-icon icon="mdi:loading" class="spinning"></ha-icon>
        <span>Loading history...</span>
      </div>
    `;
  }

  private _renderHistoryMessages(): string {
    if (!this._historyData || this._historyData.messages.length === 0) {
      return `
        <div class="history-empty">
          <ha-icon icon="mdi:message-off"></ha-icon>
          <span>No messages in this session</span>
        </div>
      `;
    }

    const totalMessages = this._historyData.messages.length;
    const startIndex = Math.max(0, totalMessages - this._historyVisibleCount);
    const visibleMessages = this._historyData.messages.slice(startIndex);
    const hasMore = startIndex > 0;

    let html = "";

    // Show "load more" indicator at top if there are older messages
    if (hasMore) {
      const remainingCount = startIndex;
      html += `
        <div class="history-load-more" data-action="load-more">
          <ha-icon icon="${this._historyLoadingMore ? "mdi:loading" : "mdi:chevron-up"}" class="${this._historyLoadingMore ? "spinning" : ""}"></ha-icon>
          <span>${this._historyLoadingMore ? "Loading..." : `Load ${Math.min(remainingCount, OpenCodeCard.HISTORY_PAGE_SIZE)} more (${remainingCount} remaining)`}</span>
        </div>
      `;
    }

    html += visibleMessages.map(msg => this._renderHistoryMessage(msg)).join("");
    
    // Add permission card if waiting for permission
    html += this._renderInlinePermission();

    return html;
  }
  
  private _renderInlinePermission(): string {
    if (!this._historyDeviceId) return "";
    
    const device = this._devices.get(this._historyDeviceId);
    if (!device) return "";
    
    const stateEntity = device.entities.get("state");
    const currentState = stateEntity?.state ?? "unknown";
    
    if (currentState !== "waiting_permission") return "";
    
    // Get permission details from tracked permissions
    const permission = this._pendingPermissions.get(this._historyDeviceId);
    const hasFullDetails = permission?.permission_id;
    
    return `
      <div class="inline-permission">
        <div class="inline-permission-header">
          <ha-icon icon="mdi:shield-alert"></ha-icon>
          <span class="inline-permission-title">${permission?.title || "Permission Required"}</span>
        </div>
        <div class="inline-permission-body">
          ${permission?.type ? `<div class="inline-permission-type">${permission.type}</div>` : ""}
          ${permission?.pattern ? `
            <div class="inline-permission-section">
              <div class="inline-permission-label">Pattern</div>
              <code class="inline-permission-code">${permission.pattern}</code>
            </div>
          ` : ""}
          ${permission?.metadata && Object.keys(permission.metadata).length > 0 ? `
            <div class="inline-permission-section">
              <div class="inline-permission-label">Details</div>
              <div class="inline-permission-metadata">
                ${Object.entries(permission.metadata).map(([key, value]) => `
                  <div class="inline-metadata-item">
                    <span class="inline-metadata-key">${key}:</span>
                    <span class="inline-metadata-value">${typeof value === "object" ? JSON.stringify(value) : String(value)}</span>
                  </div>
                `).join("")}
              </div>
            </div>
          ` : ""}
          ${!hasFullDetails ? `
            <div class="inline-permission-loading">
              <ha-icon icon="mdi:loading" class="spinning"></ha-icon>
              <span>Loading details...</span>
            </div>
          ` : ""}
        </div>
        <div class="inline-permission-actions">
          <button class="inline-perm-btn reject" data-response="reject" ${!hasFullDetails ? "disabled" : ""}>
            <ha-icon icon="mdi:close-circle"></ha-icon>
            Reject
          </button>
          <button class="inline-perm-btn allow-once" data-response="once" ${!hasFullDetails ? "disabled" : ""}>
            <ha-icon icon="mdi:check"></ha-icon>
            Allow Once
          </button>
          <button class="inline-perm-btn allow-always" data-response="always" ${!hasFullDetails ? "disabled" : ""}>
            <ha-icon icon="mdi:check-all"></ha-icon>
            Always
          </button>
        </div>
      </div>
    `;
  }

  private _loadMoreHistory() {
    if (!this._historyData || this._historyLoadingMore) return;
    
    const totalMessages = this._historyData.messages.length;
    const currentStart = Math.max(0, totalMessages - this._historyVisibleCount);
    
    if (currentStart <= 0) return; // Already showing all messages
    
    this._historyLoadingMore = true;
    this._render();
    
    // Small delay to show loading state, then load more
    setTimeout(() => {
      this._historyVisibleCount += OpenCodeCard.HISTORY_PAGE_SIZE;
      this._historyLoadingMore = false;
      
      // Re-render but maintain scroll position near top
      const historyBody = this.querySelector(".history-body");
      const previousScrollHeight = historyBody?.scrollHeight || 0;
      
      this._render();
      
      // Adjust scroll to keep user at roughly same position
      const newHistoryBody = this.querySelector(".history-body");
      if (newHistoryBody && previousScrollHeight > 0) {
        const newScrollHeight = newHistoryBody.scrollHeight;
        const scrollDiff = newScrollHeight - previousScrollHeight;
        newHistoryBody.scrollTop = scrollDiff;
      }
    }, 100);
  }

  private _renderHistoryMessage(msg: HistoryMessage): string {
    const isUser = msg.role === "user";
    const timeInfo = formatRelativeTime(msg.timestamp);
    
    // Render parts
    const partsHtml = msg.parts.map(part => {
      if (part.type === "text" && part.content) {
        return `<div class="history-text">${this._escapeHtml(part.content)}</div>`;
      } else if (part.type === "tool_call") {
        const hasOutput = part.tool_output || part.tool_error;
        return `
          <div class="history-tool">
            <div class="tool-header">
              <ha-icon icon="mdi:tools"></ha-icon>
              <span class="tool-name">${part.tool_name || "unknown"}</span>
            </div>
            ${part.tool_args ? `<pre class="tool-args">${this._escapeHtml(JSON.stringify(part.tool_args, null, 2))}</pre>` : ""}
            ${hasOutput ? `
              <div class="tool-result ${part.tool_error ? "error" : ""}">
                <span class="tool-result-label">${part.tool_error ? "Error:" : "Output:"}</span>
                <pre class="tool-output">${this._escapeHtml(part.tool_error || part.tool_output || "")}</pre>
              </div>
            ` : ""}
          </div>
        `;
      } else if (part.type === "image") {
        return `<div class="history-image"><ha-icon icon="mdi:image"></ha-icon> ${part.content || "Image"}</div>`;
      }
      return "";
    }).join("");

    // Metadata for assistant messages
    let metaHtml = "";
    if (!isUser && (msg.model || msg.tokens_input || msg.cost)) {
      const metaParts: string[] = [];
      if (msg.model) metaParts.push(msg.model);
      if (msg.tokens_input || msg.tokens_output) {
        metaParts.push(`${msg.tokens_input || 0}/${msg.tokens_output || 0} tokens`);
      }
      if (msg.cost) metaParts.push(`$${msg.cost.toFixed(4)}`);
      metaHtml = `<div class="message-meta">${metaParts.join(" · ")}</div>`;
    }

    return `
      <div class="history-message ${isUser ? "user" : "assistant"}">
        <div class="message-header">
          <ha-icon icon="${isUser ? "mdi:account" : "mdi:robot"}"></ha-icon>
          <span class="message-role">${isUser ? "You" : "Assistant"}</span>
          <span class="message-time" title="${timeInfo.tooltip}">${timeInfo.display}</span>
        </div>
        <div class="message-content">
          ${partsHtml}
        </div>
        ${metaHtml}
      </div>
    `;
  }

  private _escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  private _renderEmpty(): string {
    return `
      <div class="empty-state">
        <ha-icon icon="mdi:code-braces-box"></ha-icon>
        <p>No OpenCode sessions found</p>
      </div>
    `;
  }

  private _renderDevices(): string {
    const deviceHtml: string[] = [];

    for (const [, device] of this._devices) {
      deviceHtml.push(this._renderDevice(device));
    }

    return deviceHtml.join("");
  }

  private _renderDetailView(device: OpenCodeDevice, showBackButton: boolean): string {
    const stateEntity = device.entities.get("state");
    const sessionEntity = device.entities.get("session_title");
    const modelEntity = device.entities.get("model");
    const toolEntity = device.entities.get("current_tool");
    const deviceIdEntity = device.entities.get("device_id");
    const costEntity = device.entities.get("cost");
    const tokensInputEntity = device.entities.get("tokens_input");
    const tokensOutputEntity = device.entities.get("tokens_output");
    const lastActivityEntity = device.entities.get("last_activity");

    const state = stateEntity?.state ?? "unknown";
    const stateConfig = STATE_CONFIG[state] || STATE_CONFIG.unknown;
    const sessionTitle = sessionEntity?.state ?? "Unknown Session";
    const model = modelEntity?.state ?? "unknown";
    const currentTool = toolEntity?.state ?? "none";
    const commandTopic = (deviceIdEntity?.attributes?.command_topic as string) ?? "unknown";
    const responseTopic = (deviceIdEntity?.attributes?.response_topic as string) ?? "";
    const cost = costEntity?.state ?? "0";
    const tokensIn = tokensInputEntity?.state ?? "0";
    const tokensOut = tokensOutputEntity?.state ?? "0";
    const lastActivity = lastActivityEntity?.state ?? "";
    
    // Agent info from state entity attributes
    const agent = (stateEntity?.attributes?.agent as string) || null;
    const currentAgent = (stateEntity?.attributes?.current_agent as string) || null;
    const hostname = (stateEntity?.attributes?.hostname as string) || null;

    // Format last activity
    let activityDisplay = "";
    if (lastActivity) {
      const date = new Date(lastActivity);
      activityDisplay = date.toLocaleTimeString();
    }

    // Permission alert - now clickable (uses tracked permissions for reliability)
    const permission = this._getPermissionDetails(device);
    let permissionHtml = "";
    if (permission) {
      const hasFullDetails = !!permission.permission_id;
      permissionHtml = `
        <div class="permission-alert pinned clickable" data-device-id="${device.deviceId}">
          <ha-icon icon="mdi:shield-alert"></ha-icon>
          <div class="permission-details">
            <div class="permission-title">${permission.title}</div>
            <div class="permission-type">${permission.type}${!hasFullDetails ? " (loading...)" : ""}</div>
          </div>
          <ha-icon icon="mdi:chevron-right" class="permission-chevron"></ha-icon>
        </div>
      `;
    } else if (state === "waiting_permission") {
      // Fallback: show clickable alert even without full details
      permissionHtml = `
        <div class="permission-alert pinned clickable" data-device-id="${device.deviceId}">
          <ha-icon icon="mdi:shield-alert"></ha-icon>
          <div class="permission-details">
            <div class="permission-title">Permission Required</div>
            <div class="permission-type">Tap to view details</div>
          </div>
          <ha-icon icon="mdi:chevron-right" class="permission-chevron"></ha-icon>
        </div>
      `;
    }

    const backButtonHtml = showBackButton ? `
      <button class="back-button" data-action="back">
        <ha-icon icon="mdi:arrow-left"></ha-icon>
        <span>Back</span>
      </button>
    ` : "";

    return `
      <div class="detail-view">
        ${backButtonHtml}
        <div class="detail-header">
          <div class="detail-status ${state === 'working' ? 'pulse' : ''}" style="background: ${stateConfig.color}20; border-color: ${stateConfig.color}">
            <ha-icon icon="${stateConfig.icon}" style="color: ${stateConfig.color}"></ha-icon>
            <span class="status-text" style="color: ${stateConfig.color}">${stateConfig.label}</span>
          </div>
          <div class="detail-project-info">
            <div class="detail-project">${device.deviceName.replace("OpenCode - ", "")}</div>
            ${hostname ? `<div class="detail-hostname"><ha-icon icon="mdi:server"></ha-icon> ${hostname}</div>` : ""}
          </div>
        </div>

        <div class="detail-session">
          <ha-icon icon="mdi:message-text"></ha-icon>
          <span class="session-title">${sessionTitle}</span>
        </div>

        ${permissionHtml}

        <div class="detail-info">
          <div class="detail-row">
            <ha-icon icon="mdi:brain"></ha-icon>
            <span class="detail-label">Model</span>
            <span class="detail-value mono">${model}</span>
          </div>
          ${agent ? `
          <div class="detail-row">
            <ha-icon icon="mdi:account-cog"></ha-icon>
            <span class="detail-label">Agent</span>
            <span class="detail-value agent-badge">${agent}${currentAgent && currentAgent !== agent ? ` <span class="sub-agent-indicator"><ha-icon icon="mdi:arrow-right"></ha-icon> ${currentAgent}</span>` : ""}</span>
          </div>
          ` : ""}
          ${currentTool !== "none" ? `
          <div class="detail-row highlight">
            <ha-icon icon="mdi:tools"></ha-icon>
            <span class="detail-label">Tool</span>
            <span class="detail-value mono tool-active">${currentTool}</span>
          </div>
          ` : ""}
          <div class="detail-row">
            <ha-icon icon="mdi:clock-outline"></ha-icon>
            <span class="detail-label">Last Activity</span>
            <span class="detail-value">${activityDisplay || "—"}</span>
          </div>
        </div>

        <div class="detail-stats">
          <div class="stat">
            <ha-icon icon="mdi:currency-usd"></ha-icon>
            <span class="stat-value">$${parseFloat(cost).toFixed(4)}</span>
            <span class="stat-label">Cost</span>
          </div>
          <div class="stat">
            <ha-icon icon="mdi:arrow-right-bold"></ha-icon>
            <span class="stat-value">${Number(tokensIn).toLocaleString()}</span>
            <span class="stat-label">In</span>
          </div>
          <div class="stat">
            <ha-icon icon="mdi:arrow-left-bold"></ha-icon>
            <span class="stat-value">${Number(tokensOut).toLocaleString()}</span>
            <span class="stat-label">Out</span>
          </div>
        </div>

        <div class="detail-actions">
          <button class="open-chat-btn" data-device-id="${device.deviceId}" data-command-topic="${commandTopic}" data-response-topic="${responseTopic}">
            <ha-icon icon="mdi:chat"></ha-icon>
            <span>Chat</span>
          </button>
        </div>

        <div class="detail-footer">
          <code class="command-topic">${commandTopic}</code>
        </div>
      </div>
    `;
  }

  private _renderDevice(device: OpenCodeDevice): string {
    const stateEntity = device.entities.get("state");
    const sessionEntity = device.entities.get("session_title");
    const modelEntity = device.entities.get("model");
    const toolEntity = device.entities.get("current_tool");
    const deviceIdEntity = device.entities.get("device_id");
    const costEntity = device.entities.get("cost");
    const tokensInputEntity = device.entities.get("tokens_input");
    const tokensOutputEntity = device.entities.get("tokens_output");

    const state = stateEntity?.state ?? "unknown";
    const stateConfig = STATE_CONFIG[state] || STATE_CONFIG.unknown;
    const sessionTitle = sessionEntity?.state ?? "Unknown Session";
    const model = modelEntity?.state ?? "unknown";
    const currentTool = toolEntity?.state ?? "none";
    const commandTopic = (deviceIdEntity?.attributes?.command_topic as string) ?? "unknown";
    const cost = costEntity?.state ?? "0";
    const tokensIn = tokensInputEntity?.state ?? "0";
    const tokensOut = tokensOutputEntity?.state ?? "0";
    
    // Agent info from state entity attributes
    const currentAgent = (stateEntity?.attributes?.current_agent as string) || null;

    // Permission alert - now clickable (uses tracked permissions for reliability)
    const permission = this._getPermissionDetails(device);
    let permissionHtml = "";
    if (permission) {
      const hasFullDetails = !!permission.permission_id;
      permissionHtml = `
        <div class="permission-alert clickable" data-device-id="${device.deviceId}">
          <ha-icon icon="mdi:shield-alert"></ha-icon>
          <div class="permission-details">
            <div class="permission-title">${permission.title}</div>
            <div class="permission-type">${permission.type}${!hasFullDetails ? " (loading...)" : ""}</div>
          </div>
          <ha-icon icon="mdi:chevron-right" class="permission-chevron"></ha-icon>
        </div>
      `;
    } else if (state === "waiting_permission") {
      // Fallback: show clickable alert even without full details
      permissionHtml = `
        <div class="permission-alert clickable" data-device-id="${device.deviceId}">
          <ha-icon icon="mdi:shield-alert"></ha-icon>
          <div class="permission-details">
            <div class="permission-title">Permission Required</div>
            <div class="permission-type">Tap to view details</div>
          </div>
          <ha-icon icon="mdi:chevron-right" class="permission-chevron"></ha-icon>
        </div>
      `;
    }

    return `
      <div class="device-card clickable" data-device-id="${device.deviceId}">
        <div class="device-header">
          <div class="device-status ${state === 'working' ? 'pulse' : ''}">
            <ha-icon icon="${stateConfig.icon}" style="color: ${stateConfig.color}"></ha-icon>
            <span class="status-label" style="color: ${stateConfig.color}">${stateConfig.label}</span>
          </div>
          <div class="device-name">${device.deviceName.replace("OpenCode - ", "")}</div>
          <ha-icon icon="mdi:chevron-right" class="device-chevron"></ha-icon>
        </div>
        
        <div class="device-info">
          <div class="info-row">
            <ha-icon icon="mdi:message-text"></ha-icon>
            <span class="info-label">Session:</span>
            <span class="info-value">${sessionTitle}</span>
          </div>
          <div class="info-row">
            <ha-icon icon="mdi:brain"></ha-icon>
            <span class="info-label">Model:</span>
            <span class="info-value model">${model}</span>
          </div>
          ${currentTool !== "none" ? `
          <div class="info-row">
            <ha-icon icon="mdi:tools"></ha-icon>
            <span class="info-label">Tool:</span>
            <span class="info-value tool">${currentTool}</span>
          </div>
          ` : ""}
          ${currentAgent ? `
          <div class="info-row">
            <ha-icon icon="mdi:account-switch"></ha-icon>
            <span class="info-label">Sub-agent:</span>
            <span class="info-value sub-agent">${currentAgent}</span>
          </div>
          ` : ""}
          <div class="info-row stats">
            <ha-icon icon="mdi:currency-usd"></ha-icon>
            <span class="stat-value">$${parseFloat(cost).toFixed(4)}</span>
            <ha-icon icon="mdi:arrow-right-bold"></ha-icon>
            <span class="stat-value">${tokensIn}</span>
            <ha-icon icon="mdi:arrow-left-bold"></ha-icon>
            <span class="stat-value">${tokensOut}</span>
          </div>
        </div>

        ${permissionHtml}
      </div>
    `;
  }

  private _getStyles(): string {
    return `
      ha-card {
        padding: 0;
        position: relative;
      }
      .card-header {
        padding: 16px 16px 0;
      }
      .card-header .name {
        font-size: 1.2em;
        font-weight: 500;
      }
      .card-content {
        padding: 16px;
      }
      .card-content.pinned {
        padding: 0;
      }
      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 32px;
        color: var(--secondary-text-color);
      }
      .empty-state ha-icon {
        --mdc-icon-size: 48px;
        margin-bottom: 16px;
      }

      /* Pulse animation for working state */
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
      }
      .pulse {
        animation: pulse 2s ease-in-out infinite;
      }
      .pulse ha-icon {
        animation: pulse 1s ease-in-out infinite;
      }

      /* List view styles */
      .device-card {
        background: var(--card-background-color);
        border: 1px solid var(--divider-color);
        border-radius: 8px;
        padding: 16px;
        margin-bottom: 12px;
      }
      .device-card.clickable {
        cursor: pointer;
        transition: background 0.2s, border-color 0.2s, transform 0.1s;
      }
      .device-card.clickable:hover {
        background: var(--secondary-background-color);
        border-color: var(--primary-color);
      }
      .device-card.clickable:active {
        transform: scale(0.99);
      }
      .device-card:last-child {
        margin-bottom: 0;
      }
      .device-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 12px;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--divider-color);
      }
      .device-status {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .device-status ha-icon {
        --mdc-icon-size: 24px;
      }
      .status-label {
        font-weight: 500;
        text-transform: uppercase;
        font-size: 0.85em;
      }
      .device-name {
        flex: 1;
        font-weight: 500;
        color: var(--primary-text-color);
      }
      .device-chevron {
        --mdc-icon-size: 20px;
        color: var(--secondary-text-color);
      }
      .device-info {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .info-row {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.9em;
      }
      .info-row ha-icon {
        --mdc-icon-size: 18px;
        color: var(--secondary-text-color);
      }
      .info-label {
        color: var(--secondary-text-color);
        min-width: 60px;
      }
      .info-value {
        color: var(--primary-text-color);
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .info-value.model {
        font-family: monospace;
        font-size: 0.85em;
      }
      .info-value.tool {
        font-family: monospace;
        color: var(--info-color, #2196f3);
      }
      .info-value.sub-agent {
        font-weight: 500;
        color: var(--accent-color, #673ab7);
      }
      .info-row.stats {
        margin-top: 4px;
        gap: 12px;
      }
      .stat-value {
        font-family: monospace;
        font-size: 0.85em;
        color: var(--secondary-text-color);
      }
      .device-footer {
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid var(--divider-color);
      }

      /* Detail view styles */
      .detail-view {
        padding: 16px;
      }
      .back-button {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        margin-bottom: 16px;
        background: var(--secondary-background-color);
        border: none;
        border-radius: 8px;
        cursor: pointer;
        color: var(--primary-text-color);
        font-size: 0.9em;
        transition: background 0.2s;
      }
      .back-button:hover {
        background: var(--divider-color);
      }
      .back-button ha-icon {
        --mdc-icon-size: 18px;
        color: var(--secondary-text-color);
      }
      .detail-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
      }
      .detail-status {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        border-radius: 24px;
        border: 1px solid;
      }
      .detail-status ha-icon {
        --mdc-icon-size: 20px;
      }
      .status-text {
        font-weight: 600;
        text-transform: uppercase;
        font-size: 0.8em;
        letter-spacing: 0.5px;
      }
      .detail-project-info {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 2px;
      }
      .detail-project {
        font-weight: 500;
        font-size: 1.1em;
        color: var(--primary-text-color);
      }
      .detail-hostname {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 0.75em;
        color: var(--secondary-text-color);
      }
      .detail-hostname ha-icon {
        --mdc-icon-size: 12px;
      }
      .detail-session {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        background: var(--secondary-background-color);
        border-radius: 8px;
        margin-bottom: 16px;
      }
      .detail-session ha-icon {
        --mdc-icon-size: 20px;
        color: var(--secondary-text-color);
      }
      .session-title {
        font-size: 1em;
        color: var(--primary-text-color);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .detail-info {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 16px;
      }
      .detail-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 0;
      }
      .detail-row ha-icon {
        --mdc-icon-size: 18px;
        color: var(--secondary-text-color);
      }
      .detail-label {
        color: var(--secondary-text-color);
        min-width: 100px;
        font-size: 0.9em;
      }
      .detail-value {
        flex: 1;
        color: var(--primary-text-color);
      }
      .detail-value.mono {
        font-family: monospace;
        font-size: 0.9em;
      }
      .detail-value.tool-active {
        color: var(--info-color, #2196f3);
        font-weight: 500;
      }
      .detail-value.agent-badge {
        display: flex;
        align-items: center;
        gap: 4px;
        font-weight: 500;
        color: var(--primary-text-color);
      }
      .sub-agent-indicator {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 8px;
        background: var(--accent-color, #673ab7);
        color: white;
        border-radius: 12px;
        font-size: 0.85em;
        font-weight: 500;
      }
      .sub-agent-indicator ha-icon {
        --mdc-icon-size: 14px;
      }
      .detail-row.highlight {
        background: var(--info-color, #2196f3);
        background: rgba(33, 150, 243, 0.1);
        margin: 0 -16px;
        padding: 8px 16px;
        border-radius: 8px;
      }
      .detail-stats {
        display: flex;
        justify-content: space-around;
        padding: 16px;
        background: var(--secondary-background-color);
        border-radius: 8px;
        margin-bottom: 16px;
      }
      .stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
      }
      .stat ha-icon {
        --mdc-icon-size: 20px;
        color: var(--secondary-text-color);
      }
      .stat .stat-value {
        font-size: 1.1em;
        font-weight: 500;
        color: var(--primary-text-color);
      }
      .stat .stat-label {
        font-size: 0.75em;
        color: var(--secondary-text-color);
        text-transform: uppercase;
      }
      .detail-actions {
        display: flex;
        gap: 8px;
        margin-bottom: 16px;
      }
      .detail-footer {
        padding-top: 12px;
        border-top: 1px solid var(--divider-color);
      }

      /* Permission alert styles */
      .permission-alert {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 12px;
        padding: 12px;
        background: rgba(255, 152, 0, 0.15);
        border: 1px solid var(--warning-color, #ff9800);
        border-radius: 8px;
      }
      .permission-alert.clickable {
        cursor: pointer;
        transition: background 0.2s, transform 0.1s;
      }
      .permission-alert.clickable:hover {
        background: rgba(255, 152, 0, 0.25);
      }
      .permission-alert.clickable:active {
        transform: scale(0.98);
      }
      .permission-alert.pinned {
        margin: 0 0 16px 0;
        padding: 16px;
      }
      .permission-alert ha-icon {
        --mdc-icon-size: 24px;
        color: var(--warning-color, #ff9800);
      }
      .permission-details {
        flex: 1;
      }
      .permission-title {
        font-weight: 500;
        color: var(--primary-text-color);
      }
      .permission-type {
        font-size: 0.85em;
        color: var(--secondary-text-color);
      }
      .permission-chevron {
        --mdc-icon-size: 20px;
        color: var(--secondary-text-color);
      }

      .command-topic {
        display: block;
        font-size: 0.75em;
        color: var(--secondary-text-color);
        background: var(--secondary-background-color);
        padding: 4px 8px;
        border-radius: 4px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* Modal styles */
      .modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999;
        padding: 16px;
      }
      .modal {
        background: var(--card-background-color);
        border-radius: 16px;
        max-width: 480px;
        width: 100%;
        max-height: 80vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      }
      .modal-header {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px 20px;
        border-bottom: 1px solid var(--divider-color);
        background: rgba(255, 152, 0, 0.1);
      }
      .modal-header ha-icon {
        --mdc-icon-size: 28px;
        color: var(--warning-color, #ff9800);
      }
      .modal-title {
        flex: 1;
        font-size: 1.2em;
        font-weight: 600;
        color: var(--primary-text-color);
      }
      .modal-close {
        background: none;
        border: none;
        padding: 8px;
        cursor: pointer;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .modal-close:hover {
        background: var(--secondary-background-color);
      }
      .modal-close ha-icon {
        --mdc-icon-size: 20px;
        color: var(--secondary-text-color);
      }
      .modal-body {
        padding: 20px;
        overflow-y: auto;
      }
      .permission-info {
        margin-bottom: 20px;
      }
      .permission-main-title {
        font-size: 1.1em;
        font-weight: 500;
        color: var(--primary-text-color);
        margin-bottom: 8px;
      }
      .permission-type-badge {
        display: inline-block;
        padding: 4px 12px;
        background: var(--warning-color, #ff9800);
        color: white;
        border-radius: 12px;
        font-size: 0.8em;
        font-weight: 500;
        text-transform: uppercase;
      }
      .permission-section {
        margin-bottom: 16px;
      }
      .permission-loading {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px;
        background: rgba(255, 152, 0, 0.1);
        border-radius: 8px;
        color: var(--secondary-text-color);
      }
      .permission-loading ha-icon {
        --mdc-icon-size: 20px;
        color: var(--warning-color, #ff9800);
      }
      .section-label {
        font-size: 0.85em;
        font-weight: 500;
        color: var(--secondary-text-color);
        margin-bottom: 8px;
        text-transform: uppercase;
      }
      .pattern-code {
        display: block;
        padding: 12px;
        background: var(--secondary-background-color);
        border-radius: 8px;
        font-size: 0.9em;
        word-break: break-all;
        color: var(--primary-text-color);
      }
      .metadata-list {
        background: var(--secondary-background-color);
        border-radius: 8px;
        padding: 12px;
      }
      .metadata-item {
        display: flex;
        gap: 8px;
        padding: 4px 0;
        font-size: 0.9em;
      }
      .metadata-key {
        color: var(--secondary-text-color);
        font-weight: 500;
      }
      .metadata-value {
        color: var(--primary-text-color);
        word-break: break-all;
      }
      .modal-actions {
        display: flex;
        gap: 8px;
        padding: 16px 20px;
        border-top: 1px solid var(--divider-color);
        background: var(--secondary-background-color);
      }
      .btn {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 12px 16px;
        border: none;
        border-radius: 8px;
        font-size: 0.9em;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.2s, transform 0.1s;
      }
      .btn:active {
        transform: scale(0.97);
      }
      .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
      }
      .btn:disabled:hover {
        background: inherit;
      }
      .btn ha-icon {
        --mdc-icon-size: 18px;
      }
      .btn-reject {
        background: var(--error-color, #f44336);
        color: white;
      }
      .btn-reject:hover {
        background: #d32f2f;
      }
      .btn-allow-once {
        background: var(--primary-color, #03a9f4);
        color: white;
      }
      .btn-allow-once:hover {
        background: #0288d1;
      }
      .btn-allow-always {
        background: var(--success-color, #4caf50);
        color: white;
      }
      .btn-allow-always:hover {
        background: #388e3c;
      }

      .btn-cancel {
        background: var(--secondary-background-color);
        color: var(--primary-text-color);
      }
      .btn-cancel:hover {
        background: var(--divider-color);
      }
      .btn-send {
        background: var(--primary-color, #03a9f4);
        color: white;
      }
      .btn-send:hover {
        background: #0288d1;
      }

      /* History modal styles */
      .history-modal {
        max-width: 600px;
        max-height: 85vh;
      }
      .history-header {
        background: rgba(103, 58, 183, 0.1);
      }
      .history-header ha-icon {
        color: var(--info-color, #673ab7);
      }
      .history-header-actions {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .history-refresh-btn {
        background: none;
        border: none;
        padding: 8px;
        cursor: pointer;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .history-refresh-btn:hover:not(:disabled) {
        background: var(--secondary-background-color);
      }
      .history-refresh-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .history-refresh-btn ha-icon {
        --mdc-icon-size: 20px;
        color: var(--secondary-text-color);
      }
      .history-subheader {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 20px;
        background: var(--secondary-background-color);
        border-bottom: 1px solid var(--divider-color);
        font-size: 0.9em;
      }
      .history-title {
        font-weight: 500;
        color: var(--primary-text-color);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
      }
      .history-fetched {
        color: var(--secondary-text-color);
        font-size: 0.85em;
        margin-left: 12px;
      }
      .history-body-container {
        position: relative;
        flex: 1;
        min-height: 0;
      }
      .history-body {
        padding: 16px 20px;
        overflow-y: auto;
        max-height: calc(85vh - 180px);
        height: 100%;
      }
      .scroll-to-bottom-btn {
        position: absolute;
        bottom: 12px;
        right: 24px;
        width: 36px;
        height: 36px;
        border: none;
        border-radius: 50%;
        background: var(--primary-color, #03a9f4);
        color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        transition: opacity 0.2s, transform 0.2s;
        z-index: 10;
      }
      .scroll-to-bottom-btn:hover {
        transform: scale(1.1);
      }
      .scroll-to-bottom-btn.hidden {
        opacity: 0;
        pointer-events: none;
        transform: translateY(10px);
      }
      .scroll-to-bottom-btn ha-icon {
        --mdc-icon-size: 24px;
      }
      .history-loading, .history-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px;
        color: var(--secondary-text-color);
        gap: 12px;
      }
      .history-loading ha-icon, .history-empty ha-icon {
        --mdc-icon-size: 36px;
      }

      /* Spinning animation */
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      .spinning {
        animation: spin 1s linear infinite;
      }

      /* Load more history button */
      .history-load-more {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 12px;
        margin-bottom: 16px;
        background: var(--secondary-background-color);
        border: 1px dashed var(--divider-color);
        border-radius: 8px;
        cursor: pointer;
        color: var(--secondary-text-color);
        font-size: 0.9em;
        transition: background 0.2s, border-color 0.2s;
      }
      .history-load-more:hover {
        background: var(--divider-color);
        border-color: var(--primary-color);
        color: var(--primary-text-color);
      }
      .history-load-more ha-icon {
        --mdc-icon-size: 18px;
      }

      /* History message styles */
      .history-message {
        margin-bottom: 16px;
        padding: 12px;
        border-radius: 12px;
        background: var(--secondary-background-color);
      }
      .history-message:last-child {
        margin-bottom: 0;
      }
      .history-message.user {
        background: rgba(3, 169, 244, 0.1);
        border: 1px solid rgba(3, 169, 244, 0.2);
      }
      .history-message.assistant {
        background: var(--secondary-background-color);
        border: 1px solid var(--divider-color);
      }
      .message-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--divider-color);
      }
      .message-header ha-icon {
        --mdc-icon-size: 18px;
      }
      .history-message.user .message-header ha-icon {
        color: var(--primary-color, #03a9f4);
      }
      .history-message.assistant .message-header ha-icon {
        color: var(--success-color, #4caf50);
      }
      .message-role {
        font-weight: 500;
        font-size: 0.9em;
        color: var(--primary-text-color);
      }
      .message-time {
        margin-left: auto;
        font-size: 0.8em;
        color: var(--secondary-text-color);
      }
      .message-content {
        color: var(--primary-text-color);
        font-size: 0.95em;
        line-height: 1.5;
      }
      .message-meta {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid var(--divider-color);
        font-size: 0.75em;
        color: var(--secondary-text-color);
        font-family: monospace;
      }

      /* History text content */
      .history-text {
        white-space: pre-wrap;
        word-break: break-word;
        margin-bottom: 8px;
      }
      .history-text:last-child {
        margin-bottom: 0;
      }

      /* History tool call styles */
      .history-tool {
        margin: 8px 0;
        padding: 12px;
        background: var(--card-background-color);
        border-radius: 8px;
        border: 1px solid var(--divider-color);
      }
      .history-tool:last-child {
        margin-bottom: 0;
      }
      .tool-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
      }
      .tool-header ha-icon {
        --mdc-icon-size: 16px;
        color: var(--info-color, #2196f3);
      }
      .tool-name {
        font-weight: 500;
        font-size: 0.9em;
        color: var(--info-color, #2196f3);
        font-family: monospace;
      }
      .tool-args {
        margin: 8px 0;
        padding: 8px 12px;
        background: var(--secondary-background-color);
        border-radius: 6px;
        font-size: 0.8em;
        overflow-x: auto;
        white-space: pre;
        max-height: 150px;
        overflow-y: auto;
      }
      .tool-result {
        margin-top: 8px;
        padding: 8px 12px;
        background: rgba(76, 175, 80, 0.1);
        border-radius: 6px;
        border-left: 3px solid var(--success-color, #4caf50);
      }
      .tool-result.error {
        background: rgba(244, 67, 54, 0.1);
        border-left-color: var(--error-color, #f44336);
      }
      .tool-result-label {
        display: block;
        font-size: 0.8em;
        font-weight: 500;
        margin-bottom: 4px;
        color: var(--secondary-text-color);
      }
      .tool-output {
        margin: 0;
        font-size: 0.8em;
        white-space: pre-wrap;
        word-break: break-word;
        max-height: 200px;
        overflow-y: auto;
      }

      /* History image placeholder */
      .history-image {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: var(--secondary-background-color);
        border-radius: 6px;
        color: var(--secondary-text-color);
        font-size: 0.9em;
      }
      .history-image ha-icon {
        --mdc-icon-size: 18px;
      }

      /* Chat modal styles */
      .chat-modal {
        display: flex;
        flex-direction: column;
      }
      .chat-modal .history-body {
        flex: 1;
        max-height: calc(85vh - 180px);
      }
      .chat-input-container {
        display: flex;
        align-items: flex-end;
        gap: 8px;
        padding: 12px 20px;
        background: var(--card-background-color);
        border-top: 1px solid var(--divider-color);
      }
      .chat-input {
        flex: 1;
        padding: 10px 14px;
        border: 1px solid var(--divider-color);
        border-radius: 20px;
        background: var(--secondary-background-color);
        color: var(--primary-text-color);
        font-size: 0.95em;
        font-family: inherit;
        resize: none;
        min-height: 20px;
        max-height: 120px;
        outline: none;
        transition: border-color 0.2s;
      }
      .chat-input:focus {
        border-color: var(--primary-color, #03a9f4);
      }
      .chat-input::placeholder {
        color: var(--secondary-text-color);
      }
      .chat-send-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border: none;
        border-radius: 50%;
        background: var(--primary-color, #03a9f4);
        color: white;
        cursor: pointer;
        transition: background 0.2s, transform 0.1s;
        flex-shrink: 0;
      }
      .chat-send-btn:hover {
        background: #0288d1;
      }
      .chat-send-btn:active {
        transform: scale(0.95);
      }
      .chat-send-btn ha-icon {
        --mdc-icon-size: 20px;
      }

      /* Open chat button style */
      .open-chat-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        width: 100%;
        padding: 12px 16px;
        background: var(--primary-color, #03a9f4);
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 1em;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.2s, transform 0.1s;
      }
      .open-chat-btn:hover {
        background: #0288d1;
      }
      .open-chat-btn:active {
        transform: scale(0.98);
      }
      .open-chat-btn ha-icon {
        --mdc-icon-size: 20px;
      }

      /* Agent selector */
      .agent-selector {
        padding: 8px 12px;
        border: 1px solid var(--divider-color);
        border-radius: 20px;
        background: var(--secondary-background-color);
        color: var(--primary-text-color);
        font-size: 0.85em;
        font-family: inherit;
        outline: none;
        cursor: pointer;
        min-width: 100px;
        max-width: 150px;
        transition: border-color 0.2s;
      }
      .agent-selector:focus {
        border-color: var(--primary-color, #03a9f4);
      }
      .agent-selector.loading {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        border: none;
        background: transparent;
      }
      .agent-selector.loading ha-icon {
        --mdc-icon-size: 18px;
        color: var(--secondary-text-color);
      }
      
      /* Working indicator in header */
      .working-indicator {
        display: flex;
        align-items: center;
        padding: 4px 8px;
        background: rgba(33, 150, 243, 0.2);
        border-radius: 12px;
        margin-right: 4px;
      }
      .working-indicator ha-icon {
        --mdc-icon-size: 16px;
        color: var(--info-color, #2196f3);
      }

      /* Tooltip for timestamps */
      .message-time {
        cursor: help;
      }
      .message-time:hover {
        text-decoration: underline dotted;
      }
      
      /* Inline permission card in chat */
      .inline-permission {
        margin-top: 16px;
        padding: 16px;
        background: rgba(255, 152, 0, 0.1);
        border: 1px solid var(--warning-color, #ff9800);
        border-radius: 12px;
      }
      .inline-permission-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 12px;
      }
      .inline-permission-header ha-icon {
        --mdc-icon-size: 24px;
        color: var(--warning-color, #ff9800);
      }
      .inline-permission-title {
        font-weight: 600;
        font-size: 1.05em;
        color: var(--primary-text-color);
      }
      .inline-permission-body {
        margin-bottom: 12px;
      }
      .inline-permission-type {
        display: inline-block;
        padding: 4px 10px;
        background: var(--warning-color, #ff9800);
        color: white;
        border-radius: 12px;
        font-size: 0.8em;
        font-weight: 500;
        margin-bottom: 10px;
      }
      .inline-permission-section {
        margin-top: 10px;
      }
      .inline-permission-label {
        font-size: 0.8em;
        font-weight: 500;
        color: var(--secondary-text-color);
        margin-bottom: 4px;
        text-transform: uppercase;
      }
      .inline-permission-code {
        display: block;
        padding: 8px 12px;
        background: var(--card-background-color);
        border-radius: 6px;
        font-size: 0.85em;
        word-break: break-all;
      }
      .inline-permission-metadata {
        padding: 8px 12px;
        background: var(--card-background-color);
        border-radius: 6px;
        font-size: 0.85em;
      }
      .inline-metadata-item {
        display: flex;
        gap: 8px;
        margin-bottom: 4px;
      }
      .inline-metadata-item:last-child {
        margin-bottom: 0;
      }
      .inline-metadata-key {
        font-weight: 500;
        color: var(--secondary-text-color);
      }
      .inline-metadata-value {
        color: var(--primary-text-color);
        word-break: break-word;
      }
      .inline-permission-loading {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--secondary-text-color);
        font-size: 0.9em;
        padding: 8px 0;
      }
      .inline-permission-loading ha-icon {
        --mdc-icon-size: 18px;
      }
      .inline-permission-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .inline-perm-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        border: none;
        border-radius: 20px;
        font-size: 0.9em;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.2s, transform 0.1s, opacity 0.2s;
      }
      .inline-perm-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .inline-perm-btn:not(:disabled):active {
        transform: scale(0.97);
      }
      .inline-perm-btn ha-icon {
        --mdc-icon-size: 16px;
      }
      .inline-perm-btn.reject {
        background: rgba(244, 67, 54, 0.15);
        color: var(--error-color, #f44336);
      }
      .inline-perm-btn.reject:not(:disabled):hover {
        background: rgba(244, 67, 54, 0.25);
      }
      .inline-perm-btn.allow-once {
        background: rgba(76, 175, 80, 0.15);
        color: var(--success-color, #4caf50);
      }
      .inline-perm-btn.allow-once:not(:disabled):hover {
        background: rgba(76, 175, 80, 0.25);
      }
      .inline-perm-btn.allow-always {
        background: var(--success-color, #4caf50);
        color: white;
      }
      .inline-perm-btn.allow-always:not(:disabled):hover {
        background: #388e3c;
      }
    `;
  }

  static getConfigElement() {
    return document.createElement("opencode-card-editor");
  }

  static getStubConfig() {
    return {
      title: "OpenCode Sessions",
    };
  }
}

// Visual config editor with device selector
class OpenCodeCardEditor extends HTMLElement {
  private _config?: CardConfig;
  private _hass?: HomeAssistant;
  private _devices: DeviceRegistryEntry[] = [];

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    this._fetchDevices();
  }

  setConfig(config: CardConfig) {
    this._config = config;
    this._render();
  }

  private async _fetchDevices() {
    if (!this._hass) return;

    try {
      const deviceResponse = await this._hass.callWS({
        type: "config/device_registry/list",
      }) as DeviceRegistryEntry[];
      
      this._devices = deviceResponse.filter(d => d.manufacturer === "OpenCode");
      this._render();
    } catch (err) {
      console.error("[opencode-card-editor] Failed to fetch devices:", err);
    }
  }

  private _render() {
    const currentDevice = this._config?.device ?? "";
    const currentTitle = this._config?.title ?? "";

    this.innerHTML = `
      <div class="editor">
        <div class="field">
          <label for="title">Title</label>
          <input type="text" id="title" value="${currentTitle}" placeholder="OpenCode Sessions">
          <div class="hint">Leave empty to use default title. Hidden when device is selected.</div>
        </div>
        <div class="field">
          <label for="device">Pin to Device</label>
          <select id="device">
            <option value="">Show all devices</option>
            ${this._devices.map(d => `
              <option value="${d.id}" ${d.id === currentDevice ? "selected" : ""}>
                ${d.name}
              </option>
            `).join("")}
          </select>
          <div class="hint">Select a device to show detailed view for that device only.</div>
        </div>
      </div>
      <style>
        .editor {
          padding: 16px;
        }
        .field {
          margin-bottom: 16px;
        }
        .field:last-child {
          margin-bottom: 0;
        }
        label {
          display: block;
          font-weight: 500;
          margin-bottom: 8px;
          color: var(--primary-text-color);
        }
        input, select {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid var(--divider-color);
          border-radius: 4px;
          background: var(--card-background-color);
          color: var(--primary-text-color);
          font-size: 1em;
          box-sizing: border-box;
        }
        input:focus, select:focus {
          outline: none;
          border-color: var(--primary-color);
        }
        .hint {
          font-size: 0.85em;
          color: var(--secondary-text-color);
          margin-top: 4px;
        }
      </style>
    `;

    // Add event listeners
    const titleInput = this.querySelector("#title") as HTMLInputElement;
    const deviceSelect = this.querySelector("#device") as HTMLSelectElement;

    titleInput?.addEventListener("input", (ev) => this._valueChanged("title", (ev.target as HTMLInputElement).value));
    deviceSelect?.addEventListener("change", (ev) => this._valueChanged("device", (ev.target as HTMLSelectElement).value));
  }

  private _valueChanged(field: string, value: string) {
    const newConfig = {
      ...this._config,
      [field]: value || undefined,
    };

    // Clean up empty values
    if (!newConfig.title) delete newConfig.title;
    if (!newConfig.device) delete newConfig.device;
    
    const event = new CustomEvent("config-changed", {
      detail: { config: newConfig },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }
}

// Register the card
customElements.define("opencode-card", OpenCodeCard);
customElements.define("opencode-card-editor", OpenCodeCardEditor);

// Register with Home Assistant
(window as unknown as { customCards: { type: string; name: string; description: string }[] }).customCards = 
  (window as unknown as { customCards: { type: string; name: string; description: string }[] }).customCards || [];
(window as unknown as { customCards: { type: string; name: string; description: string }[] }).customCards.push({
  type: "opencode-card",
  name: "OpenCode Card",
  description: "Display OpenCode sessions and their states",
});

console.info("%c OPENCODE-CARD %c 0.1.0 ", "color: white; background: #2196f3; font-weight: bold;", "color: #2196f3; background: white; font-weight: bold;");
