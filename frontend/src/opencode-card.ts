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
  parentSessionId: string | null;
}

interface CardConfig {
  type: string;
  title?: string;
  device?: string; // Device ID to pin to
  working_refresh_interval?: number; // Auto-refresh interval in seconds when working (default: 10)
  hide_unknown?: boolean; // Hide sessions with unknown state (default: false)
  sort_by?: "activity" | "name"; // Sort mode (default: "activity")
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
  total_count?: number;
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

// Question tool types
interface QuestionOption {
  label: string;
  description: string;
}

interface QuestionItem {
  question: string;
  header: string;
  multiple: boolean;
  options: QuestionOption[];
}

interface QuestionInfo {
  session_id: string;
  request_id?: string;
  questions: QuestionItem[];
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
  waiting_input: { icon: "mdi:comment-question", color: "#9c27b0", label: "Awaiting Input" },
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
  private _autoRefreshEnabled = true; // Toggle for auto-refresh
  private _lastDeviceState: string | null = null;
  // Sorting
  private _sortMode: "activity" | "name" = "activity";
  // Hide unknown sessions toggle
  private _hideUnknown = false;
  // Event subscriptions
  private _stateChangeUnsubscribe: (() => void) | null = null;
  private _historyResponseUnsubscribe: (() => void) | null = null;
  private _agentsResponseUnsubscribe: (() => void) | null = null;
  // TTS state
  private _speakingMessageId: string | null = null;
  // Question modal state
  private _showQuestionModal = false;
  private _activeQuestion: QuestionInfo | null = null;
  private _questionAnswers: string[][] = []; // Answers per question (array of selected labels)
  private _currentQuestionIndex = 0;
  private _otherInputs: string[] = []; // Custom "Other" text per question
  // Track pending questions per device
  private _pendingQuestions: Map<string, QuestionInfo> = new Map();
  // Preserve input state across renders
  private _chatInputValue: string = "";
  private _savedScrollTop: number | null = null;
  private _chatInputHadFocus: boolean = false;
  private _chatInputSelectionStart: number | null = null;
  private _chatInputSelectionEnd: number | null = null;
  // Scroll handling
  private _scrollDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  // Request timeout handling
  private _historyRequestTimeout: ReturnType<typeof setTimeout> | null = null;
  private _historyRequestId: string | null = null;
  private static readonly HISTORY_REQUEST_TIMEOUT_MS = 15000; // 15 second timeout

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
    
    // Only auto-refresh if enabled and session is working
    if (currentState === "working" && this._autoRefreshEnabled) {
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
  
  private _toggleAutoRefresh() {
    this._autoRefreshEnabled = !this._autoRefreshEnabled;
    
    // If we just enabled it, check if we need to start refreshing
    if (this._autoRefreshEnabled && this._historyDeviceId) {
      const device = this._devices.get(this._historyDeviceId);
      const stateEntity = device?.entities.get("state");
      const currentState = stateEntity?.state ?? "unknown";
      this._manageAutoRefresh(currentState);
    } else if (!this._autoRefreshEnabled && this._autoRefreshInterval) {
      // If we disabled it, stop the interval
      clearInterval(this._autoRefreshInterval);
      this._autoRefreshInterval = null;
    }
    
    this._render();
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
    
    // Apply config defaults for toggles
    if (config.hide_unknown !== undefined) {
      this._hideUnknown = config.hide_unknown;
    }
    if (config.sort_by !== undefined) {
      this._sortMode = config.sort_by;
    }
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
          parentSessionId: null,
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
      
      // Update parent session ID from state entity attributes
      if (entityKey === "state" && state.attributes?.parent_session_id) {
        openCodeDevice.parentSessionId = state.attributes.parent_session_id as string;
      }
    }

    this._updatePendingPermissions();
    this._updatePendingQuestions();
  }

