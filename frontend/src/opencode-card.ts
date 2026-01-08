/**
 * OpenCode Card - Home Assistant Custom Card
 * Displays OpenCode sessions with their states
 * 
 * Native integration version - uses HA services and events instead of MQTT
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
  sessionId: string;
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

interface PermissionDetails {
  permission_id: string;
  type: string;
  title: string;
  session_id: string;
  pattern?: string;
  metadata?: Record<string, unknown>;
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

interface StateChangeEvent {
  session_id: string;
  previous_state: string;
  new_state: string;
  hostname: string;
  session_title: string;
}

interface HistoryResponseEvent {
  session_id: string;
  request_id?: string;
  history: HistoryResponse;
}

interface AgentsResponseEvent {
  session_id: string;
  request_id?: string;
  agents: AgentInfo[];
}

// Cache key helper
function getHistoryCacheKey(sessionId: string): string {
  return `opencode_history_${sessionId}`;
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
  private _selectedDeviceId: string | null = null;
  private _showHistoryView = false;
  private _historyLoading = false;
  private _historyData: HistoryResponse | null = null;
  private _historySessionId: string | null = null;
  private _historyDeviceId: string | null = null;
  // Lazy loading state
  private _historyVisibleCount = 10;
  private _historyLoadingMore = false;
  private static readonly HISTORY_PAGE_SIZE = 10;
  // Scroll tracking
  private _isAtBottom = true;
  // Track pending permissions per device
  private _pendingPermissions: Map<string, PermissionDetails> = new Map();
  // Track last rendered state
  private _lastRenderHash: string = "";
  // Agent selection
  private _availableAgents: AgentInfo[] = [];
  private _selectedAgent: string | null = null;
  private _agentsLoading = false;
  // Auto-refresh when working
  private _autoRefreshInterval: ReturnType<typeof setInterval> | null = null;
  private _lastDeviceState: string | null = null;
  // Sorting
  private _sortMode: "activity" | "name" = "activity";
  // Event subscriptions
  private _stateChangeUnsubscribe: (() => void) | null = null;
  private _historyResponseUnsubscribe: (() => void) | null = null;
  private _agentsResponseUnsubscribe: (() => void) | null = null;
  // TTS state
  private _speakingMessageId: string | null = null;

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    if (!this._initialized) {
      this._initialize();
    } else {
      this._updateDevices();
      
      if (this._showHistoryView && this._historyDeviceId) {
        const device = this._devices.get(this._historyDeviceId);
        const stateEntity = device?.entities.get("state");
        const currentState = stateEntity?.state ?? "unknown";
        
        if (this._lastDeviceState !== null && this._lastDeviceState !== currentState) {
          this._refreshHistory();
        }
        this._lastDeviceState = currentState;
        this._manageAutoRefresh(currentState);
        return;
      }
      
      if (this._showPermissionModal && this._activePermission) {
        const deviceId = this._findDeviceIdForPermission(this._activePermission);
        if (deviceId) {
          const updatedPermission = this._pendingPermissions.get(deviceId);
          if (updatedPermission && updatedPermission.permission_id && !this._activePermission.permission_id) {
            this._activePermission = updatedPermission;
            this._render();
            return;
          }
        }
        return;
      }
      
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
      if (!this._autoRefreshInterval) {
        this._autoRefreshInterval = setInterval(() => {
          if (this._showHistoryView && !this._historyLoading) {
            this._refreshHistory();
          }
        }, refreshInterval);
      }
    } else {
      if (this._autoRefreshInterval) {
        clearInterval(this._autoRefreshInterval);
        this._autoRefreshInterval = null;
      }
    }
  }

  private _computeStateHash(): string {
    const hashParts: string[] = [];
    
    for (const [deviceId, device] of this._devices) {
      const stateEntity = device.entities.get("state");
      const sessionEntity = device.entities.get("session_title");
      const modelEntity = device.entities.get("model");
      const toolEntity = device.entities.get("current_tool");
      const costEntity = device.entities.get("cost");
      const tokensInEntity = device.entities.get("tokens_input");
      const tokensOutEntity = device.entities.get("tokens_output");
      const permissionEntity = device.entities.get("permission_pending");
      const activityEntity = device.entities.get("last_activity");
      
      const agent = stateEntity?.attributes?.agent as string | null;
      const currentAgent = stateEntity?.attributes?.current_agent as string | null;
      
      hashParts.push(`${deviceId}:${stateEntity?.state}:${sessionEntity?.state}:${modelEntity?.state}:${toolEntity?.state}:${costEntity?.state}:${tokensInEntity?.state}:${tokensOutEntity?.state}:${permissionEntity?.state}:${activityEntity?.state}:${agent}:${currentAgent}`);
      
      if (permissionEntity?.state === "on") {
        hashParts.push(`perm:${permissionEntity.attributes?.permission_id}`);
      }
    }
    
    for (const [deviceId, perm] of this._pendingPermissions) {
      hashParts.push(`pending:${deviceId}:${perm.permission_id}`);
    }
    
    return hashParts.join("|");
  }

  private _findDeviceIdForPermission(permission: PermissionDetails): string | null {
    for (const [deviceId, device] of this._devices) {
      if (device.sessionId === permission.session_id) {
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
    
    await this._fetchRegistries();
    this._updateDevices();
    await this._setupEventSubscriptions();
    this._render();
  }

  private async _setupEventSubscriptions() {
    if (!this._hass) return;

    // Subscribe to state changes
    this._stateChangeUnsubscribe = await this._hass.connection.subscribeEvents(
      (event: unknown) => {
        const data = (event as { data: StateChangeEvent }).data;
        // Trigger re-render on state changes
        this._updateDevices();
        const currentHash = this._computeStateHash();
        if (currentHash !== this._lastRenderHash) {
          this._lastRenderHash = currentHash;
          this._render();
        }
      },
      "opencode_state_change"
    );

    // Subscribe to history responses
    this._historyResponseUnsubscribe = await this._hass.connection.subscribeEvents(
      (event: unknown) => {
        const data = (event as { data: HistoryResponseEvent }).data;
        if (this._historySessionId && data.session_id === this._historySessionId) {
          this._handleHistoryResponse(data.history);
        }
      },
      "opencode_history_response"
    );

    // Subscribe to agents responses
    this._agentsResponseUnsubscribe = await this._hass.connection.subscribeEvents(
      (event: unknown) => {
        const data = (event as { data: AgentsResponseEvent }).data;
        if (this._historySessionId && data.session_id === this._historySessionId) {
          this._availableAgents = data.agents;
          this._agentsLoading = false;
          this._render();
        }
      },
      "opencode_agents_response"
    );
  }

  disconnectedCallback() {
    // Clean up subscriptions
    if (this._stateChangeUnsubscribe) {
      this._stateChangeUnsubscribe();
      this._stateChangeUnsubscribe = null;
    }
    if (this._historyResponseUnsubscribe) {
      this._historyResponseUnsubscribe();
      this._historyResponseUnsubscribe = null;
    }
    if (this._agentsResponseUnsubscribe) {
      this._agentsResponseUnsubscribe();
      this._agentsResponseUnsubscribe = null;
    }
    if (this._autoRefreshInterval) {
      clearInterval(this._autoRefreshInterval);
      this._autoRefreshInterval = null;
    }
    // Stop any ongoing speech synthesis
    this._stopSpeaking();
  }

  private async _fetchRegistries() {
    if (!this._hass) return;

    try {
      const deviceResponse = await this._hass.callWS({
        type: "config/device_registry/list",
      }) as DeviceRegistryEntry[];
      
      for (const device of deviceResponse) {
        if (device.manufacturer === "OpenCode") {
          this._deviceRegistry.set(device.id, device);
        }
      }

      const entityResponse = await this._hass.callWS({
        type: "config/entity_registry/list",
      }) as EntityRegistryEntry[];

      for (const entity of entityResponse) {
        // Changed from "mqtt" to "opencode"
        if (entity.platform === "opencode" && this._deviceRegistry.has(entity.device_id)) {
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

    for (const [entityId, entityEntry] of this._entityRegistry) {
      const device = this._deviceRegistry.get(entityEntry.device_id);
      if (!device) continue;

      const state = this._hass.states[entityId];
      if (!state) continue;

      let openCodeDevice = this._devices.get(device.id);
      if (!openCodeDevice) {
        // Extract session ID from state entity attributes or device sw_version
        const sessionId = device.identifiers?.[0]?.[1]?.replace("opencode_", "ses_") || "";
        
        openCodeDevice = {
          deviceId: device.id,
          deviceName: device.name,
          sessionId: sessionId,
          entities: new Map(),
        };
        this._devices.set(device.id, openCodeDevice);
      }

      // Extract entity key from unique_id
      const uniqueId = entityEntry.unique_id || "";
      const deviceIdentifier = device.identifiers?.[0]?.[1] || "";
      let entityKey = "";
      
      if (deviceIdentifier && uniqueId.startsWith(deviceIdentifier + "_")) {
        entityKey = uniqueId.slice(deviceIdentifier.length + 1);
      } else {
        const knownKeys = ["state", "session_title", "model", "current_tool", 
                          "tokens_input", "tokens_output", "cost", "last_activity", "permission_pending"];
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

    this._updatePendingPermissions();
  }

  private _updatePendingPermissions() {
    for (const [deviceId, device] of this._devices) {
      const permissionEntity = device.entities.get("permission_pending");
      const stateEntity = device.entities.get("state");

      // Binary sensor: "on" means permission is pending
      if (permissionEntity?.state === "on" && permissionEntity.attributes) {
        const attrs = permissionEntity.attributes;
        if (attrs.permission_id && attrs.permission_title) {
          this._pendingPermissions.set(deviceId, {
            permission_id: attrs.permission_id as string,
            type: attrs.permission_type as string || "unknown",
            title: attrs.permission_title as string,
            session_id: device.sessionId,
            pattern: attrs.pattern as string | undefined,
            metadata: attrs.metadata as Record<string, unknown> | undefined,
          });
        }
      } else if (stateEntity?.state !== "waiting_permission" || permissionEntity?.state === "off") {
        this._pendingPermissions.delete(deviceId);
      } else if (stateEntity?.state === "waiting_permission" && !this._pendingPermissions.has(deviceId)) {
        this._pendingPermissions.set(deviceId, {
          permission_id: "",
          type: "pending",
          title: "Permission Required",
          session_id: device.sessionId,
        });
      }
    }
  }

  private _getPinnedDevice(): OpenCodeDevice | null {
    if (!this._config?.device) return null;
    return this._devices.get(this._config.device) || null;
  }

  private _getPermissionDetails(device: OpenCodeDevice): PermissionDetails | null {
    const tracked = this._pendingPermissions.get(device.deviceId);
    if (tracked && tracked.permission_id) {
      return tracked;
    }

    const permissionEntity = device.entities.get("permission_pending");
    
    if (permissionEntity?.state !== "on" || !permissionEntity.attributes) {
      if (tracked) {
        return tracked;
      }
      return null;
    }

    const attrs = permissionEntity.attributes;
    return {
      permission_id: attrs.permission_id as string,
      type: attrs.permission_type as string,
      title: attrs.permission_title as string,
      session_id: device.sessionId,
      pattern: attrs.pattern as string | undefined,
      metadata: attrs.metadata as Record<string, unknown> | undefined,
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
    if (!this._hass || !this._historySessionId || !text.trim()) return;

    try {
      // Optimistically add user message
      if (this._historyData) {
        const userMessage: HistoryMessage = {
          id: `temp_${Date.now()}`,
          role: "user",
          timestamp: new Date().toISOString(),
          parts: [{ type: "text", content: text.trim() }],
        };
        this._historyData.messages.push(userMessage);
        this._render();
        
        setTimeout(() => {
          const historyBody = this.querySelector(".history-body");
          if (historyBody) {
            historyBody.scrollTop = historyBody.scrollHeight;
          }
        }, 0);
      }

      // Call the opencode.send_prompt service
      const serviceData: Record<string, unknown> = {
        session_id: this._historySessionId,
        text: text.trim(),
      };
      
      if (this._selectedAgent) {
        serviceData.agent = this._selectedAgent;
      }

      await this._hass.callService("opencode", "send_prompt", serviceData);
    } catch (err) {
      console.error("[opencode-card] Failed to send chat message:", err);
    }
  }

  private async _showHistory(deviceId: string, sessionId: string) {
    this._historyDeviceId = deviceId;
    this._historySessionId = sessionId;
    this._showHistoryView = true;
    this._historyLoading = true;
    this._selectedAgent = null;
    
    const device = this._devices.get(deviceId);
    const stateEntity = device?.entities.get("state");
    this._lastDeviceState = stateEntity?.state ?? "unknown";
    
    this._manageAutoRefresh(this._lastDeviceState);
    this._render();

    // Fetch agents
    this._fetchAgents();

    // Check cache first
    const cached = this._loadHistoryFromCache(sessionId);
    if (cached) {
      this._historyData = cached.data;
      this._historyLoading = false;
      this._render();
      await this._fetchHistorySince(cached.lastFetched);
    } else {
      await this._fetchFullHistory();
    }
  }
  
  private async _fetchAgents() {
    if (!this._hass || !this._historySessionId) return;
    
    this._agentsLoading = true;
    
    try {
      await this._hass.callService("opencode", "get_agents", {
        session_id: this._historySessionId,
        request_id: `agents_${Date.now()}`,
      });

      // Response comes via event subscription
      setTimeout(() => {
        if (this._agentsLoading) {
          this._agentsLoading = false;
          this._render();
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
    this._historySessionId = null;
    this._historyVisibleCount = 10;
    this._isAtBottom = true;
    this._availableAgents = [];
    this._selectedAgent = null;
    this._agentsLoading = false;
    this._lastDeviceState = null;
    
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
      const scrollBtn = this.querySelector(".scroll-to-bottom-btn");
      if (scrollBtn) {
        scrollBtn.classList.add("hidden");
      }
    }
  }

  private _loadHistoryFromCache(sessionId: string): CachedHistory | null {
    try {
      const cached = localStorage.getItem(getHistoryCacheKey(sessionId));
      if (cached) {
        return JSON.parse(cached) as CachedHistory;
      }
    } catch (err) {
      console.error("[opencode-card] Failed to load history from cache:", err);
    }
    return null;
  }

  private _saveHistoryToCache(sessionId: string, data: HistoryResponse) {
    try {
      const cached: CachedHistory = {
        data,
        lastFetched: data.fetched_at,
      };
      localStorage.setItem(getHistoryCacheKey(sessionId), JSON.stringify(cached));
    } catch (err) {
      console.error("[opencode-card] Failed to save history to cache:", err);
    }
  }

  private async _fetchFullHistory() {
    if (!this._hass || !this._historySessionId) return;

    try {
      await this._hass.callService("opencode", "get_history", {
        session_id: this._historySessionId,
        request_id: `req_${Date.now()}`,
      });
      // Response comes via event subscription
    } catch (err) {
      console.error("[opencode-card] Failed to request history:", err);
      this._historyLoading = false;
      this._render();
    }
  }

  private async _fetchHistorySince(since: string) {
    if (!this._hass || !this._historySessionId) return;

    try {
      await this._hass.callService("opencode", "get_history", {
        session_id: this._historySessionId,
        since,
        request_id: `req_${Date.now()}`,
      });
    } catch (err) {
      console.error("[opencode-card] Failed to request history update:", err);
    }
  }

  private _handleHistoryResponse(response: HistoryResponse) {
    if (!this._historySessionId) return;

    const hadNewMessages = response.since && response.messages.length > 0;
    const isInitialLoad = !this._historyData;

    if (response.since && this._historyData) {
      const existingIds = new Set(this._historyData.messages.map(m => m.id));
      const newMessages = response.messages.filter(m => !existingIds.has(m.id));
      this._historyData.messages.push(...newMessages);
      this._historyData.fetched_at = response.fetched_at;
    } else {
      this._historyData = response;
    }

    this._saveHistoryToCache(this._historySessionId, this._historyData);

    this._historyLoading = false;
    this._render();

    if (isInitialLoad || (hadNewMessages && this._isAtBottom)) {
      setTimeout(() => this._scrollToBottom(), 0);
    }
  }

  private _refreshHistory() {
    if (!this._historySessionId || !this._historyData) return;
    this._historyLoading = true;
    this._render();
    this._fetchHistorySince(this._historyData.fetched_at);
  }

  private async _respondToPermission(response: "once" | "always" | "reject") {
    if (!this._hass || !this._activePermission) return;

    const { permission_id, session_id } = this._activePermission;

    if (!permission_id) {
      console.error("[opencode-card] Cannot respond: missing permission_id");
      return;
    }

    try {
      await this._hass.callService("opencode", "respond_permission", {
        session_id,
        permission_id,
        response,
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

    if (pinnedDevice) {
      content = `
        <ha-card>
          <div class="card-content pinned">
            ${this._renderDetailView(pinnedDevice, false)}
          </div>
        </ha-card>
      `;
    } else if (selectedDevice) {
      content = `
        <ha-card>
          <div class="card-content pinned">
            ${this._renderDetailView(selectedDevice, true)}
          </div>
        </ha-card>
      `;
    } else {
      const sortIcon = this._sortMode === "activity" ? "mdi:sort-clock-descending" : "mdi:sort-alphabetical-ascending";
      const sortTitle = this._sortMode === "activity" ? "Sorted by latest activity" : "Sorted by name";
      content = `
        <ha-card>
          <div class="card-header">
            <div class="name">${title}</div>
            ${this._devices.size > 1 ? `
              <button class="sort-toggle" title="${sortTitle}">
                <ha-icon icon="${sortIcon}"></ha-icon>
              </button>
            ` : ""}
          </div>
          <div class="card-content">
            ${this._devices.size === 0 ? this._renderEmpty() : this._renderDevices()}
          </div>
        </ha-card>
      `;
    }

    if (this._showPermissionModal && this._activePermission) {
      content += this._renderPermissionModal(this._activePermission);
    }

    if (this._showHistoryView) {
      content += this._renderHistoryView();
    }

    this.innerHTML = `
      ${content}
      <style>
        ${this._getStyles()}
      </style>
    `;

    this._attachEventListeners();
  }

  private _attachEventListeners() {
    if (!this._isPinned() && !this._selectedDeviceId) {
      this.querySelectorAll(".device-card[data-device-id]").forEach((el) => {
        el.addEventListener("click", (e) => {
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

    this.querySelector(".back-button")?.addEventListener("click", () => {
      this._goBack();
    });

    this.querySelector(".sort-toggle")?.addEventListener("click", () => {
      this._sortMode = this._sortMode === "activity" ? "name" : "activity";
      this._render();
    });

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
              this._showPermission({
                permission_id: "",
                type: "pending",
                title: "Permission Required",
                session_id: device.sessionId,
              });
            }
          }
        }
      });
    });

    this.querySelector(".modal-backdrop:not(.history-modal-backdrop)")?.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).classList.contains("modal-backdrop")) {
        this._hidePermissionModal();
      }
    });

    this.querySelector(".modal-close:not(.history-close)")?.addEventListener("click", () => {
      this._hidePermissionModal();
    });

    this.querySelector(".btn-allow-once")?.addEventListener("click", () => {
      this._respondToPermission("once");
    });

    this.querySelector(".btn-allow-always")?.addEventListener("click", () => {
      this._respondToPermission("always");
    });

    this.querySelector(".btn-reject")?.addEventListener("click", () => {
      this._respondToPermission("reject");
    });

    this.querySelector(".open-chat-btn")?.addEventListener("click", () => {
      const btn = this.querySelector(".open-chat-btn") as HTMLElement;
      const deviceId = btn?.dataset.deviceId;
      const sessionId = btn?.dataset.sessionId;
      if (deviceId && sessionId) {
        this._showHistory(deviceId, sessionId);
      }
    });

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

    this.querySelector(".history-load-more")?.addEventListener("click", () => {
      this._loadMoreHistory();
    });

    const historyBody = this.querySelector(".history-body");
    if (historyBody) {
      historyBody.addEventListener("scroll", () => {
        if (historyBody.scrollTop < 50 && !this._historyLoadingMore) {
          const totalMessages = this._historyData?.messages.length || 0;
          const startIndex = Math.max(0, totalMessages - this._historyVisibleCount);
          if (startIndex > 0) {
            this._loadMoreHistory();
          }
        }
        
        const isAtBottom = historyBody.scrollHeight - historyBody.scrollTop - historyBody.clientHeight < 50;
        if (isAtBottom !== this._isAtBottom) {
          this._isAtBottom = isAtBottom;
          const scrollBtn = this.querySelector(".scroll-to-bottom-btn");
          if (scrollBtn) {
            scrollBtn.classList.toggle("hidden", isAtBottom);
          }
        }
      });
    }

    this.querySelector(".scroll-to-bottom-btn")?.addEventListener("click", () => {
      this._scrollToBottom();
    });

    this.querySelector(".chat-send-btn")?.addEventListener("click", () => {
      const textarea = this.querySelector(".chat-input") as HTMLTextAreaElement;
      if (textarea?.value.trim()) {
        this._sendChatMessage(textarea.value.trim());
        textarea.value = "";
      }
    });

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
    
    this.querySelector(".agent-selector")?.addEventListener("change", (e) => {
      const select = e.target as HTMLSelectElement;
      this._selectedAgent = select.value || null;
    });
    
    this.querySelectorAll(".inline-perm-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const response = (btn as HTMLElement).dataset.response as "once" | "always" | "reject";
        if (response) {
          this._respondToInlinePermission(response);
        }
      });
    });
    
    // TTS speak buttons
    this.querySelectorAll(".speak-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const messageId = (btn as HTMLElement).dataset.messageId;
        if (!messageId) return;
        
        // If this message is currently speaking, stop it
        if (this._speakingMessageId === messageId) {
          this._stopSpeaking();
          this._render();
          return;
        }
        
        // Find the message and extract text
        const msg = this._historyData?.messages.find(m => m.id === messageId);
        if (msg) {
          const text = this._extractTextFromMessage(msg);
          if (text) {
            this._speakMessage(messageId, text);
          }
        }
      });
    });
  }
  
  private async _respondToInlinePermission(response: "once" | "always" | "reject") {
    if (!this._hass || !this._historyDeviceId) return;
    
    const permission = this._pendingPermissions.get(this._historyDeviceId);
    if (!permission?.permission_id) {
      console.error("[opencode-card] Cannot respond: missing permission details");
      return;
    }
    
    try {
      await this._hass.callService("opencode", "respond_permission", {
        session_id: permission.session_id,
        permission_id: permission.permission_id,
        response,
      });
      
      this._pendingPermissions.delete(this._historyDeviceId);
      setTimeout(() => this._refreshHistory(), 500);
    } catch (err) {
      console.error("[opencode-card] Failed to respond to permission:", err);
    }
  }

  private _speakMessage(messageId: string, text: string) {
    // Stop any currently speaking message
    if (this._speakingMessageId) {
      this._stopSpeaking();
    }

    // Check if speech synthesis is available
    if (!("speechSynthesis" in window)) {
      console.warn("[opencode-card] Speech synthesis not supported in this browser");
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    
    utterance.onstart = () => {
      this._speakingMessageId = messageId;
      this._render();
    };
    
    utterance.onend = () => {
      this._speakingMessageId = null;
      this._render();
    };
    
    utterance.onerror = () => {
      this._speakingMessageId = null;
      this._render();
    };

    window.speechSynthesis.speak(utterance);
  }

  private _stopSpeaking() {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    this._speakingMessageId = null;
  }

  private _extractTextFromMessage(msg: HistoryMessage): string {
    return msg.parts
      .filter(part => part.type === "text" && part.content)
      .map(part => part.content)
      .join("\n");
  }

  private _loadMoreHistory() {
    if (!this._historyData || this._historyLoadingMore) return;
    
    const totalMessages = this._historyData.messages.length;
    const currentStart = Math.max(0, totalMessages - this._historyVisibleCount);
    
    if (currentStart <= 0) return;
    
    this._historyLoadingMore = true;
    this._render();
    
    setTimeout(() => {
      this._historyVisibleCount += OpenCodeCard.HISTORY_PAGE_SIZE;
      this._historyLoadingMore = false;
      
      const historyBody = this.querySelector(".history-body");
      const previousScrollHeight = historyBody?.scrollHeight || 0;
      
      this._render();
      
      const newHistoryBody = this.querySelector(".history-body");
      if (newHistoryBody && previousScrollHeight > 0) {
        const newScrollHeight = newHistoryBody.scrollHeight;
        const scrollDiff = newScrollHeight - previousScrollHeight;
        newHistoryBody.scrollTop = scrollDiff;
      }
    }, 100);
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

  private _renderHistoryMessage(msg: HistoryMessage): string {
    const isUser = msg.role === "user";
    const timeInfo = formatRelativeTime(msg.timestamp);
    
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

    // Add speak button for assistant messages that have text content
    const hasTextContent = msg.parts.some(part => part.type === "text" && part.content);
    const isSpeaking = this._speakingMessageId === msg.id;
    const speakButtonHtml = !isUser && hasTextContent ? `
      <button class="speak-btn ${isSpeaking ? "speaking" : ""}" data-message-id="${msg.id}" title="${isSpeaking ? "Stop speaking" : "Read aloud"}">
        <ha-icon icon="${isSpeaking ? "mdi:stop" : "mdi:volume-high"}"></ha-icon>
      </button>
    ` : "";

    return `
      <div class="history-message ${isUser ? "user" : "assistant"}">
        <div class="message-header">
          <ha-icon icon="${isUser ? "mdi:account" : "mdi:robot"}"></ha-icon>
          <span class="message-role">${isUser ? "You" : "Assistant"}</span>
          <span class="message-time" title="${timeInfo.tooltip}">${timeInfo.display}</span>
          ${speakButtonHtml}
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
    let devices = Array.from(this._devices.values());
    
    if (this._sortMode === "activity") {
      devices.sort((a, b) => {
        const aActivity = a.entities.get("last_activity")?.state ?? "";
        const bActivity = b.entities.get("last_activity")?.state ?? "";
        if (!aActivity && !bActivity) return 0;
        if (!aActivity) return 1;
        if (!bActivity) return -1;
        return new Date(bActivity).getTime() - new Date(aActivity).getTime();
      });
    } else {
      devices.sort((a, b) => {
        const aName = a.deviceName.replace("OpenCode - ", "").toLowerCase();
        const bName = b.deviceName.replace("OpenCode - ", "").toLowerCase();
        return aName.localeCompare(bName);
      });
    }

    return devices.map(device => this._renderDevice(device)).join("");
  }

  private _renderDetailView(device: OpenCodeDevice, showBackButton: boolean): string {
    const stateEntity = device.entities.get("state");
    const sessionEntity = device.entities.get("session_title");
    const modelEntity = device.entities.get("model");
    const toolEntity = device.entities.get("current_tool");
    const costEntity = device.entities.get("cost");
    const tokensInputEntity = device.entities.get("tokens_input");
    const tokensOutputEntity = device.entities.get("tokens_output");
    const lastActivityEntity = device.entities.get("last_activity");

    const state = stateEntity?.state ?? "unknown";
    const stateConfig = STATE_CONFIG[state] || STATE_CONFIG.unknown;
    const sessionTitle = sessionEntity?.state ?? "Unknown Session";
    const model = modelEntity?.state ?? "unknown";
    const currentTool = toolEntity?.state ?? "none";
    const cost = costEntity?.state ?? "0";
    const tokensIn = tokensInputEntity?.state ?? "0";
    const tokensOut = tokensOutputEntity?.state ?? "0";
    const lastActivity = lastActivityEntity?.state ?? "";
    
    const agent = (stateEntity?.attributes?.agent as string) || null;
    const currentAgent = (stateEntity?.attributes?.current_agent as string) || null;
    const hostname = (stateEntity?.attributes?.hostname as string) || null;

    let activityDisplay = "";
    if (lastActivity) {
      const date = new Date(lastActivity);
      activityDisplay = date.toLocaleTimeString();
    }

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
          <button class="open-chat-btn" data-device-id="${device.deviceId}" data-session-id="${device.sessionId}">
            <ha-icon icon="mdi:chat"></ha-icon>
            <span>Chat</span>
          </button>
        </div>

        <div class="detail-footer">
          <code class="session-id">${device.sessionId}</code>
        </div>
      </div>
    `;
  }

  private _renderDevice(device: OpenCodeDevice): string {
    const stateEntity = device.entities.get("state");
    const sessionEntity = device.entities.get("session_title");
    const modelEntity = device.entities.get("model");
    const toolEntity = device.entities.get("current_tool");
    const costEntity = device.entities.get("cost");
    const tokensInputEntity = device.entities.get("tokens_input");
    const tokensOutputEntity = device.entities.get("tokens_output");
    const lastActivityEntity = device.entities.get("last_activity");

    const state = stateEntity?.state ?? "unknown";
    const stateConfig = STATE_CONFIG[state] || STATE_CONFIG.unknown;
    const sessionTitle = sessionEntity?.state ?? "Unknown Session";
    const model = modelEntity?.state ?? "unknown";
    const currentTool = toolEntity?.state ?? "none";
    const cost = costEntity?.state ?? "0";
    const tokensIn = tokensInputEntity?.state ?? "0";
    const tokensOut = tokensOutputEntity?.state ?? "0";
    const lastActivity = lastActivityEntity?.state ?? "";
    
    const activityTime = lastActivity ? formatRelativeTime(lastActivity) : null;
    const currentAgent = (stateEntity?.attributes?.current_agent as string) || null;

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
          <div class="device-name-container">
            <div class="device-name">${device.deviceName.replace("OpenCode - ", "")}</div>
            ${activityTime ? `<div class="device-activity" title="${activityTime.tooltip}">${activityTime.display}</div>` : ""}
          </div>
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
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .card-header .name {
        font-size: 1.2em;
        font-weight: 500;
      }
      .sort-toggle {
        background: none;
        border: none;
        padding: 8px;
        cursor: pointer;
        border-radius: 50%;
        color: var(--secondary-text-color);
        transition: background 0.2s, color 0.2s;
      }
      .sort-toggle:hover {
        background: var(--secondary-background-color);
        color: var(--primary-text-color);
      }
      .sort-toggle ha-icon {
        --mdc-icon-size: 20px;
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

      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      .spinning {
        animation: spin 1s linear infinite;
      }

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
      .device-name-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .device-name {
        font-weight: 500;
        color: var(--primary-text-color);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .device-activity {
        font-size: 0.75em;
        color: var(--secondary-text-color);
        margin-top: 2px;
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
      }
      .info-value {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .info-value.model {
        font-family: monospace;
        font-size: 0.85em;
      }
      .info-row.stats {
        margin-top: 4px;
        padding-top: 8px;
        border-top: 1px solid var(--divider-color);
      }
      .stat-value {
        font-family: monospace;
        font-size: 0.85em;
        margin-right: 12px;
      }

      .permission-alert {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 12px;
        padding: 12px;
        background: #ff980020;
        border: 1px solid #ff9800;
        border-radius: 8px;
      }
      .permission-alert.clickable {
        cursor: pointer;
        transition: background 0.2s;
      }
      .permission-alert.clickable:hover {
        background: #ff980030;
      }
      .permission-alert > ha-icon:first-child {
        --mdc-icon-size: 24px;
        color: #ff9800;
      }
      .permission-details {
        flex: 1;
      }
      .permission-title {
        font-weight: 500;
      }
      .permission-type {
        font-size: 0.85em;
        color: var(--secondary-text-color);
      }
      .permission-chevron {
        --mdc-icon-size: 20px;
        color: var(--secondary-text-color);
      }

      .detail-view {
        padding: 16px;
      }
      .back-button {
        display: flex;
        align-items: center;
        gap: 8px;
        background: none;
        border: none;
        padding: 8px 12px;
        margin-bottom: 16px;
        cursor: pointer;
        color: var(--primary-color);
        font-size: 0.9em;
        border-radius: 8px;
        transition: background 0.2s;
      }
      .back-button:hover {
        background: var(--secondary-background-color);
      }
      .back-button ha-icon {
        --mdc-icon-size: 20px;
      }
      .detail-header {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-bottom: 16px;
      }
      .detail-status {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 8px;
        border: 1px solid;
      }
      .detail-status ha-icon {
        --mdc-icon-size: 24px;
      }
      .status-text {
        font-weight: 500;
        text-transform: uppercase;
        font-size: 0.85em;
      }
      .detail-project-info {
        flex: 1;
      }
      .detail-project {
        font-size: 1.1em;
        font-weight: 500;
      }
      .detail-hostname {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 0.85em;
        color: var(--secondary-text-color);
        margin-top: 4px;
      }
      .detail-hostname ha-icon {
        --mdc-icon-size: 14px;
      }
      .detail-session {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px;
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
      }
      .detail-info {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-bottom: 16px;
      }
      .detail-row {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .detail-row ha-icon {
        --mdc-icon-size: 20px;
        color: var(--secondary-text-color);
      }
      .detail-label {
        width: 100px;
        color: var(--secondary-text-color);
      }
      .detail-value {
        flex: 1;
      }
      .detail-value.mono {
        font-family: monospace;
        font-size: 0.9em;
      }
      .detail-row.highlight {
        padding: 8px 12px;
        background: var(--primary-color)10;
        border-radius: 8px;
        margin: -4px -12px;
      }
      .tool-active {
        color: var(--primary-color);
        font-weight: 500;
      }
      .agent-badge {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .sub-agent-indicator {
        display: flex;
        align-items: center;
        gap: 2px;
        color: var(--secondary-text-color);
        font-size: 0.9em;
      }
      .sub-agent-indicator ha-icon {
        --mdc-icon-size: 14px;
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
        font-family: monospace;
      }
      .stat .stat-label {
        font-size: 0.75em;
        color: var(--secondary-text-color);
        text-transform: uppercase;
      }
      .detail-actions {
        display: flex;
        gap: 12px;
        margin-bottom: 16px;
      }
      .open-chat-btn {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 12px;
        background: var(--primary-color);
        color: var(--text-primary-color, #fff);
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 1em;
        transition: opacity 0.2s;
      }
      .open-chat-btn:hover {
        opacity: 0.9;
      }
      .open-chat-btn ha-icon {
        --mdc-icon-size: 20px;
      }
      .detail-footer {
        text-align: center;
      }
      .session-id {
        font-size: 0.75em;
        color: var(--secondary-text-color);
        background: var(--secondary-background-color);
        padding: 4px 8px;
        border-radius: 4px;
      }

      .modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      }
      .modal {
        background: var(--card-background-color);
        border-radius: 12px;
        max-width: 500px;
        width: 90%;
        max-height: 80vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }
      .modal-header {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px;
        border-bottom: 1px solid var(--divider-color);
      }
      .modal-header ha-icon:first-child {
        --mdc-icon-size: 24px;
        color: #ff9800;
      }
      .modal-title {
        flex: 1;
        font-size: 1.1em;
        font-weight: 500;
      }
      .modal-close {
        background: none;
        border: none;
        padding: 8px;
        cursor: pointer;
        border-radius: 50%;
        color: var(--secondary-text-color);
        transition: background 0.2s;
      }
      .modal-close:hover {
        background: var(--secondary-background-color);
      }
      .modal-close ha-icon {
        --mdc-icon-size: 20px;
      }
      .modal-body {
        padding: 16px;
        overflow-y: auto;
        flex: 1;
      }
      .permission-info {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 16px;
      }
      .permission-main-title {
        font-size: 1.1em;
        font-weight: 500;
      }
      .permission-type-badge {
        display: inline-block;
        padding: 4px 8px;
        background: var(--secondary-background-color);
        border-radius: 4px;
        font-size: 0.85em;
        color: var(--secondary-text-color);
        align-self: flex-start;
      }
      .permission-section {
        margin-bottom: 16px;
      }
      .section-label {
        font-size: 0.85em;
        color: var(--secondary-text-color);
        margin-bottom: 8px;
        text-transform: uppercase;
      }
      .pattern-code {
        display: block;
        padding: 12px;
        background: var(--secondary-background-color);
        border-radius: 4px;
        font-family: monospace;
        font-size: 0.9em;
        word-break: break-all;
      }
      .metadata-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .metadata-item {
        display: flex;
        gap: 8px;
      }
      .metadata-key {
        color: var(--secondary-text-color);
      }
      .metadata-value {
        font-family: monospace;
        font-size: 0.9em;
        word-break: break-all;
      }
      .permission-loading {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--secondary-text-color);
      }
      .modal-actions {
        display: flex;
        gap: 12px;
        padding: 16px;
        border-top: 1px solid var(--divider-color);
      }
      .btn {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 12px;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 0.9em;
        transition: opacity 0.2s;
      }
      .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .btn ha-icon {
        --mdc-icon-size: 18px;
      }
      .btn-reject {
        background: #f4433620;
        color: #f44336;
      }
      .btn-allow-once {
        background: #4caf5020;
        color: #4caf50;
      }
      .btn-allow-always {
        background: #2196f320;
        color: #2196f3;
      }

      .history-modal {
        max-width: 700px;
        width: 95%;
        max-height: 90vh;
      }
      .chat-modal {
        display: flex;
        flex-direction: column;
      }
      .history-header {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
      }
      .history-header ha-icon:first-child {
        --mdc-icon-size: 24px;
        color: var(--primary-color);
      }
      .history-header-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .working-indicator {
        color: var(--primary-color);
      }
      .working-indicator ha-icon {
        --mdc-icon-size: 20px;
      }
      .history-refresh-btn {
        background: none;
        border: none;
        padding: 8px;
        cursor: pointer;
        border-radius: 50%;
        color: var(--secondary-text-color);
        transition: background 0.2s;
      }
      .history-refresh-btn:hover {
        background: var(--secondary-background-color);
      }
      .history-refresh-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .history-refresh-btn ha-icon {
        --mdc-icon-size: 20px;
      }
      .history-body-container {
        position: relative;
        flex: 1;
        min-height: 0;
      }
      .history-body {
        height: 400px;
        overflow-y: auto;
        padding: 16px;
      }
      .scroll-to-bottom-btn {
        position: absolute;
        bottom: 16px;
        right: 24px;
        background: var(--primary-color);
        color: var(--text-primary-color, #fff);
        border: none;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        transition: opacity 0.2s, transform 0.2s;
      }
      .scroll-to-bottom-btn:hover {
        transform: scale(1.1);
      }
      .scroll-to-bottom-btn.hidden {
        opacity: 0;
        pointer-events: none;
      }
      .scroll-to-bottom-btn ha-icon {
        --mdc-icon-size: 24px;
      }
      .history-loading, .history-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 32px;
        color: var(--secondary-text-color);
        gap: 12px;
      }
      .history-loading ha-icon, .history-empty ha-icon {
        --mdc-icon-size: 32px;
      }
      .history-load-more {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 12px;
        margin-bottom: 16px;
        background: var(--secondary-background-color);
        border-radius: 8px;
        cursor: pointer;
        color: var(--secondary-text-color);
        font-size: 0.9em;
        transition: background 0.2s;
      }
      .history-load-more:hover {
        background: var(--divider-color);
      }
      .history-load-more ha-icon {
        --mdc-icon-size: 18px;
      }
      .history-message {
        margin-bottom: 16px;
        padding: 12px;
        border-radius: 8px;
      }
      .history-message.user {
        background: var(--primary-color)10;
        margin-left: 24px;
      }
      .history-message.assistant {
        background: var(--secondary-background-color);
        margin-right: 24px;
      }
      .message-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
        font-size: 0.85em;
      }
      .message-header ha-icon {
        --mdc-icon-size: 18px;
        color: var(--secondary-text-color);
      }
      .message-role {
        font-weight: 500;
      }
      .message-time {
        color: var(--secondary-text-color);
        margin-left: auto;
      }
      .speak-btn {
        background: none;
        border: none;
        padding: 4px;
        cursor: pointer;
        border-radius: 50%;
        color: var(--secondary-text-color);
        transition: background 0.2s, color 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .speak-btn:hover {
        background: var(--divider-color);
        color: var(--primary-text-color);
      }
      .speak-btn.speaking {
        color: var(--primary-color);
        animation: pulse 1s ease-in-out infinite;
      }
      .speak-btn ha-icon {
        --mdc-icon-size: 18px;
      }
      .message-content {
        line-height: 1.5;
      }
      .history-text {
        white-space: pre-wrap;
        word-break: break-word;
      }
      .history-tool {
        margin: 8px 0;
        padding: 12px;
        background: var(--card-background-color);
        border: 1px solid var(--divider-color);
        border-radius: 8px;
      }
      .tool-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
      }
      .tool-header ha-icon {
        --mdc-icon-size: 16px;
        color: var(--secondary-text-color);
      }
      .tool-name {
        font-family: monospace;
        font-size: 0.9em;
        font-weight: 500;
      }
      .tool-args {
        margin: 8px 0;
        padding: 8px;
        background: var(--secondary-background-color);
        border-radius: 4px;
        font-size: 0.8em;
        overflow-x: auto;
        max-height: 150px;
      }
      .tool-result {
        margin-top: 8px;
        padding: 8px;
        background: #4caf5010;
        border-left: 3px solid #4caf50;
        border-radius: 0 4px 4px 0;
      }
      .tool-result.error {
        background: #f4433610;
        border-left-color: #f44336;
      }
      .tool-result-label {
        font-size: 0.8em;
        font-weight: 500;
        color: var(--secondary-text-color);
        margin-bottom: 4px;
        display: block;
      }
      .tool-output {
        margin: 0;
        font-size: 0.8em;
        overflow-x: auto;
        max-height: 200px;
      }
      .message-meta {
        margin-top: 8px;
        font-size: 0.75em;
        color: var(--secondary-text-color);
      }
      .chat-input-container {
        display: flex;
        gap: 8px;
        padding: 12px 16px;
        border-top: 1px solid var(--divider-color);
        background: var(--card-background-color);
        align-items: flex-end;
      }
      .agent-selector {
        padding: 8px 12px;
        border: 1px solid var(--divider-color);
        border-radius: 8px;
        background: var(--card-background-color);
        color: var(--primary-text-color);
        font-size: 0.9em;
        cursor: pointer;
        min-width: 120px;
      }
      .agent-selector.loading {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 8px;
        min-width: 40px;
        border: none;
        background: transparent;
      }
      .agent-selector.loading ha-icon {
        --mdc-icon-size: 20px;
        color: var(--secondary-text-color);
      }
      .chat-input {
        flex: 1;
        padding: 12px;
        border: 1px solid var(--divider-color);
        border-radius: 8px;
        background: var(--card-background-color);
        color: var(--primary-text-color);
        font-size: 1em;
        font-family: inherit;
        resize: none;
        min-height: 44px;
        max-height: 120px;
      }
      .chat-input:focus {
        outline: none;
        border-color: var(--primary-color);
      }
      .chat-send-btn {
        padding: 12px;
        background: var(--primary-color);
        color: var(--text-primary-color, #fff);
        border: none;
        border-radius: 8px;
        cursor: pointer;
        transition: opacity 0.2s;
      }
      .chat-send-btn:hover {
        opacity: 0.9;
      }
      .chat-send-btn ha-icon {
        --mdc-icon-size: 20px;
      }

      .inline-permission {
        margin: 16px 0;
        padding: 16px;
        background: #ff980015;
        border: 1px solid #ff9800;
        border-radius: 12px;
      }
      .inline-permission-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 12px;
      }
      .inline-permission-header ha-icon {
        --mdc-icon-size: 24px;
        color: #ff9800;
      }
      .inline-permission-title {
        font-weight: 500;
        font-size: 1.1em;
      }
      .inline-permission-body {
        margin-bottom: 16px;
      }
      .inline-permission-type {
        display: inline-block;
        padding: 4px 8px;
        background: var(--secondary-background-color);
        border-radius: 4px;
        font-size: 0.85em;
        color: var(--secondary-text-color);
        margin-bottom: 12px;
      }
      .inline-permission-section {
        margin-bottom: 12px;
      }
      .inline-permission-label {
        font-size: 0.8em;
        color: var(--secondary-text-color);
        text-transform: uppercase;
        margin-bottom: 4px;
      }
      .inline-permission-code {
        display: block;
        padding: 8px;
        background: var(--card-background-color);
        border-radius: 4px;
        font-family: monospace;
        font-size: 0.85em;
        word-break: break-all;
      }
      .inline-permission-metadata {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .inline-metadata-item {
        display: flex;
        gap: 8px;
        font-size: 0.9em;
      }
      .inline-metadata-key {
        color: var(--secondary-text-color);
      }
      .inline-metadata-value {
        font-family: monospace;
        word-break: break-all;
      }
      .inline-permission-loading {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--secondary-text-color);
        font-size: 0.9em;
      }
      .inline-permission-actions {
        display: flex;
        gap: 8px;
      }
      .inline-perm-btn {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 10px;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 0.85em;
        transition: opacity 0.2s;
      }
      .inline-perm-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .inline-perm-btn ha-icon {
        --mdc-icon-size: 16px;
      }
      .inline-perm-btn.reject {
        background: #f4433620;
        color: #f44336;
      }
      .inline-perm-btn.allow-once {
        background: #4caf5020;
        color: #4caf50;
      }
      .inline-perm-btn.allow-always {
        background: #2196f320;
        color: #2196f3;
      }
    `;
  }

  // Required for custom cards
  static getConfigElement() {
    return document.createElement("opencode-card-editor");
  }

  static getStubConfig() {
    return {
      title: "OpenCode Sessions",
    };
  }
}

// Register the card
customElements.define("opencode-card", OpenCodeCard);

// Card registration info for HA
(window as unknown as { customCards: unknown[] }).customCards = (window as unknown as { customCards: unknown[] }).customCards || [];
(window as unknown as { customCards: unknown[] }).customCards.push({
  type: "opencode-card",
  name: "OpenCode Card",
  description: "Display and interact with OpenCode AI coding assistant sessions",
});