  private _updatePendingPermissions() {
    for (const [deviceId, device] of this._devices) {
      const permissionEntity = device.entities.get("permission_pending");
      const stateEntity = device.entities.get("state");

      // Only log when state is waiting_permission
      if (stateEntity?.state === "waiting_permission") {
        console.log("[opencode-card] PERMISSION DEBUG:", {
          deviceId,
          stateEntityState: stateEntity?.state,
          permissionEntityState: permissionEntity?.state,
          permissionEntityAttrs: permissionEntity?.attributes,
        });
      }

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
        } else if (stateEntity?.state === "waiting_permission") {
          // Has permission entity "on" but missing attrs - use fallback
          console.log("[opencode-card] Permission entity on but missing attrs, using fallback");
          this._pendingPermissions.set(deviceId, {
            permission_id: "",
            type: "pending",
            title: "Permission Required",
            session_id: device.sessionId,
          });
        }
      } else if (stateEntity?.state !== "waiting_permission" || permissionEntity?.state === "off") {
        this._pendingPermissions.delete(deviceId);
      } else if (stateEntity?.state === "waiting_permission" && !this._pendingPermissions.has(deviceId)) {
        // State is waiting_permission but no permission entity or it's not "on"
        // This is a fallback - show generic permission request
        console.log("[opencode-card] Using fallback permission display for device:", deviceId);
        this._pendingPermissions.set(deviceId, {
          permission_id: "",
          type: "pending",
          title: "Permission Required",
          session_id: device.sessionId,
        });
      }
    }
  }

  private _updatePendingQuestions() {
    for (const [deviceId, device] of this._devices) {
      const stateEntity = device.entities.get("state");
      const currentState = stateEntity?.state ?? "unknown";

      // Check if state is waiting_input and question attribute exists
      if (currentState === "waiting_input") {
        const questionAttr = stateEntity?.attributes?.question as QuestionInfo | undefined;
        if (questionAttr && questionAttr.questions && questionAttr.questions.length > 0) {
          this._pendingQuestions.set(deviceId, questionAttr);
        } else if (!this._pendingQuestions.has(deviceId)) {
          // State is waiting_input but no question data yet - use placeholder
          this._pendingQuestions.set(deviceId, {
            session_id: device.sessionId,
            questions: [],
          });
        }
      } else {
        this._pendingQuestions.delete(deviceId);
      }
    }
  }

  private _getPinnedDevice(): OpenCodeDevice | null {
    if (!this._config?.device) return null;
    return this._devices.get(this._config.device) || null;
  }

  private _getQuestionDetails(device: OpenCodeDevice): QuestionInfo | null {
    return this._pendingQuestions.get(device.deviceId) || null;
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

  private _showQuestion(deviceId: string) {
    const question = this._pendingQuestions.get(deviceId);
    if (question && question.questions.length > 0) {
      this._activeQuestion = question;
      this._showQuestionModal = true;
      this._currentQuestionIndex = 0;
      this._questionAnswers = question.questions.map(() => []);
      this._otherInputs = question.questions.map(() => "");
      this._render();
    }
  }

  private _hideQuestionModal() {
    this._showQuestionModal = false;
    this._activeQuestion = null;
    this._currentQuestionIndex = 0;
    this._questionAnswers = [];
    this._otherInputs = [];
    this._render();
  }

  private _nextQuestion() {
    if (this._activeQuestion && this._currentQuestionIndex < this._activeQuestion.questions.length - 1) {
      this._currentQuestionIndex++;
      this._render();
    }
  }

  private _prevQuestion() {
    if (this._currentQuestionIndex > 0) {
      this._currentQuestionIndex--;
      this._render();
    }
  }

  private _updateQuestionAnswer(label: string, checked: boolean) {
    if (!this._activeQuestion) return;
    
    const currentQ = this._activeQuestion.questions[this._currentQuestionIndex];
    let answers = [...(this._questionAnswers[this._currentQuestionIndex] || [])];
    
    if (currentQ.multiple) {
      // Checkbox behavior
      if (checked) {
        if (!answers.includes(label)) {
          answers.push(label);
        }
      } else {
        answers = answers.filter(a => a !== label);
      }
    } else {
      // Radio behavior
      answers = checked ? [label] : [];
    }
    
    this._questionAnswers[this._currentQuestionIndex] = answers;
    this._render();
  }

  private _updateOtherInput(value: string) {
    this._otherInputs[this._currentQuestionIndex] = value;
    // Don't re-render on every keystroke
  }

  private async _cancelQuestion() {
    if (!this._hass || !this._activeQuestion) return;
    
    try {
      // Call respond_question with empty answers to cancel/terminate
      await this._hass.callService("opencode", "respond_question", {
        session_id: this._activeQuestion.session_id,
        answers: [], // Empty answers signals cancellation
      });
    } catch (err) {
      console.error("[opencode-card] Failed to cancel question:", err);
    }
    
    this._hideQuestionModal();
  }

  private async _submitQuestionAnswers() {
    if (!this._hass || !this._activeQuestion) return;
    
    // Build answers array - each question gets an array of selected labels
    const answers: string[][] = this._activeQuestion.questions.map((q, idx) => {
      const selected = this._questionAnswers[idx] || [];
      const otherText = this._otherInputs[idx] || "";
      
      // Replace __other__ with actual text if provided
      return selected.map(s => s === "__other__" && otherText ? otherText : s)
                     .filter(s => s !== "__other__"); // Remove unfilled "other"
    });
    
    try {
      await this._hass.callService("opencode", "respond_question", {
        session_id: this._activeQuestion.session_id,
        answers: answers,
      });
      
      this._hideQuestionModal();
      
      // Refresh history after short delay
      if (this._showHistoryView) {
        setTimeout(() => this._refreshHistory(), 500);
      }
    } catch (err) {
      console.error("[opencode-card] Failed to submit question answers:", err);
    }
  }

  private async _submitInlineQuestion() {
    if (!this._hass || !this._historyDeviceId) return;
    
    const question = this._pendingQuestions.get(this._historyDeviceId);
    if (!question || question.questions.length === 0) return;
    
    // Collect answers from inline checkboxes/radios
    const answers: string[][] = [];
    const firstQ = question.questions[0];
    const selectedLabels: string[] = [];
    
    this.querySelectorAll(".inline-question-input:checked").forEach((input) => {
      const label = (input as HTMLInputElement).dataset.label;
      if (label) {
        selectedLabels.push(label);
      }
    });
    
    answers.push(selectedLabels);
    
    // For multi-question scenarios (shouldn't happen with inline), add empty arrays
    for (let i = 1; i < question.questions.length; i++) {
      answers.push([]);
    }
    
    try {
      await this._hass.callService("opencode", "respond_question", {
        session_id: question.session_id,
        answers: answers,
      });
      
      // Refresh history after short delay
      setTimeout(() => this._refreshHistory(), 500);
    } catch (err) {
      console.error("[opencode-card] Failed to submit inline question:", err);
    }
  }

  private _selectDevice(deviceId: string) {
    this._selectedDeviceId = deviceId;
    this._render();
  }

  private _goBack() {
    // If viewing a sub-agent, navigate back to its parent
    const currentDevice = this._selectedDeviceId ? this._devices.get(this._selectedDeviceId) : null;
    if (currentDevice?.parentSessionId) {
      // Find parent device by session ID
      const parentDevice = this._findDeviceBySessionId(currentDevice.parentSessionId);
      if (parentDevice) {
        this._selectedDeviceId = parentDevice.deviceId;
        this._render();
        return;
      }
    }
    this._selectedDeviceId = null;
    this._render();
  }

  private _isPinned(): boolean {
    return !!this._config?.device;
  }

  /**
   * Find a device by its session ID.
   */
  private _findDeviceBySessionId(sessionId: string): OpenCodeDevice | undefined {
    for (const device of this._devices.values()) {
      if (device.sessionId === sessionId) {
        return device;
      }
    }
    return undefined;
  }

  /**
   * Get all child sessions for a given parent session ID.
   */
  private _getChildSessions(parentSessionId: string): OpenCodeDevice[] {
    const children: OpenCodeDevice[] = [];
    for (const device of this._devices.values()) {
      if (device.parentSessionId === parentSessionId) {
        children.push(device);
      }
    }
    // Sort by last activity (newest first)
    children.sort((a, b) => {
      const aActivity = a.entities.get("last_activity")?.state ?? "";
      const bActivity = b.entities.get("last_activity")?.state ?? "";
      if (!aActivity && !bActivity) return 0;
      if (!aActivity) return 1;
      if (!bActivity) return -1;
      return new Date(bActivity).getTime() - new Date(aActivity).getTime();
    });
    return children;
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
    this._autoRefreshEnabled = true; // Reset to default on close
    
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

    // Clear any existing timeout
    if (this._historyRequestTimeout) {
      clearTimeout(this._historyRequestTimeout);
    }

    const requestId = `req_${Date.now()}`;
    this._historyRequestId = requestId;

    // Set up timeout for the request
    this._historyRequestTimeout = setTimeout(() => {
      if (this._historyRequestId === requestId && this._historyLoading) {
        console.warn("[opencode-card] History request timed out");
        this._historyLoading = false;
        this._historyRequestId = null;
        this._render();
      }
    }, OpenCodeCard.HISTORY_REQUEST_TIMEOUT_MS);

    try {
      await this._hass.callService("opencode", "get_history", {
        session_id: this._historySessionId,
        limit: OpenCodeCard.HISTORY_PAGE_SIZE,
        request_id: requestId,
      });
      // Response comes via event subscription
    } catch (err) {
      console.error("[opencode-card] Failed to request history:", err);
      if (this._historyRequestTimeout) {
        clearTimeout(this._historyRequestTimeout);
        this._historyRequestTimeout = null;
      }
      this._historyLoading = false;
      this._historyRequestId = null;
      this._render();
    }
  }

  private async _fetchHistorySince(since: string) {
    if (!this._hass || !this._historySessionId) return;

    // Clear any existing timeout
    if (this._historyRequestTimeout) {
      clearTimeout(this._historyRequestTimeout);
    }

    const requestId = `req_${Date.now()}`;
    this._historyRequestId = requestId;

    // Set up timeout for the request (shorter for incremental updates)
    this._historyRequestTimeout = setTimeout(() => {
      if (this._historyRequestId === requestId && this._historyLoading) {
        console.warn("[opencode-card] History update request timed out");
        this._historyLoading = false;
        this._historyRequestId = null;
        this._render();
      }
    }, OpenCodeCard.HISTORY_REQUEST_TIMEOUT_MS);

    try {
      await this._hass.callService("opencode", "get_history", {
        session_id: this._historySessionId,
        since,
        request_id: requestId,
      });
    } catch (err) {
      console.error("[opencode-card] Failed to request history update:", err);
      if (this._historyRequestTimeout) {
        clearTimeout(this._historyRequestTimeout);
        this._historyRequestTimeout = null;
      }
      this._historyLoading = false;
      this._historyRequestId = null;
    }
  }

  private _handleHistoryResponse(response: HistoryResponse) {
    if (!this._historySessionId) return;

    // Clear the request timeout since we got a response
    if (this._historyRequestTimeout) {
      clearTimeout(this._historyRequestTimeout);
      this._historyRequestTimeout = null;
    }
    this._historyRequestId = null;

    const hadNewMessages = response.since && response.messages.length > 0;
    const isInitialLoad = !this._historyData;
    const isLoadMore = this._historyLoadingMore;

    if (response.since && this._historyData) {
      // Incremental update - append new messages
      const existingIds = new Set(this._historyData.messages.map(m => m.id));
      const newMessages = response.messages.filter(m => !existingIds.has(m.id));
      this._historyData.messages.push(...newMessages);
      this._historyData.fetched_at = response.fetched_at;
      // Update total_count if provided
      if (response.total_count !== undefined) {
        this._historyData.total_count = response.total_count;
      }
    } else if (isLoadMore && this._historyData) {
      // Load more - merge older messages at the beginning
      const existingIds = new Set(this._historyData.messages.map(m => m.id));
      const olderMessages = response.messages.filter(m => !existingIds.has(m.id));
      // Prepend older messages
      this._historyData.messages = [...olderMessages, ...this._historyData.messages];
      this._historyData.fetched_at = response.fetched_at;
      // Show all messages now
      this._historyVisibleCount = this._historyData.messages.length;
      if (response.total_count !== undefined) {
        this._historyData.total_count = response.total_count;
      }
    } else {
      // Initial load or full replacement
      this._historyData = response;
      // For initial load with limit, show only what we got
      this._historyVisibleCount = Math.max(this._historyVisibleCount, response.messages.length);
    }

    this._saveHistoryToCache(this._historySessionId, this._historyData);

    this._historyLoading = false;
    this._historyLoadingMore = false;
    this._render();

    // Auto-scroll conditions:
    // 1. Initial load - always scroll to bottom
    // 2. New messages AND user is at bottom (respecting user's scroll position)
    // 3. Don't auto-scroll when loading more (user is scrolling up)
    // 4. Don't force scroll if user has manually scrolled away
    const shouldAutoScroll = (isInitialLoad && !isLoadMore) || 
      (hadNewMessages && this._isAtBottom && !isLoadMore);
    
    if (shouldAutoScroll) {
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
    // Save input value, focus state, and scroll position before re-render
    const chatInput = this.querySelector(".chat-input") as HTMLTextAreaElement;
    if (chatInput) {
      this._chatInputValue = chatInput.value;
      this._chatInputHadFocus = document.activeElement === chatInput;
      if (this._chatInputHadFocus) {
        this._chatInputSelectionStart = chatInput.selectionStart;
        this._chatInputSelectionEnd = chatInput.selectionEnd;
      }
    }
    const historyBody = this.querySelector(".history-body");
    if (historyBody && this._showHistoryView) {
      // Only save if not at bottom (to preserve user's scroll position)
      const isAtBottom = historyBody.scrollHeight - historyBody.scrollTop - historyBody.clientHeight < 50;
      if (!isAtBottom) {
        this._savedScrollTop = historyBody.scrollTop;
      } else {
        this._savedScrollTop = null; // Will scroll to bottom
      }
    }
    
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
      const hideUnknownIcon = this._hideUnknown ? "mdi:eye-off" : "mdi:eye";
      const hideUnknownTitle = this._hideUnknown ? "Showing active sessions only" : "Showing all sessions";
      content = `
        <ha-card>
          <div class="card-header">
            <div class="name">${title}</div>
            <div class="header-actions">
              <button class="hide-unknown-toggle" title="${hideUnknownTitle}">
                <ha-icon icon="${hideUnknownIcon}"></ha-icon>
              </button>
              ${this._devices.size > 1 ? `
                <button class="sort-toggle" title="${sortTitle}">
                  <ha-icon icon="${sortIcon}"></ha-icon>
                </button>
              ` : ""}
            </div>
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

    if (this._showQuestionModal && this._activeQuestion) {
      content += this._renderQuestionModal();
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
    
    // Restore input value, focus, and cursor position after re-render
    const newChatInput = this.querySelector(".chat-input") as HTMLTextAreaElement;
    if (newChatInput) {
      if (this._chatInputValue) {
        newChatInput.value = this._chatInputValue;
      }
      // Restore focus and cursor position
      if (this._chatInputHadFocus) {
        newChatInput.focus();
        if (this._chatInputSelectionStart !== null && this._chatInputSelectionEnd !== null) {
          newChatInput.setSelectionRange(this._chatInputSelectionStart, this._chatInputSelectionEnd);
        }
      }
    }
    
    // Restore scroll position after re-render
    const newHistoryBody = this.querySelector(".history-body");
    if (newHistoryBody && this._showHistoryView) {
      if (this._savedScrollTop !== null) {
        newHistoryBody.scrollTop = this._savedScrollTop;
      }
      // Don't reset _savedScrollTop here - let scroll handler manage it
    }
  }

  private _attachEventListeners() {
    if (!this._isPinned() && !this._selectedDeviceId) {
      this.querySelectorAll(".device-card[data-device-id]").forEach((el) => {
        el.addEventListener("click", (e) => {
          if ((e.target as HTMLElement).closest(".permission-alert") || 
              (e.target as HTMLElement).closest(".question-alert")) {
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

    // Child session item clicks
    this.querySelectorAll(".child-session-item[data-device-id]").forEach((el) => {
      el.addEventListener("click", () => {
        const deviceId = (el as HTMLElement).dataset.deviceId;
        if (deviceId) {
          this._selectDevice(deviceId);
        }
      });
    });

    this.querySelector(".sort-toggle")?.addEventListener("click", () => {
      this._sortMode = this._sortMode === "activity" ? "name" : "activity";
      this._render();
    });

    this.querySelector(".hide-unknown-toggle")?.addEventListener("click", () => {
      this._hideUnknown = !this._hideUnknown;
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

    // Question alert click handlers
    this.querySelectorAll(".question-alert[data-device-id]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const deviceId = (el as HTMLElement).dataset.deviceId;
        if (deviceId) {
          this._showQuestion(deviceId);
        }
      });
    });

    this.querySelector(".modal-backdrop:not(.history-modal-backdrop):not(.question-modal-backdrop)")?.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).classList.contains("modal-backdrop")) {
        this._hidePermissionModal();
      }
    });

    this.querySelector(".modal-close:not(.history-close):not(.question-close)")?.addEventListener("click", () => {
      this._hidePermissionModal();
    });

    // Question modal handlers
    this.querySelector(".question-modal-backdrop")?.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).classList.contains("question-modal-backdrop")) {
        this._hideQuestionModal();
      }
    });

    this.querySelector(".question-close")?.addEventListener("click", () => {
      this._hideQuestionModal();
    });

    this.querySelector(".btn-cancel-question")?.addEventListener("click", () => {
      this._cancelQuestion();
    });

    this.querySelector(".btn-prev-question")?.addEventListener("click", () => {
      this._prevQuestion();
    });

    this.querySelector(".btn-next-question")?.addEventListener("click", () => {
      this._nextQuestion();
    });

    this.querySelector(".btn-submit-question")?.addEventListener("click", () => {
      this._submitQuestionAnswers();
    });

    // Question option inputs
    this.querySelectorAll(".question-input").forEach((input) => {
      input.addEventListener("change", (e) => {
        const target = e.target as HTMLInputElement;
        const label = target.dataset.label || "";
        this._updateQuestionAnswer(label, target.checked);
      });
    });

    this.querySelector(".question-other-input")?.addEventListener("input", (e) => {
      const value = (e.target as HTMLInputElement).value;
      this._updateOtherInput(value);
    });

    // Inline question handlers
    this.querySelectorAll("[data-action='open-question-modal']").forEach((el) => {
      el.addEventListener("click", () => {
        const deviceId = (el as HTMLElement).dataset.deviceId;
        if (deviceId) {
          this._showQuestion(deviceId);
        }
      });
    });

    this.querySelectorAll("[data-action='cancel-question']").forEach((el) => {
      el.addEventListener("click", () => {
        this._cancelQuestion();
      });
    });

    this.querySelectorAll("[data-action='submit-inline-question']").forEach((el) => {
      el.addEventListener("click", () => {
        this._submitInlineQuestion();
      });
    });

    // Inline question option changes
    this.querySelectorAll(".inline-question-input").forEach((input) => {
      input.addEventListener("change", () => {
        // Track inline selections separately for simple submit
      });
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
    
    this.querySelector(".auto-refresh-toggle")?.addEventListener("click", () => {
      this._toggleAutoRefresh();
    });

    this.querySelector(".history-load-more")?.addEventListener("click", () => {
      this._loadMoreHistory();
    });

    const historyBody = this.querySelector(".history-body");
    if (historyBody) {
      historyBody.addEventListener("scroll", () => {
        // Debounce scroll handling to prevent stuttering
        if (this._scrollDebounceTimer) {
          clearTimeout(this._scrollDebounceTimer);
        }
        
        this._scrollDebounceTimer = setTimeout(() => {
          // Check for load more (scrolled near top)
          if (historyBody.scrollTop < 50 && !this._historyLoadingMore) {
            const totalMessages = this._historyData?.messages.length || 0;
            const startIndex = Math.max(0, totalMessages - this._historyVisibleCount);
            if (startIndex > 0) {
              this._loadMoreHistory();
            }
          }
          
          // Update isAtBottom state and toggle button visibility directly (no re-render)
          const isAtBottom = historyBody.scrollHeight - historyBody.scrollTop - historyBody.clientHeight < 50;
          this._isAtBottom = isAtBottom;
          const scrollBtn = this.querySelector(".scroll-to-bottom-btn");
          if (scrollBtn) {
            scrollBtn.classList.toggle("hidden", isAtBottom);
          }
        }, 100); // 100ms debounce
      }, { passive: true }); // Use passive listener for better scroll performance
    }

    this.querySelector(".scroll-to-bottom-btn")?.addEventListener("click", () => {
      this._scrollToBottom();
    });

    this.querySelector(".chat-send-btn")?.addEventListener("click", () => {
      const textarea = this.querySelector(".chat-input") as HTMLTextAreaElement;
      if (textarea?.value.trim()) {
        this._sendChatMessage(textarea.value.trim());
        textarea.value = "";
        this._chatInputValue = ""; // Clear preserved value too
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
          this._chatInputValue = ""; // Clear preserved value too
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
    
    // Copy buttons
    this.querySelectorAll(".copy-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const messageId = (btn as HTMLElement).dataset.messageId;
        if (!messageId) return;
        
        const msg = this._historyData?.messages.find(m => m.id === messageId);
        if (msg) {
          const markdown = this._getRawMarkdownFromMessage(msg);
          this._copyToClipboard(markdown, btn as HTMLElement);
        }
      });
    });
    
    // Text selection auto-copy on mouseup within history body
    const historyBodyEl = this.querySelector(".history-body");
    if (historyBodyEl) {
      historyBodyEl.addEventListener("mouseup", () => {
        // Small delay to ensure selection is complete
        setTimeout(() => this._handleTextSelection(), 10);
      });
    }
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

  private async _copyToClipboard(text: string, buttonEl?: HTMLElement): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      
      // Show visual feedback if button element provided
      if (buttonEl) {
        const icon = buttonEl.querySelector("ha-icon");
        const originalIcon = icon?.getAttribute("icon");
        if (icon && originalIcon) {
          icon.setAttribute("icon", "mdi:check");
          buttonEl.classList.add("copied");
          setTimeout(() => {
            icon.setAttribute("icon", originalIcon);
            buttonEl.classList.remove("copied");
          }, 1500);
        }
      }
      return true;
    } catch (err) {
      console.error("[opencode-card] Failed to copy to clipboard:", err);
      return false;
    }
  }

  private _getRawMarkdownFromMessage(msg: HistoryMessage): string {
    return msg.parts
      .map(part => {
        if (part.type === "text" && part.content) {
          return part.content;
        } else if (part.type === "tool_call") {
          let toolMd = `**Tool: ${part.tool_name || "unknown"}**\n`;
          if (part.tool_args) {
            toolMd += "```json\n" + JSON.stringify(part.tool_args, null, 2) + "\n```\n";
          }
          if (part.tool_output) {
            toolMd += "**Output:**\n```\n" + part.tool_output + "\n```\n";
          }
          if (part.tool_error) {
            toolMd += "**Error:**\n```\n" + part.tool_error + "\n```\n";
          }
          return toolMd;
        } else if (part.type === "image") {
          return `[Image: ${part.content || "embedded"}]`;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n\n");
  }

  private _handleTextSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    
    const selectedText = selection.toString().trim();
    if (!selectedText) return;
    
    // Check if selection is within history body
    const historyBody = this.querySelector(".history-body");
    if (!historyBody) return;
    
    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;
    
    if (!anchorNode || !focusNode) return;
    if (!historyBody.contains(anchorNode) || !historyBody.contains(focusNode)) return;
    
    // Copy selected text to clipboard
    this._copyToClipboard(selectedText);
  }

  private async _loadMoreHistory() {
    if (!this._historyData || this._historyLoadingMore || !this._hass || !this._historySessionId) return;
    
    // Check if there are more messages on the server
    const totalOnServer = this._historyData.total_count ?? this._historyData.messages.length;
    const currentLoaded = this._historyData.messages.length;
    
    if (currentLoaded >= totalOnServer) {
      // All messages already loaded, just increase visible count if needed
      const totalMessages = this._historyData.messages.length;
      const currentStart = Math.max(0, totalMessages - this._historyVisibleCount);
      
      if (currentStart <= 0) return;
      
      this._historyVisibleCount += OpenCodeCard.HISTORY_PAGE_SIZE;
      this._render();
      return;
    }
    
    // Need to fetch more from server - fetch all remaining messages
    this._historyLoadingMore = true;
    this._render();
    
    const historyBody = this.querySelector(".history-body");
    const previousScrollHeight = historyBody?.scrollHeight || 0;
    
    try {
      // Fetch all messages (no limit) to get the complete history
      await this._hass.callService("opencode", "get_history", {
        session_id: this._historySessionId,
        request_id: `loadmore_${Date.now()}`,
      });
      // Response will be handled by _handleHistoryResponse
      // The loading state will be cleared there
      
      // Wait a bit for the response to arrive
      setTimeout(() => {
        if (this._historyLoadingMore) {
          this._historyLoadingMore = false;
          this._render();
        }
        
        // Preserve scroll position
        const newHistoryBody = this.querySelector(".history-body");
        if (newHistoryBody && previousScrollHeight > 0) {
          const newScrollHeight = newHistoryBody.scrollHeight;
          const scrollDiff = newScrollHeight - previousScrollHeight;
          newHistoryBody.scrollTop = scrollDiff;
        }
      }, 500);
    } catch (err) {
      console.error("[opencode-card] Failed to load more history:", err);
      this._historyLoadingMore = false;
      this._render();
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

  private _renderQuestionModal(): string {
    if (!this._activeQuestion || this._activeQuestion.questions.length === 0) {
      return "";
    }

    const questions = this._activeQuestion.questions;
    const currentQ = questions[this._currentQuestionIndex];
    const totalQuestions = questions.length;
    const isLastQuestion = this._currentQuestionIndex === totalQuestions - 1;
    const isFirstQuestion = this._currentQuestionIndex === 0;
    
    // Initialize answers array if needed
    if (this._questionAnswers.length !== totalQuestions) {
      this._questionAnswers = questions.map(() => []);
      this._otherInputs = questions.map(() => "");
    }
    
    const currentAnswers = this._questionAnswers[this._currentQuestionIndex] || [];
    const currentOther = this._otherInputs[this._currentQuestionIndex] || "";
    const hasOtherSelected = currentAnswers.includes("__other__");

    return `
      <div class="modal-backdrop question-modal-backdrop">
        <div class="modal question-modal">
          <div class="modal-header question-header">
            <ha-icon icon="mdi:comment-question"></ha-icon>
            <span class="modal-title">${currentQ.header || "Question"}</span>
            ${totalQuestions > 1 ? `<span class="question-progress">${this._currentQuestionIndex + 1} / ${totalQuestions}</span>` : ""}
            <button class="modal-close question-close">
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>
          <div class="modal-body question-body">
            <div class="question-text">${currentQ.question}</div>
            <div class="question-options">
              ${currentQ.options.map((opt, idx) => {
                const optId = `q-${this._currentQuestionIndex}-opt-${idx}`;
                const isSelected = currentAnswers.includes(opt.label);
                return `
                  <div class="question-option ${isSelected ? "selected" : ""}">
                    <input type="${currentQ.multiple ? "checkbox" : "radio"}" 
                           name="question-${this._currentQuestionIndex}" 
                           id="${optId}"
                           class="question-input"
                           data-label="${this._escapeHtml(opt.label)}"
                           ${isSelected ? "checked" : ""}>
                    <label for="${optId}" class="question-option-label">
                      <span class="question-option-text">${opt.label}</span>
                      ${opt.description ? `<span class="question-option-desc">${opt.description}</span>` : ""}
                    </label>
                  </div>
                `;
              }).join("")}
              <div class="question-option other-option ${hasOtherSelected ? "selected" : ""}">
                <input type="${currentQ.multiple ? "checkbox" : "radio"}" 
                       name="question-${this._currentQuestionIndex}" 
                       id="q-${this._currentQuestionIndex}-other"
                       class="question-input question-other-check"
                       data-label="__other__"
                       ${hasOtherSelected ? "checked" : ""}>
                <label for="q-${this._currentQuestionIndex}-other" class="question-option-label">
                  <span class="question-option-text">Other</span>
                </label>
              </div>
              ${hasOtherSelected ? `
                <div class="question-other-input-container">
                  <input type="text" 
                         class="question-other-input" 
                         placeholder="Enter your answer..."
                         value="${this._escapeHtml(currentOther)}">
                </div>
              ` : ""}
            </div>
          </div>
          <div class="modal-actions question-actions">
            <button class="btn btn-cancel-question">
              <ha-icon icon="mdi:close"></ha-icon>
              Cancel
            </button>
            ${!isFirstQuestion ? `
              <button class="btn btn-prev-question">
                <ha-icon icon="mdi:chevron-left"></ha-icon>
                Previous
              </button>
            ` : ""}
            ${isLastQuestion ? `
              <button class="btn btn-submit-question">
                <ha-icon icon="mdi:send"></ha-icon>
                Submit
              </button>
            ` : `
              <button class="btn btn-next-question">
                Next
                <ha-icon icon="mdi:chevron-right"></ha-icon>
              </button>
            `}
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
    
    const autoRefreshIcon = this._autoRefreshEnabled ? "mdi:sync" : "mdi:sync-off";
    const autoRefreshTitle = this._autoRefreshEnabled ? "Auto-refresh ON (click to disable)" : "Auto-refresh OFF (click to enable)";

    return `
      <div class="modal-backdrop history-modal-backdrop">
        <div class="modal history-modal chat-modal">
          <div class="modal-header history-header">
            <ha-icon icon="mdi:chat"></ha-icon>
            <span class="modal-title">${this._historyData?.session_title || "Chat"}</span>
            <div class="history-header-actions">
              ${isWorking ? `<span class="working-indicator"><ha-icon icon="mdi:loading" class="spinning"></ha-icon></span>` : ""}
              <button class="auto-refresh-toggle ${this._autoRefreshEnabled ? "enabled" : ""}" title="${autoRefreshTitle}">
                <ha-icon icon="${autoRefreshIcon}"></ha-icon>
              </button>
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
            <div class="chat-input-row">
              <textarea class="chat-input" placeholder="Type a message... (Enter to send, Shift+Enter for newline)" rows="1"></textarea>
              <button class="chat-send-btn" title="Send message">
                <ha-icon icon="mdi:send"></ha-icon>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  
  private _renderAgentSelector(): string {
    if (this._agentsLoading) {
      return `
        <div class="agent-selector-row">
          <div class="agent-selector-loading">
            <ha-icon icon="mdi:loading" class="spinning"></ha-icon>
            <span>Loading agents...</span>
          </div>
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
      return `<option value="${agent.name}" ${selected}>${agent.name}</option>`;
    }).join("");
    
    return `
      <div class="agent-selector-row">
        <label class="agent-selector-label">
          <ha-icon icon="mdi:robot"></ha-icon>
          <span>Agent:</span>
        </label>
        <select class="agent-selector" title="Select agent">
          <option value="" ${!this._selectedAgent ? "selected" : ""}>Default</option>
          ${options}
        </select>
      </div>
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
    const totalOnServer = this._historyData.total_count ?? totalMessages;
    const startIndex = Math.max(0, totalMessages - this._historyVisibleCount);
    const visibleMessages = this._historyData.messages.slice(startIndex);
    
    // Show "load more" if there are hidden messages locally OR more on server
    const hasMoreLocal = startIndex > 0;
    const hasMoreOnServer = totalMessages < totalOnServer;
    const hasMore = hasMoreLocal || hasMoreOnServer;

    let html = "";

    if (hasMore) {
      const remainingLocal = startIndex;
      const remainingOnServer = totalOnServer - totalMessages;
      const remainingTotal = remainingLocal + remainingOnServer;
      
      html += `
        <div class="history-load-more" data-action="load-more">
          <ha-icon icon="${this._historyLoadingMore ? "mdi:loading" : "mdi:chevron-up"}" class="${this._historyLoadingMore ? "spinning" : ""}"></ha-icon>
          <span>${this._historyLoadingMore ? "Loading..." : `Load more (${remainingTotal} older messages)`}</span>
        </div>
      `;
    }

    html += visibleMessages.map(msg => this._renderHistoryMessage(msg)).join("");
    html += this._renderInlinePermission();
    html += this._renderInlineQuestion();

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

  private _renderInlineQuestion(): string {
    if (!this._historyDeviceId) return "";
    
    const device = this._devices.get(this._historyDeviceId);
    if (!device) return "";
    
    const stateEntity = device.entities.get("state");
    const currentState = stateEntity?.state ?? "unknown";
    
    if (currentState !== "waiting_input") return "";
    
    const question = this._pendingQuestions.get(this._historyDeviceId);
    const hasQuestions = question && question.questions.length > 0;
    
    if (!hasQuestions) {
      return `
        <div class="inline-question">
          <div class="inline-question-header">
            <ha-icon icon="mdi:comment-question"></ha-icon>
            <span class="inline-question-title">Awaiting Input</span>
          </div>
          <div class="inline-question-body">
            <div class="inline-question-loading">
              <ha-icon icon="mdi:loading" class="spinning"></ha-icon>
              <span>Loading question...</span>
            </div>
          </div>
        </div>
      `;
    }
    
    // Show first question inline, with button to open full modal
    const firstQuestion = question.questions[0];
    const totalQuestions = question.questions.length;
    
    return `
      <div class="inline-question">
        <div class="inline-question-header">
          <ha-icon icon="mdi:comment-question"></ha-icon>
          <span class="inline-question-title">${firstQuestion.header || "Question"}</span>
          ${totalQuestions > 1 ? `<span class="inline-question-count">${totalQuestions} questions</span>` : ""}
        </div>
        <div class="inline-question-body">
          <div class="inline-question-text">${firstQuestion.question}</div>
          <div class="inline-question-options">
            ${firstQuestion.options.slice(0, 3).map((opt, idx) => `
              <div class="inline-question-option" data-option-index="${idx}">
                <input type="${firstQuestion.multiple ? "checkbox" : "radio"}" 
                       name="inline-q-0" 
                       id="inline-opt-${idx}" 
                       class="inline-question-input"
                       data-label="${this._escapeHtml(opt.label)}">
                <label for="inline-opt-${idx}" class="inline-question-label">
                  <span class="option-label">${opt.label}</span>
                  ${opt.description ? `<span class="option-desc">${opt.description}</span>` : ""}
                </label>
              </div>
            `).join("")}
            ${firstQuestion.options.length > 3 ? `
              <div class="inline-question-more">
                +${firstQuestion.options.length - 3} more options
              </div>
            ` : ""}
          </div>
        </div>
        <div class="inline-question-actions">
          <button class="inline-question-btn cancel" data-action="cancel-question">
            <ha-icon icon="mdi:close"></ha-icon>
            Cancel
          </button>
          ${totalQuestions > 1 || firstQuestion.options.length > 3 ? `
            <button class="inline-question-btn open-modal" data-action="open-question-modal" data-device-id="${this._historyDeviceId}">
              <ha-icon icon="mdi:arrow-expand"></ha-icon>
              ${totalQuestions > 1 ? "Answer All" : "View All Options"}
            </button>
          ` : `
            <button class="inline-question-btn submit" data-action="submit-inline-question">
              <ha-icon icon="mdi:send"></ha-icon>
              Submit
            </button>
          `}
        </div>
      </div>
    `;
  }

  private _renderHistoryMessage(msg: HistoryMessage): string {
    const isUser = msg.role === "user";
    const timeInfo = formatRelativeTime(msg.timestamp);
    
    const partsHtml = msg.parts.map(part => {
      if (part.type === "text" && part.content) {
        return `<div class="history-text markdown-content">${this._renderMarkdown(part.content)}</div>`;
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

    // Add copy button for all messages
    const copyButtonHtml = `
      <button class="copy-btn" data-message-id="${msg.id}" title="Copy as Markdown">
        <ha-icon icon="mdi:content-copy"></ha-icon>
      </button>
    `;

    return `
      <div class="history-message ${isUser ? "user" : "assistant"}" data-message-id="${msg.id}">
        <div class="message-header">
          <ha-icon icon="${isUser ? "mdi:account" : "mdi:robot"}"></ha-icon>
          <span class="message-role">${isUser ? "You" : "Assistant"}</span>
          <span class="message-time" title="${timeInfo.tooltip}">${timeInfo.display}</span>
          <div class="message-actions">
            ${copyButtonHtml}
            ${speakButtonHtml}
          </div>
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

  /**
   * Render markdown to HTML. Supports:
   * - Headers (h1-h6)
   * - Bold, italic, strikethrough
   * - Code blocks (fenced with ```) and inline code
   * - Links
   * - Lists (ordered and unordered)
   * - Blockquotes
   * - Horizontal rules
   */
  private _renderMarkdown(text: string): string {
    // First, extract and protect code blocks from other processing
    // Use \x00 (null char) as delimiter since it won't appear in normal text
    const codeBlocks: string[] = [];
    let processed = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
      const index = codeBlocks.length;
      const escapedCode = this._escapeHtml(code.trimEnd());
      const langClass = lang ? ` class="language-${lang}"` : "";
      codeBlocks.push(`<pre><code${langClass}>${escapedCode}</code></pre>`);
      return `\x00CB${index}\x00`;
    });

    // Protect inline code
    const inlineCode: string[] = [];
    processed = processed.replace(/`([^`]+)`/g, (_match, code) => {
      const index = inlineCode.length;
      inlineCode.push(`<code>${this._escapeHtml(code)}</code>`);
      return `\x00IC${index}\x00`;
    });

    // Process line by line for block elements
    const lines = processed.split("\n");
    const result: string[] = [];
    let inList = false;
    let listType = "";
    let inBlockquote = false;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Horizontal rule
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
        if (inList) { result.push(listType === "ul" ? "</ul>" : "</ol>"); inList = false; }
        if (inBlockquote) { result.push("</blockquote>"); inBlockquote = false; }
        result.push("<hr>");
        continue;
      }

      // Headers
      const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headerMatch) {
        if (inList) { result.push(listType === "ul" ? "</ul>" : "</ol>"); inList = false; }
        if (inBlockquote) { result.push("</blockquote>"); inBlockquote = false; }
        const level = headerMatch[1].length;
        const content = this._processInlineMarkdown(headerMatch[2]);
        result.push(`<h${level}>${content}</h${level}>`);
        continue;
      }

      // Blockquote
      const quoteMatch = line.match(/^>\s*(.*)$/);
      if (quoteMatch) {
        if (inList) { result.push(listType === "ul" ? "</ul>" : "</ol>"); inList = false; }
        if (!inBlockquote) { result.push("<blockquote>"); inBlockquote = true; }
        result.push(this._processInlineMarkdown(quoteMatch[1]) + "<br>");
        continue;
      } else if (inBlockquote) {
        result.push("</blockquote>");
        inBlockquote = false;
      }

      // Unordered list
      const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
      if (ulMatch) {
        if (!inList || listType !== "ul") {
          if (inList) result.push(listType === "ul" ? "</ul>" : "</ol>");
          result.push("<ul>");
          inList = true;
          listType = "ul";
        }
        result.push(`<li>${this._processInlineMarkdown(ulMatch[2])}</li>`);
        continue;
      }

      // Ordered list
      const olMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);
      if (olMatch) {
        if (!inList || listType !== "ol") {
          if (inList) result.push(listType === "ul" ? "</ul>" : "</ol>");
          result.push("<ol>");
          inList = true;
          listType = "ol";
        }
        result.push(`<li>${this._processInlineMarkdown(olMatch[2])}</li>`);
        continue;
      }

      // Close list if we're no longer in one
      if (inList && line.trim() !== "") {
        result.push(listType === "ul" ? "</ul>" : "</ol>");
        inList = false;
      }

      // Empty line
      if (line.trim() === "") {
        if (inList) { result.push(listType === "ul" ? "</ul>" : "</ol>"); inList = false; }
        result.push("<br>");
        continue;
      }

      // Regular paragraph
      result.push(`<p>${this._processInlineMarkdown(line)}</p>`);
    }

    // Close any open tags
    if (inList) result.push(listType === "ul" ? "</ul>" : "</ol>");
    if (inBlockquote) result.push("</blockquote>");

    let html = result.join("\n");

    // Restore code blocks
    codeBlocks.forEach((block, i) => {
      html = html.replace(`\x00CB${i}\x00`, block);
    });

    // Restore inline code
    inlineCode.forEach((code, i) => {
      html = html.replace(`\x00IC${i}\x00`, code);
    });

    return html;
  }

  /**
   * Process inline markdown elements (bold, italic, links, etc.)
   */
  private _processInlineMarkdown(text: string): string {
    let result = this._escapeHtml(text);

    // Links: [text](url)
    result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Bold: **text** or __text__
    result = result.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    result = result.replace(/__([^_]+)__/g, "<strong>$1</strong>");

    // Italic: *text* or _text_
    result = result.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    result = result.replace(/_([^_]+)_/g, "<em>$1</em>");

    // Strikethrough: ~~text~~
    result = result.replace(/~~([^~]+)~~/g, "<del>$1</del>");

    return result;
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
    // Known active states
    const knownStates = ["idle", "working", "waiting_permission", "waiting_input", "error"];
    
    // Filter out sub-agent sessions (those with a parent) from the main list
    let devices = Array.from(this._devices.values()).filter(d => !d.parentSessionId);
    
    // Optionally filter out unknown/unavailable state sessions
    if (this._hideUnknown) {
      devices = devices.filter(d => {
        const state = d.entities.get("state")?.state ?? "";
        return knownStates.includes(state);
      });
    }
    
    if (this._sortMode === "activity") {
      devices.sort((a, b) => {
        const aActivity = a.entities.get("last_activity")?.state ?? "";
        const bActivity = b.entities.get("last_activity")?.state ?? "";
        if (!aActivity && !bActivity) return 0;
        if (!aActivity) return 1;
        if (!bActivity) return -1;
        // Parse as dates and compare timestamps
        const aTime = new Date(aActivity).getTime();
        const bTime = new Date(bActivity).getTime();
        // Handle invalid dates
        if (isNaN(aTime) && isNaN(bTime)) return 0;
        if (isNaN(aTime)) return 1;
        if (isNaN(bTime)) return -1;
        return bTime - aTime;
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
    
    // Check for sub-agent sessions
    const childSessions = this._getChildSessions(device.sessionId);
    const isSubAgent = !!device.parentSessionId;

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

    // Question alert (for waiting_input state)
    const question = this._getQuestionDetails(device);
    let questionHtml = "";
    if (question && question.questions.length > 0) {
      const firstQuestion = question.questions[0];
      questionHtml = `
        <div class="question-alert pinned clickable" data-device-id="${device.deviceId}">
          <ha-icon icon="mdi:comment-question"></ha-icon>
          <div class="question-details">
            <div class="question-title">${firstQuestion.header || "Question"}</div>
            <div class="question-preview">${question.questions.length > 1 ? `${question.questions.length} questions` : "Tap to answer"}</div>
          </div>
          <ha-icon icon="mdi:chevron-right" class="question-chevron"></ha-icon>
        </div>
      `;
    } else if (state === "waiting_input") {
      questionHtml = `
        <div class="question-alert pinned clickable" data-device-id="${device.deviceId}">
          <ha-icon icon="mdi:comment-question"></ha-icon>
          <div class="question-details">
            <div class="question-title">Input Required</div>
            <div class="question-preview">Loading question...</div>
          </div>
          <ha-icon icon="mdi:chevron-right" class="question-chevron"></ha-icon>
        </div>
      `;
    }

    // Show back button if explicitly requested OR if this is a sub-agent session
    const shouldShowBackButton = showBackButton || isSubAgent;
    const backButtonLabel = isSubAgent ? "Parent Session" : "Back";
    const backButtonHtml = shouldShowBackButton ? `
      <button class="back-button" data-action="back">
        <ha-icon icon="mdi:arrow-left"></ha-icon>
        <span>${backButtonLabel}</span>
      </button>
    ` : "";
    
    // Sub-agent indicator badge
    const subAgentBadgeHtml = isSubAgent ? `
      <div class="sub-agent-badge">
        <ha-icon icon="mdi:source-branch"></ha-icon>
        <span>Sub-agent Session</span>
      </div>
    ` : "";
    
    // Child sessions section
    // Separate active and inactive child sessions
    const activeStates = ["working", "waiting_permission", "waiting_input"];
    const activeChildren = childSessions.filter(c => activeStates.includes(c.entities.get("state")?.state ?? ""));
    const inactiveChildren = childSessions.filter(c => !activeStates.includes(c.entities.get("state")?.state ?? ""));
    
    const renderChildItem = (child: OpenCodeDevice, isActive: boolean) => {
      const childState = child.entities.get("state")?.state ?? "unknown";
      const childStateConfig = STATE_CONFIG[childState] || STATE_CONFIG.unknown;
      const childTitle = child.entities.get("session_title")?.state ?? "Unknown";
      const childActivity = child.entities.get("last_activity")?.state ?? "";
      const activityTime = childActivity ? formatRelativeTime(childActivity) : null;
      const childTool = child.entities.get("current_tool")?.state ?? "none";
      
      return `
        <div class="child-session-item clickable ${isActive ? 'active' : ''}" data-device-id="${child.deviceId}">
          <div class="child-session-status ${childState === 'working' ? 'pulse' : ''}">
            <ha-icon icon="${childStateConfig.icon}" style="color: ${childStateConfig.color}"></ha-icon>
          </div>
          <div class="child-session-info">
            <div class="child-session-title">${childTitle}</div>
            ${isActive && childTool !== "none" ? `<div class="child-session-tool"><ha-icon icon="mdi:tools"></ha-icon> ${childTool}</div>` : ""}
            ${!isActive && activityTime ? `<div class="child-session-activity">${activityTime.display}</div>` : ""}
          </div>
          <ha-icon icon="mdi:chevron-right" class="child-session-chevron"></ha-icon>
        </div>
      `;
    };
    
    let childSessionsHtml = "";
    
    // Active sub-agents section (shown prominently)
    if (activeChildren.length > 0) {
      const activeItems = activeChildren.map(child => renderChildItem(child, true)).join("");
      childSessionsHtml += `
        <div class="child-sessions-section active-section">
          <div class="child-sessions-header active">
            <ha-icon icon="mdi:run-fast"></ha-icon>
            <span>Active Sub-agents (${activeChildren.length})</span>
          </div>
          <div class="child-sessions-list">
            ${activeItems}
          </div>
        </div>
      `;
    }
    
    // Inactive sub-agents section (collapsed style)
    if (inactiveChildren.length > 0) {
      const inactiveItems = inactiveChildren.map(child => renderChildItem(child, false)).join("");
      childSessionsHtml += `
        <div class="child-sessions-section">
          <div class="child-sessions-header">
            <ha-icon icon="mdi:source-branch"></ha-icon>
            <span>Sub-agent History (${inactiveChildren.length})</span>
          </div>
          <div class="child-sessions-list">
            ${inactiveItems}
          </div>
        </div>
      `;
    }

    return `
      <div class="detail-view">
        ${backButtonHtml}
        ${subAgentBadgeHtml}
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
        ${questionHtml}

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

        ${childSessionsHtml}

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
      .header-actions {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .sort-toggle,
      .hide-unknown-toggle {
        background: none;
        border: none;
        padding: 8px;
        cursor: pointer;
        border-radius: 50%;
        color: var(--secondary-text-color);
        transition: background 0.2s, color 0.2s;
      }
      .sort-toggle:hover,
      .hide-unknown-toggle:hover {
        background: var(--secondary-background-color);
        color: var(--primary-text-color);
      }
      .sort-toggle ha-icon,
      .hide-unknown-toggle ha-icon {
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
      
      /* Sub-agent badge for sub-agent sessions */
      .sub-agent-badge {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: var(--info-color, #039be5)15;
        border: 1px solid var(--info-color, #039be5)40;
        border-radius: 8px;
        margin-bottom: 16px;
        color: var(--info-color, #039be5);
        font-size: 0.85em;
      }
      .sub-agent-badge ha-icon {
        --mdc-icon-size: 16px;
      }
      
      /* Child sessions section */
      .child-sessions-section {
        margin-bottom: 16px;
        border: 1px solid var(--divider-color);
        border-radius: 8px;
        overflow: hidden;
      }
      .child-sessions-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px;
        background: var(--secondary-background-color);
        font-weight: 500;
        font-size: 0.9em;
      }
      .child-sessions-header ha-icon {
        --mdc-icon-size: 18px;
        color: var(--primary-color);
      }
      .child-sessions-list {
        display: flex;
        flex-direction: column;
      }
      .child-session-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        border-top: 1px solid var(--divider-color);
        cursor: pointer;
        transition: background 0.2s;
      }
      .child-session-item:hover {
        background: var(--secondary-background-color);
      }
      .child-session-status {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .child-session-status ha-icon {
        --mdc-icon-size: 20px;
      }
      .child-session-info {
        flex: 1;
        min-width: 0;
      }
      .child-session-title {
        font-size: 0.95em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .child-session-activity {
        font-size: 0.8em;
        color: var(--secondary-text-color);
        margin-top: 2px;
      }
      .child-session-tool {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 0.8em;
        color: var(--primary-color);
        margin-top: 2px;
      }
      .child-session-tool ha-icon {
        --mdc-icon-size: 12px;
      }
      .child-session-chevron {
        --mdc-icon-size: 20px;
        color: var(--secondary-text-color);
      }
      
      /* Active sub-agents section */
      .child-sessions-section.active-section {
        border-color: var(--primary-color);
        margin-bottom: 12px;
      }
      .child-sessions-header.active {
        background: var(--primary-color)15;
        color: var(--primary-color);
      }
      .child-sessions-header.active ha-icon {
        color: var(--primary-color);
      }
      .child-session-item.active {
        background: var(--primary-color)08;
      }
      .child-session-item.active:hover {
        background: var(--primary-color)15;
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
      .auto-refresh-toggle {
        background: none;
        border: none;
        padding: 8px;
        cursor: pointer;
        border-radius: 50%;
        color: var(--secondary-text-color);
        transition: background 0.2s, color 0.2s;
        opacity: 0.6;
      }
      .auto-refresh-toggle:hover {
        background: var(--secondary-background-color);
        opacity: 1;
      }
      .auto-refresh-toggle.enabled {
        color: var(--primary-color);
        opacity: 1;
      }
      .auto-refresh-toggle ha-icon {
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
        user-select: text;
        -webkit-user-select: text;
      }
      .history-body ::selection {
        background: var(--primary-color);
        color: var(--text-primary-color, #fff);
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
      .message-actions {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .copy-btn {
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
        opacity: 0.6;
      }
      .copy-btn:hover {
        background: var(--divider-color);
        color: var(--primary-text-color);
        opacity: 1;
      }
      .copy-btn.copied {
        color: #4caf50;
        opacity: 1;
      }
      .copy-btn ha-icon {
        --mdc-icon-size: 16px;
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
        word-break: break-word;
      }
      /* Markdown content styles */
      .markdown-content {
        line-height: 1.6;
      }
      .markdown-content p {
        margin: 0 0 0.5em 0;
      }
      .markdown-content p:last-child {
        margin-bottom: 0;
      }
      .markdown-content h1, .markdown-content h2, .markdown-content h3,
      .markdown-content h4, .markdown-content h5, .markdown-content h6 {
        margin: 0.8em 0 0.4em 0;
        font-weight: 600;
        line-height: 1.3;
      }
      .markdown-content h1 { font-size: 1.5em; }
      .markdown-content h2 { font-size: 1.3em; }
      .markdown-content h3 { font-size: 1.15em; }
      .markdown-content h4 { font-size: 1.05em; }
      .markdown-content h5 { font-size: 1em; }
      .markdown-content h6 { font-size: 0.95em; color: var(--secondary-text-color); }
      .markdown-content code {
        background: var(--secondary-background-color);
        padding: 0.15em 0.4em;
        border-radius: 4px;
        font-family: monospace;
        font-size: 0.9em;
      }
      .markdown-content pre {
        background: var(--secondary-background-color);
        padding: 12px;
        border-radius: 8px;
        overflow-x: auto;
        margin: 0.5em 0;
      }
      .markdown-content pre code {
        background: none;
        padding: 0;
        font-size: 0.85em;
        line-height: 1.5;
      }
      .markdown-content blockquote {
        margin: 0.5em 0;
        padding: 0.5em 1em;
        border-left: 3px solid var(--primary-color);
        background: var(--secondary-background-color);
        border-radius: 0 4px 4px 0;
      }
      .markdown-content blockquote br:last-child {
        display: none;
      }
      .markdown-content ul, .markdown-content ol {
        margin: 0.5em 0;
        padding-left: 1.5em;
      }
      .markdown-content li {
        margin: 0.25em 0;
      }
      .markdown-content hr {
        border: none;
        border-top: 1px solid var(--divider-color);
        margin: 1em 0;
      }
      .markdown-content a {
        color: var(--primary-color);
        text-decoration: none;
      }
      .markdown-content a:hover {
        text-decoration: underline;
      }
      .markdown-content strong {
        font-weight: 600;
      }
      .markdown-content em {
        font-style: italic;
      }
      .markdown-content del {
        text-decoration: line-through;
        opacity: 0.7;
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
        flex-direction: column;
        gap: 8px;
        padding: 12px 16px;
        border-top: 1px solid var(--divider-color);
        background: var(--card-background-color);
      }
      .agent-selector-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .agent-selector-label {
        display: flex;
        align-items: center;
        gap: 4px;
        color: var(--secondary-text-color);
        font-size: 0.85em;
      }
      .agent-selector-label ha-icon {
        --mdc-icon-size: 16px;
      }
      .agent-selector-loading {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--secondary-text-color);
        font-size: 0.85em;
      }
      .agent-selector-loading ha-icon {
        --mdc-icon-size: 16px;
      }
      .agent-selector {
        flex: 1;
        padding: 6px 10px;
        border: 1px solid var(--divider-color);
        border-radius: 6px;
        background: var(--card-background-color);
        color: var(--primary-text-color);
        font-size: 0.85em;
        cursor: pointer;
        max-width: 100%;
      }
      .chat-input-row {
        display: flex;
        gap: 8px;
        align-items: flex-end;
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

      /* Question alert styles */
      .question-alert {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 12px;
        padding: 12px;
        background: #9c27b020;
        border: 1px solid #9c27b0;
        border-radius: 8px;
      }
      .question-alert.clickable {
        cursor: pointer;
        transition: background 0.2s;
      }
      .question-alert.clickable:hover {
        background: #9c27b030;
      }
      .question-alert > ha-icon:first-child {
        --mdc-icon-size: 24px;
        color: #9c27b0;
      }
      .question-details {
        flex: 1;
      }
      .question-title {
        font-weight: 500;
      }
      .question-preview {
        font-size: 0.85em;
        color: var(--secondary-text-color);
      }
      .question-chevron {
        --mdc-icon-size: 20px;
        color: var(--secondary-text-color);
      }

      /* Question modal styles */
      .question-modal {
        max-width: 500px;
        width: 95%;
      }
      .question-header {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .question-header ha-icon:first-child {
        --mdc-icon-size: 24px;
        color: #9c27b0;
      }
      .question-progress {
        margin-left: auto;
        margin-right: 8px;
        padding: 4px 8px;
        background: var(--secondary-background-color);
        border-radius: 12px;
        font-size: 0.85em;
        color: var(--secondary-text-color);
      }
      .question-body {
        padding: 16px;
      }
      .question-text {
        font-size: 1.05em;
        margin-bottom: 16px;
        line-height: 1.5;
      }
      .question-options {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .question-option {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 12px;
        background: var(--secondary-background-color);
        border: 2px solid transparent;
        border-radius: 8px;
        cursor: pointer;
        transition: background 0.2s, border-color 0.2s;
      }
      .question-option:hover {
        background: var(--divider-color);
      }
      .question-option.selected {
        border-color: #9c27b0;
        background: #9c27b010;
      }
      .question-option.other-option {
        border-style: dashed;
      }
      .question-input {
        margin-top: 2px;
        accent-color: #9c27b0;
      }
      .question-option-label {
        flex: 1;
        cursor: pointer;
      }
      .question-option-text {
        display: block;
        font-weight: 500;
      }
      .question-option-desc {
        display: block;
        font-size: 0.85em;
        color: var(--secondary-text-color);
        margin-top: 4px;
      }
      .question-other-input-container {
        padding: 0 12px 12px;
      }
      .question-other-input {
        width: 100%;
        padding: 12px;
        border: 1px solid var(--divider-color);
        border-radius: 8px;
        background: var(--card-background-color);
        color: var(--primary-text-color);
        font-size: 1em;
      }
      .question-other-input:focus {
        outline: none;
        border-color: #9c27b0;
      }
      .question-actions {
        display: flex;
        gap: 12px;
        padding: 16px;
        border-top: 1px solid var(--divider-color);
      }
      .btn-cancel-question {
        background: #f4433620;
        color: #f44336;
      }
      .btn-prev-question {
        background: var(--secondary-background-color);
        color: var(--primary-text-color);
      }
      .btn-next-question {
        flex: 1;
        background: #9c27b020;
        color: #9c27b0;
      }
      .btn-submit-question {
        flex: 1;
        background: #4caf50;
        color: white;
      }

      /* Inline question styles */
      .inline-question {
        margin: 16px 0;
        padding: 16px;
        background: #9c27b015;
        border: 1px solid #9c27b0;
        border-radius: 12px;
      }
      .inline-question-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 12px;
      }
      .inline-question-header ha-icon {
        --mdc-icon-size: 24px;
        color: #9c27b0;
      }
      .inline-question-title {
        font-weight: 500;
        font-size: 1.1em;
        flex: 1;
      }
      .inline-question-count {
        padding: 4px 8px;
        background: #9c27b020;
        border-radius: 12px;
        font-size: 0.8em;
        color: #9c27b0;
      }
      .inline-question-body {
        margin-bottom: 16px;
      }
      .inline-question-text {
        font-size: 1em;
        margin-bottom: 12px;
        line-height: 1.5;
      }
      .inline-question-options {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .inline-question-option {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 10px;
        background: var(--card-background-color);
        border-radius: 8px;
      }
      .inline-question-input {
        margin-top: 2px;
        accent-color: #9c27b0;
      }
      .inline-question-label {
        flex: 1;
        cursor: pointer;
      }
      .inline-question-label .option-label {
        display: block;
        font-weight: 500;
      }
      .inline-question-label .option-desc {
        display: block;
        font-size: 0.85em;
        color: var(--secondary-text-color);
        margin-top: 2px;
      }
      .inline-question-more {
        padding: 10px;
        text-align: center;
        color: var(--secondary-text-color);
        font-size: 0.9em;
        font-style: italic;
      }
      .inline-question-loading {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--secondary-text-color);
        font-size: 0.9em;
      }
      .inline-question-actions {
        display: flex;
        gap: 8px;
      }
      .inline-question-btn {
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
      .inline-question-btn ha-icon {
        --mdc-icon-size: 16px;
      }
      .inline-question-btn.cancel {
        background: #f4433620;
        color: #f44336;
      }
      .inline-question-btn.open-modal {
        background: #9c27b020;
        color: #9c27b0;
      }
      .inline-question-btn.submit {
        background: #4caf50;
        color: white;
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

// Card Editor for visual configuration
class OpenCodeCardEditor extends HTMLElement {
  private _config?: CardConfig;
  private _hass?: HomeAssistant;

  set hass(hass: HomeAssistant) {
    this._hass = hass;
  }

  setConfig(config: CardConfig) {
    this._config = config;
    this._render();
  }

  private _render() {
    if (!this._config) return;

    this.innerHTML = `
      <style>
        .editor-row {
          display: flex;
          flex-direction: column;
          margin-bottom: 16px;
        }
        .editor-row label {
          font-weight: 500;
          margin-bottom: 4px;
        }
        .editor-row input[type="text"],
        .editor-row input[type="number"],
        .editor-row select {
          padding: 8px;
          border: 1px solid var(--divider-color);
          border-radius: 4px;
          background: var(--card-background-color);
          color: var(--primary-text-color);
        }
        .editor-row .checkbox-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .editor-row .hint {
          font-size: 0.85em;
          color: var(--secondary-text-color);
          margin-top: 4px;
        }
      </style>
      
      <div class="editor-row">
        <label for="title">Title</label>
        <input type="text" id="title" value="${this._config.title || ""}" placeholder="OpenCode Sessions">
        <span class="hint">Card header title</span>
      </div>
      
      <div class="editor-row">
        <label for="device">Pin to Device (optional)</label>
        <input type="text" id="device" value="${this._config.device || ""}" placeholder="Device ID">
        <span class="hint">Pin card to a specific device ID</span>
      </div>
      
      <div class="editor-row">
        <label for="sort_by">Default Sort</label>
        <select id="sort_by">
          <option value="activity" ${this._config.sort_by !== "name" ? "selected" : ""}>By Activity (newest first)</option>
          <option value="name" ${this._config.sort_by === "name" ? "selected" : ""}>By Name (alphabetical)</option>
        </select>
        <span class="hint">Default sorting for session list</span>
      </div>
      
      <div class="editor-row">
        <div class="checkbox-row">
          <input type="checkbox" id="hide_unknown" ${this._config.hide_unknown ? "checked" : ""}>
          <label for="hide_unknown">Hide unknown sessions by default</label>
        </div>
        <span class="hint">Hide sessions with unknown/unavailable state</span>
      </div>
      
      <div class="editor-row">
        <label for="working_refresh_interval">Auto-refresh Interval (seconds)</label>
        <input type="number" id="working_refresh_interval" value="${this._config.working_refresh_interval || 10}" min="1" max="60">
        <span class="hint">History refresh interval when session is working</span>
      </div>
    `;

    this._attachListeners();
  }

  private _attachListeners() {
    this.querySelector("#title")?.addEventListener("input", (e) => {
      this._updateConfig("title", (e.target as HTMLInputElement).value || undefined);
    });

    this.querySelector("#device")?.addEventListener("input", (e) => {
      this._updateConfig("device", (e.target as HTMLInputElement).value || undefined);
    });

    this.querySelector("#sort_by")?.addEventListener("change", (e) => {
      const value = (e.target as HTMLSelectElement).value as "activity" | "name";
      this._updateConfig("sort_by", value === "activity" ? undefined : value);
    });

    this.querySelector("#hide_unknown")?.addEventListener("change", (e) => {
      this._updateConfig("hide_unknown", (e.target as HTMLInputElement).checked || undefined);
    });

    this.querySelector("#working_refresh_interval")?.addEventListener("input", (e) => {
      const value = parseInt((e.target as HTMLInputElement).value, 10);
      this._updateConfig("working_refresh_interval", isNaN(value) || value === 10 ? undefined : value);
    });
  }

  private _updateConfig(key: string, value: unknown) {
    if (!this._config) return;

    const newConfig = { ...this._config };
    if (value === undefined) {
      delete (newConfig as Record<string, unknown>)[key];
    } else {
      (newConfig as Record<string, unknown>)[key] = value;
    }

    this._config = newConfig;

    const event = new CustomEvent("config-changed", {
      detail: { config: newConfig },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }
}

// Register editor
customElements.define("opencode-card-editor", OpenCodeCardEditor);

// Register the card
customElements.define("opencode-card", OpenCodeCard);

// Card registration info for HA
(window as unknown as { customCards: unknown[] }).customCards = (window as unknown as { customCards: unknown[] }).customCards || [];
(window as unknown as { customCards: unknown[] }).customCards.push({
  type: "opencode-card",
  name: "OpenCode Card",
  description: "Display and interact with OpenCode AI coding assistant sessions",
});
