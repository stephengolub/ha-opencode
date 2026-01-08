function R(S){return`opencode_history_${S}`}function L(S){let g=new Date(S);if(isNaN(g.getTime()))return{display:"Unknown",tooltip:"Invalid timestamp"};let e=new Date,i=e.getTime()-g.getTime(),t=Math.floor(i/6e4),s=Math.floor(i/36e5),o=g.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),r=g.toLocaleDateString([],{month:"short",day:"numeric"}),n=g.toLocaleString(),d=g.toDateString()===e.toDateString();if(s>=2)return d?{display:o,tooltip:n}:{display:`${r} ${o}`,tooltip:n};if(t<1)return{display:"Just now",tooltip:n};if(t<60)return{display:`${t}m ago`,tooltip:n};{let c=Math.floor(t/60),a=t%60;return a===0?{display:`${c}h ago`,tooltip:n}:{display:`${c}h ${a}m ago`,tooltip:n}}}var $={idle:{icon:"mdi:sleep",color:"#4caf50",label:"Idle"},working:{icon:"mdi:cog",color:"#2196f3",label:"Working"},waiting_permission:{icon:"mdi:shield-alert",color:"#ff9800",label:"Needs Permission"},error:{icon:"mdi:alert-circle",color:"#f44336",label:"Error"},unknown:{icon:"mdi:help-circle",color:"#9e9e9e",label:"Unknown"}},_=class _ extends HTMLElement{constructor(){super(...arguments);this._devices=new Map;this._deviceRegistry=new Map;this._entityRegistry=new Map;this._initialized=!1;this._showPermissionModal=!1;this._activePermission=null;this._selectedDeviceId=null;this._showHistoryView=!1;this._historyLoading=!1;this._historyData=null;this._historySessionId=null;this._historyDeviceId=null;this._historyVisibleCount=10;this._historyLoadingMore=!1;this._isAtBottom=!0;this._pendingPermissions=new Map;this._lastRenderHash="";this._availableAgents=[];this._selectedAgent=null;this._agentsLoading=!1;this._autoRefreshInterval=null;this._autoRefreshEnabled=!0;this._lastDeviceState=null;this._sortMode="activity";this._stateChangeUnsubscribe=null;this._historyResponseUnsubscribe=null;this._agentsResponseUnsubscribe=null;this._speakingMessageId=null}set hass(e){if(this._hass=e,!this._initialized)this._initialize();else{if(this._updateDevices(),this._showHistoryView&&this._historyDeviceId){let o=this._devices.get(this._historyDeviceId)?.entities.get("state")?.state??"unknown";this._lastDeviceState!==null&&this._lastDeviceState!==o&&this._refreshHistory(),this._lastDeviceState=o,this._manageAutoRefresh(o);return}if(this._showPermissionModal&&this._activePermission){let t=this._findDeviceIdForPermission(this._activePermission);if(t){let s=this._pendingPermissions.get(t);if(s&&s.permission_id&&!this._activePermission.permission_id){this._activePermission=s,this._render();return}}return}let i=this._computeStateHash();i!==this._lastRenderHash&&(this._lastRenderHash=i,this._render())}}_manageAutoRefresh(e){let i=(this._config?.working_refresh_interval??10)*1e3;e==="working"&&this._autoRefreshEnabled?this._autoRefreshInterval||(this._autoRefreshInterval=setInterval(()=>{this._showHistoryView&&!this._historyLoading&&this._refreshHistory()},i)):this._autoRefreshInterval&&(clearInterval(this._autoRefreshInterval),this._autoRefreshInterval=null)}_toggleAutoRefresh(){if(this._autoRefreshEnabled=!this._autoRefreshEnabled,this._autoRefreshEnabled&&this._historyDeviceId){let t=this._devices.get(this._historyDeviceId)?.entities.get("state")?.state??"unknown";this._manageAutoRefresh(t)}else!this._autoRefreshEnabled&&this._autoRefreshInterval&&(clearInterval(this._autoRefreshInterval),this._autoRefreshInterval=null);this._render()}_computeStateHash(){let e=[];for(let[i,t]of this._devices){let s=t.entities.get("state"),o=t.entities.get("session_title"),r=t.entities.get("model"),n=t.entities.get("current_tool"),d=t.entities.get("cost"),c=t.entities.get("tokens_input"),a=t.entities.get("tokens_output"),l=t.entities.get("permission_pending"),p=t.entities.get("last_activity"),f=s?.attributes?.agent,m=s?.attributes?.current_agent;e.push(`${i}:${s?.state}:${o?.state}:${r?.state}:${n?.state}:${d?.state}:${c?.state}:${a?.state}:${l?.state}:${p?.state}:${f}:${m}`),l?.state==="on"&&e.push(`perm:${l.attributes?.permission_id}`)}for(let[i,t]of this._pendingPermissions)e.push(`pending:${i}:${t.permission_id}`);return e.join("|")}_findDeviceIdForPermission(e){for(let[i,t]of this._devices)if(t.sessionId===e.session_id)return i;return null}setConfig(e){this._config=e}async _initialize(){this._hass&&(this._initialized=!0,await this._fetchRegistries(),this._updateDevices(),await this._setupEventSubscriptions(),this._render())}async _setupEventSubscriptions(){this._hass&&(this._stateChangeUnsubscribe=await this._hass.connection.subscribeEvents(e=>{let i=e.data;this._updateDevices();let t=this._computeStateHash();t!==this._lastRenderHash&&(this._lastRenderHash=t,this._render())},"opencode_state_change"),this._historyResponseUnsubscribe=await this._hass.connection.subscribeEvents(e=>{let i=e.data;this._historySessionId&&i.session_id===this._historySessionId&&this._handleHistoryResponse(i.history)},"opencode_history_response"),this._agentsResponseUnsubscribe=await this._hass.connection.subscribeEvents(e=>{let i=e.data;this._historySessionId&&i.session_id===this._historySessionId&&(this._availableAgents=i.agents,this._agentsLoading=!1,this._render())},"opencode_agents_response"))}disconnectedCallback(){this._stateChangeUnsubscribe&&(this._stateChangeUnsubscribe(),this._stateChangeUnsubscribe=null),this._historyResponseUnsubscribe&&(this._historyResponseUnsubscribe(),this._historyResponseUnsubscribe=null),this._agentsResponseUnsubscribe&&(this._agentsResponseUnsubscribe(),this._agentsResponseUnsubscribe=null),this._autoRefreshInterval&&(clearInterval(this._autoRefreshInterval),this._autoRefreshInterval=null),this._stopSpeaking()}async _fetchRegistries(){if(this._hass)try{let e=await this._hass.callWS({type:"config/device_registry/list"});for(let t of e)t.manufacturer==="OpenCode"&&this._deviceRegistry.set(t.id,t);let i=await this._hass.callWS({type:"config/entity_registry/list"});for(let t of i)t.platform==="opencode"&&this._deviceRegistry.has(t.device_id)&&this._entityRegistry.set(t.entity_id,t)}catch(e){console.error("[opencode-card] Failed to fetch registries:",e)}}_updateDevices(){if(this._hass){this._devices.clear();for(let[e,i]of this._entityRegistry){let t=this._deviceRegistry.get(i.device_id);if(!t)continue;let s=this._hass.states[e];if(!s)continue;let o=this._devices.get(t.id);if(!o){let c=t.identifiers?.[0]?.[1]?.replace("opencode_","ses_")||"";o={deviceId:t.id,deviceName:t.name,sessionId:c,entities:new Map},this._devices.set(t.id,o)}let r=i.unique_id||"",n=t.identifiers?.[0]?.[1]||"",d="";if(n&&r.startsWith(n+"_"))d=r.slice(n.length+1);else{let c=["state","session_title","model","current_tool","tokens_input","tokens_output","cost","last_activity","permission_pending"];for(let a of c)if(r.endsWith("_"+a)){d=a;break}}d&&o.entities.set(d,s)}this._updatePendingPermissions()}}_updatePendingPermissions(){for(let[e,i]of this._devices){let t=i.entities.get("permission_pending"),s=i.entities.get("state");if(t?.state==="on"&&t.attributes){let o=t.attributes;o.permission_id&&o.permission_title&&this._pendingPermissions.set(e,{permission_id:o.permission_id,type:o.permission_type||"unknown",title:o.permission_title,session_id:i.sessionId,pattern:o.pattern,metadata:o.metadata})}else s?.state!=="waiting_permission"||t?.state==="off"?this._pendingPermissions.delete(e):s?.state==="waiting_permission"&&!this._pendingPermissions.has(e)&&this._pendingPermissions.set(e,{permission_id:"",type:"pending",title:"Permission Required",session_id:i.sessionId})}}_getPinnedDevice(){return this._config?.device&&this._devices.get(this._config.device)||null}_getPermissionDetails(e){let i=this._pendingPermissions.get(e.deviceId);if(i&&i.permission_id)return i;let t=e.entities.get("permission_pending");if(t?.state!=="on"||!t.attributes)return i||null;let s=t.attributes;return{permission_id:s.permission_id,type:s.permission_type,title:s.permission_title,session_id:e.sessionId,pattern:s.pattern,metadata:s.metadata}}_showPermission(e){this._activePermission=e,this._showPermissionModal=!0,this._render()}_hidePermissionModal(){this._showPermissionModal=!1,this._activePermission=null,this._render()}_selectDevice(e){this._selectedDeviceId=e,this._render()}_goBack(){this._selectedDeviceId=null,this._render()}_isPinned(){return!!this._config?.device}async _sendChatMessage(e){if(!(!this._hass||!this._historySessionId||!e.trim()))try{if(this._historyData){let t={id:`temp_${Date.now()}`,role:"user",timestamp:new Date().toISOString(),parts:[{type:"text",content:e.trim()}]};this._historyData.messages.push(t),this._render(),setTimeout(()=>{let s=this.querySelector(".history-body");s&&(s.scrollTop=s.scrollHeight)},0)}let i={session_id:this._historySessionId,text:e.trim()};this._selectedAgent&&(i.agent=this._selectedAgent),await this._hass.callService("opencode","send_prompt",i)}catch(i){console.error("[opencode-card] Failed to send chat message:",i)}}async _showHistory(e,i){this._historyDeviceId=e,this._historySessionId=i,this._showHistoryView=!0,this._historyLoading=!0,this._selectedAgent=null;let s=this._devices.get(e)?.entities.get("state");this._lastDeviceState=s?.state??"unknown",this._manageAutoRefresh(this._lastDeviceState),this._render(),this._fetchAgents();let o=this._loadHistoryFromCache(i);o?(this._historyData=o.data,this._historyLoading=!1,this._render(),await this._fetchHistorySince(o.lastFetched)):await this._fetchFullHistory()}async _fetchAgents(){if(!(!this._hass||!this._historySessionId)){this._agentsLoading=!0;try{await this._hass.callService("opencode","get_agents",{session_id:this._historySessionId,request_id:`agents_${Date.now()}`}),setTimeout(()=>{this._agentsLoading&&(this._agentsLoading=!1,this._render())},1e4)}catch(e){console.error("[opencode-card] Failed to fetch agents:",e),this._agentsLoading=!1}}}_hideHistoryView(){this._showHistoryView=!1,this._historyLoading=!1,this._historyData=null,this._historyDeviceId=null,this._historySessionId=null,this._historyVisibleCount=10,this._isAtBottom=!0,this._availableAgents=[],this._selectedAgent=null,this._agentsLoading=!1,this._lastDeviceState=null,this._autoRefreshEnabled=!0,this._autoRefreshInterval&&(clearInterval(this._autoRefreshInterval),this._autoRefreshInterval=null),this._render()}_scrollToBottom(){let e=this.querySelector(".history-body");if(e){e.scrollTop=e.scrollHeight,this._isAtBottom=!0;let i=this.querySelector(".scroll-to-bottom-btn");i&&i.classList.add("hidden")}}_loadHistoryFromCache(e){try{let i=localStorage.getItem(R(e));if(i)return JSON.parse(i)}catch(i){console.error("[opencode-card] Failed to load history from cache:",i)}return null}_saveHistoryToCache(e,i){try{let t={data:i,lastFetched:i.fetched_at};localStorage.setItem(R(e),JSON.stringify(t))}catch(t){console.error("[opencode-card] Failed to save history to cache:",t)}}async _fetchFullHistory(){if(!(!this._hass||!this._historySessionId))try{await this._hass.callService("opencode","get_history",{session_id:this._historySessionId,request_id:`req_${Date.now()}`})}catch(e){console.error("[opencode-card] Failed to request history:",e),this._historyLoading=!1,this._render()}}async _fetchHistorySince(e){if(!(!this._hass||!this._historySessionId))try{await this._hass.callService("opencode","get_history",{session_id:this._historySessionId,since:e,request_id:`req_${Date.now()}`})}catch(i){console.error("[opencode-card] Failed to request history update:",i)}}_handleHistoryResponse(e){if(!this._historySessionId)return;let i=e.since&&e.messages.length>0,t=!this._historyData;if(e.since&&this._historyData){let n=new Set(this._historyData.messages.map(c=>c.id)),d=e.messages.filter(c=>!n.has(c.id));this._historyData.messages.push(...d),this._historyData.fetched_at=e.fetched_at}else this._historyData=e;this._saveHistoryToCache(this._historySessionId,this._historyData),this._historyLoading=!1,this._render();let o=(this._historyDeviceId?this._devices.get(this._historyDeviceId):null)?.entities.get("state")?.state==="working";(t||i&&(this._isAtBottom||this._autoRefreshEnabled&&o))&&setTimeout(()=>this._scrollToBottom(),0)}_refreshHistory(){!this._historySessionId||!this._historyData||(this._historyLoading=!0,this._render(),this._fetchHistorySince(this._historyData.fetched_at))}async _respondToPermission(e){if(!this._hass||!this._activePermission)return;let{permission_id:i,session_id:t}=this._activePermission;if(!i){console.error("[opencode-card] Cannot respond: missing permission_id");return}try{await this._hass.callService("opencode","respond_permission",{session_id:t,permission_id:i,response:e}),this._hidePermissionModal()}catch(s){console.error("[opencode-card] Failed to send permission response:",s)}}_render(){let e=this._config?.title??"OpenCode Sessions",i=this._getPinnedDevice(),t=this._selectedDeviceId?this._devices.get(this._selectedDeviceId):null,s="";if(i)s=`
        <ha-card>
          <div class="card-content pinned">
            ${this._renderDetailView(i,!1)}
          </div>
        </ha-card>
      `;else if(t)s=`
        <ha-card>
          <div class="card-content pinned">
            ${this._renderDetailView(t,!0)}
          </div>
        </ha-card>
      `;else{let o=this._sortMode==="activity"?"mdi:sort-clock-descending":"mdi:sort-alphabetical-ascending",r=this._sortMode==="activity"?"Sorted by latest activity":"Sorted by name";s=`
        <ha-card>
          <div class="card-header">
            <div class="name">${e}</div>
            ${this._devices.size>1?`
              <button class="sort-toggle" title="${r}">
                <ha-icon icon="${o}"></ha-icon>
              </button>
            `:""}
          </div>
          <div class="card-content">
            ${this._devices.size===0?this._renderEmpty():this._renderDevices()}
          </div>
        </ha-card>
      `}this._showPermissionModal&&this._activePermission&&(s+=this._renderPermissionModal(this._activePermission)),this._showHistoryView&&(s+=this._renderHistoryView()),this.innerHTML=`
      ${s}
      <style>
        ${this._getStyles()}
      </style>
    `,this._attachEventListeners()}_attachEventListeners(){!this._isPinned()&&!this._selectedDeviceId&&this.querySelectorAll(".device-card[data-device-id]").forEach(t=>{t.addEventListener("click",s=>{if(s.target.closest(".permission-alert"))return;let o=t.dataset.deviceId;o&&this._selectDevice(o)})}),this.querySelector(".back-button")?.addEventListener("click",()=>{this._goBack()}),this.querySelector(".sort-toggle")?.addEventListener("click",()=>{this._sortMode=this._sortMode==="activity"?"name":"activity",this._render()}),this.querySelectorAll(".permission-alert[data-device-id]").forEach(t=>{t.addEventListener("click",s=>{s.stopPropagation();let o=t.dataset.deviceId;if(o){let r=this._devices.get(o);if(r){let n=this._getPermissionDetails(r);n?this._showPermission(n):this._showPermission({permission_id:"",type:"pending",title:"Permission Required",session_id:r.sessionId})}}})}),this.querySelector(".modal-backdrop:not(.history-modal-backdrop)")?.addEventListener("click",t=>{t.target.classList.contains("modal-backdrop")&&this._hidePermissionModal()}),this.querySelector(".modal-close:not(.history-close)")?.addEventListener("click",()=>{this._hidePermissionModal()}),this.querySelector(".btn-allow-once")?.addEventListener("click",()=>{this._respondToPermission("once")}),this.querySelector(".btn-allow-always")?.addEventListener("click",()=>{this._respondToPermission("always")}),this.querySelector(".btn-reject")?.addEventListener("click",()=>{this._respondToPermission("reject")}),this.querySelector(".open-chat-btn")?.addEventListener("click",()=>{let t=this.querySelector(".open-chat-btn"),s=t?.dataset.deviceId,o=t?.dataset.sessionId;s&&o&&this._showHistory(s,o)}),this.querySelector(".history-modal-backdrop")?.addEventListener("click",t=>{t.target.classList.contains("history-modal-backdrop")&&this._hideHistoryView()}),this.querySelector(".history-close")?.addEventListener("click",()=>{this._hideHistoryView()}),this.querySelector(".history-refresh-btn")?.addEventListener("click",()=>{this._refreshHistory()}),this.querySelector(".auto-refresh-toggle")?.addEventListener("click",()=>{this._toggleAutoRefresh()}),this.querySelector(".history-load-more")?.addEventListener("click",()=>{this._loadMoreHistory()});let e=this.querySelector(".history-body");e&&e.addEventListener("scroll",()=>{if(e.scrollTop<50&&!this._historyLoadingMore){let s=this._historyData?.messages.length||0;Math.max(0,s-this._historyVisibleCount)>0&&this._loadMoreHistory()}let t=e.scrollHeight-e.scrollTop-e.clientHeight<50;if(t!==this._isAtBottom){this._isAtBottom=t;let s=this.querySelector(".scroll-to-bottom-btn");s&&s.classList.toggle("hidden",t)}}),this.querySelector(".scroll-to-bottom-btn")?.addEventListener("click",()=>{this._scrollToBottom()}),this.querySelector(".chat-send-btn")?.addEventListener("click",()=>{let t=this.querySelector(".chat-input");t?.value.trim()&&(this._sendChatMessage(t.value.trim()),t.value="")}),this.querySelector(".chat-input")?.addEventListener("keydown",t=>{let s=t;if(s.key==="Enter"&&!s.shiftKey){t.preventDefault();let o=t.target;o?.value.trim()&&(this._sendChatMessage(o.value.trim()),o.value="")}}),this.querySelector(".agent-selector")?.addEventListener("change",t=>{let s=t.target;this._selectedAgent=s.value||null}),this.querySelectorAll(".inline-perm-btn").forEach(t=>{t.addEventListener("click",()=>{let s=t.dataset.response;s&&this._respondToInlinePermission(s)})}),this.querySelectorAll(".speak-btn").forEach(t=>{t.addEventListener("click",s=>{s.stopPropagation();let o=t.dataset.messageId;if(!o)return;if(this._speakingMessageId===o){this._stopSpeaking(),this._render();return}let r=this._historyData?.messages.find(n=>n.id===o);if(r){let n=this._extractTextFromMessage(r);n&&this._speakMessage(o,n)}})}),this.querySelectorAll(".copy-btn").forEach(t=>{t.addEventListener("click",s=>{s.stopPropagation();let o=t.dataset.messageId;if(!o)return;let r=this._historyData?.messages.find(n=>n.id===o);if(r){let n=this._getRawMarkdownFromMessage(r);this._copyToClipboard(n,t)}})});let i=this.querySelector(".history-body");i&&i.addEventListener("mouseup",()=>{setTimeout(()=>this._handleTextSelection(),10)})}async _respondToInlinePermission(e){if(!this._hass||!this._historyDeviceId)return;let i=this._pendingPermissions.get(this._historyDeviceId);if(!i?.permission_id){console.error("[opencode-card] Cannot respond: missing permission details");return}try{await this._hass.callService("opencode","respond_permission",{session_id:i.session_id,permission_id:i.permission_id,response:e}),this._pendingPermissions.delete(this._historyDeviceId),setTimeout(()=>this._refreshHistory(),500)}catch(t){console.error("[opencode-card] Failed to respond to permission:",t)}}_speakMessage(e,i){if(this._speakingMessageId&&this._stopSpeaking(),!("speechSynthesis"in window)){console.warn("[opencode-card] Speech synthesis not supported in this browser");return}let t=new SpeechSynthesisUtterance(i);t.onstart=()=>{this._speakingMessageId=e,this._render()},t.onend=()=>{this._speakingMessageId=null,this._render()},t.onerror=()=>{this._speakingMessageId=null,this._render()},window.speechSynthesis.speak(t)}_stopSpeaking(){"speechSynthesis"in window&&window.speechSynthesis.cancel(),this._speakingMessageId=null}_extractTextFromMessage(e){return e.parts.filter(i=>i.type==="text"&&i.content).map(i=>i.content).join(`
`)}async _copyToClipboard(e,i){try{if(await navigator.clipboard.writeText(e),i){let t=i.querySelector("ha-icon"),s=t?.getAttribute("icon");t&&s&&(t.setAttribute("icon","mdi:check"),i.classList.add("copied"),setTimeout(()=>{t.setAttribute("icon",s),i.classList.remove("copied")},1500))}return!0}catch(t){return console.error("[opencode-card] Failed to copy to clipboard:",t),!1}}_getRawMarkdownFromMessage(e){return e.parts.map(i=>{if(i.type==="text"&&i.content)return i.content;if(i.type==="tool_call"){let t=`**Tool: ${i.tool_name||"unknown"}**
`;return i.tool_args&&(t+="```json\n"+JSON.stringify(i.tool_args,null,2)+"\n```\n"),i.tool_output&&(t+="**Output:**\n```\n"+i.tool_output+"\n```\n"),i.tool_error&&(t+="**Error:**\n```\n"+i.tool_error+"\n```\n"),t}else if(i.type==="image")return`[Image: ${i.content||"embedded"}]`;return""}).filter(Boolean).join(`

`)}_handleTextSelection(){let e=window.getSelection();if(!e||e.isCollapsed)return;let i=e.toString().trim();if(!i)return;let t=this.querySelector(".history-body");if(!t)return;let s=e.anchorNode,o=e.focusNode;!s||!o||!t.contains(s)||!t.contains(o)||this._copyToClipboard(i)}_loadMoreHistory(){if(!this._historyData||this._historyLoadingMore)return;let e=this._historyData.messages.length;Math.max(0,e-this._historyVisibleCount)<=0||(this._historyLoadingMore=!0,this._render(),setTimeout(()=>{this._historyVisibleCount+=_.HISTORY_PAGE_SIZE,this._historyLoadingMore=!1;let s=this.querySelector(".history-body")?.scrollHeight||0;this._render();let o=this.querySelector(".history-body");if(o&&s>0){let n=o.scrollHeight-s;o.scrollTop=n}},100))}_renderPermissionModal(e){let i=!!e.permission_id,t=i?"":"disabled";return`
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
              <div class="permission-main-title">${e.title}</div>
              <div class="permission-type-badge">${e.type}</div>
            </div>
            ${i?"":`
              <div class="permission-section">
                <div class="permission-loading">
                  <ha-icon icon="mdi:loading" class="spinning"></ha-icon>
                  <span>Loading permission details...</span>
                </div>
              </div>
            `}
            ${e.pattern?`
              <div class="permission-section">
                <div class="section-label">Pattern</div>
                <code class="pattern-code">${e.pattern}</code>
              </div>
            `:""}
            ${e.metadata&&Object.keys(e.metadata).length>0?`
              <div class="permission-section">
                <div class="section-label">Details</div>
                <div class="metadata-list">
                  ${Object.entries(e.metadata).map(([s,o])=>`
                    <div class="metadata-item">
                      <span class="metadata-key">${s}:</span>
                      <span class="metadata-value">${typeof o=="object"?JSON.stringify(o):String(o)}</span>
                    </div>
                  `).join("")}
                </div>
              </div>
            `:""}
          </div>
          <div class="modal-actions">
            <button class="btn btn-reject" ${t}>
              <ha-icon icon="mdi:close-circle"></ha-icon>
              Reject
            </button>
            <button class="btn btn-allow-once" ${t}>
              <ha-icon icon="mdi:check"></ha-icon>
              Allow Once
            </button>
            <button class="btn btn-allow-always" ${t}>
              <ha-icon icon="mdi:check-all"></ha-icon>
              Always Allow
            </button>
          </div>
        </div>
      </div>
    `}_renderHistoryView(){let e=this._historyData?.fetched_at?new Date(this._historyData.fetched_at).toLocaleString():"",o=((this._historyDeviceId?this._devices.get(this._historyDeviceId):null)?.entities.get("state")?.state??"unknown")==="working",r=this._autoRefreshEnabled?"mdi:sync":"mdi:sync-off",n=this._autoRefreshEnabled?"Auto-refresh ON (click to disable)":"Auto-refresh OFF (click to enable)";return`
      <div class="modal-backdrop history-modal-backdrop">
        <div class="modal history-modal chat-modal">
          <div class="modal-header history-header">
            <ha-icon icon="mdi:chat"></ha-icon>
            <span class="modal-title">${this._historyData?.session_title||"Chat"}</span>
            <div class="history-header-actions">
              ${o?'<span class="working-indicator"><ha-icon icon="mdi:loading" class="spinning"></ha-icon></span>':""}
              <button class="auto-refresh-toggle ${this._autoRefreshEnabled?"enabled":""}" title="${n}">
                <ha-icon icon="${r}"></ha-icon>
              </button>
              <button class="history-refresh-btn" title="Refresh history" ${this._historyLoading?"disabled":""}>
                <ha-icon icon="mdi:refresh" class="${this._historyLoading?"spinning":""}"></ha-icon>
              </button>
              <button class="modal-close history-close" title="Close">
                <ha-icon icon="mdi:close"></ha-icon>
              </button>
            </div>
          </div>
          <div class="history-body-container">
            <div class="modal-body history-body">
              ${this._historyLoading&&!this._historyData?this._renderHistoryLoading():""}
              ${this._historyData?this._renderHistoryMessages():""}
            </div>
            <button class="scroll-to-bottom-btn ${this._isAtBottom?"hidden":""}" title="Scroll to latest">
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
    `}_renderAgentSelector(){if(this._agentsLoading)return`
        <div class="agent-selector loading">
          <ha-icon icon="mdi:loading" class="spinning"></ha-icon>
        </div>
      `;if(this._availableAgents.length===0)return"";let e=this._availableAgents.filter(t=>t.mode==="primary"||t.mode==="all");if(e.length===0)return"";let i=e.map(t=>{let s=this._selectedAgent===t.name?"selected":"",o=t.description?` - ${t.description}`:"";return`<option value="${t.name}" ${s}>${t.name}${o}</option>`}).join("");return`
      <select class="agent-selector" title="Select agent">
        <option value="" ${this._selectedAgent?"":"selected"}>Default Agent</option>
        ${i}
      </select>
    `}_renderHistoryLoading(){return`
      <div class="history-loading">
        <ha-icon icon="mdi:loading" class="spinning"></ha-icon>
        <span>Loading history...</span>
      </div>
    `}_renderHistoryMessages(){if(!this._historyData||this._historyData.messages.length===0)return`
        <div class="history-empty">
          <ha-icon icon="mdi:message-off"></ha-icon>
          <span>No messages in this session</span>
        </div>
      `;let e=this._historyData.messages.length,i=Math.max(0,e-this._historyVisibleCount),t=this._historyData.messages.slice(i),s=i>0,o="";if(s){let r=i;o+=`
        <div class="history-load-more" data-action="load-more">
          <ha-icon icon="${this._historyLoadingMore?"mdi:loading":"mdi:chevron-up"}" class="${this._historyLoadingMore?"spinning":""}"></ha-icon>
          <span>${this._historyLoadingMore?"Loading...":`Load ${Math.min(r,_.HISTORY_PAGE_SIZE)} more (${r} remaining)`}</span>
        </div>
      `}return o+=t.map(r=>this._renderHistoryMessage(r)).join(""),o+=this._renderInlinePermission(),o}_renderInlinePermission(){if(!this._historyDeviceId)return"";let e=this._devices.get(this._historyDeviceId);if(!e||(e.entities.get("state")?.state??"unknown")!=="waiting_permission")return"";let s=this._pendingPermissions.get(this._historyDeviceId),o=s?.permission_id;return`
      <div class="inline-permission">
        <div class="inline-permission-header">
          <ha-icon icon="mdi:shield-alert"></ha-icon>
          <span class="inline-permission-title">${s?.title||"Permission Required"}</span>
        </div>
        <div class="inline-permission-body">
          ${s?.type?`<div class="inline-permission-type">${s.type}</div>`:""}
          ${s?.pattern?`
            <div class="inline-permission-section">
              <div class="inline-permission-label">Pattern</div>
              <code class="inline-permission-code">${s.pattern}</code>
            </div>
          `:""}
          ${s?.metadata&&Object.keys(s.metadata).length>0?`
            <div class="inline-permission-section">
              <div class="inline-permission-label">Details</div>
              <div class="inline-permission-metadata">
                ${Object.entries(s.metadata).map(([r,n])=>`
                  <div class="inline-metadata-item">
                    <span class="inline-metadata-key">${r}:</span>
                    <span class="inline-metadata-value">${typeof n=="object"?JSON.stringify(n):String(n)}</span>
                  </div>
                `).join("")}
              </div>
            </div>
          `:""}
          ${o?"":`
            <div class="inline-permission-loading">
              <ha-icon icon="mdi:loading" class="spinning"></ha-icon>
              <span>Loading details...</span>
            </div>
          `}
        </div>
        <div class="inline-permission-actions">
          <button class="inline-perm-btn reject" data-response="reject" ${o?"":"disabled"}>
            <ha-icon icon="mdi:close-circle"></ha-icon>
            Reject
          </button>
          <button class="inline-perm-btn allow-once" data-response="once" ${o?"":"disabled"}>
            <ha-icon icon="mdi:check"></ha-icon>
            Allow Once
          </button>
          <button class="inline-perm-btn allow-always" data-response="always" ${o?"":"disabled"}>
            <ha-icon icon="mdi:check-all"></ha-icon>
            Always
          </button>
        </div>
      </div>
    `}_renderHistoryMessage(e){let i=e.role==="user",t=L(e.timestamp),s=e.parts.map(a=>{if(a.type==="text"&&a.content)return`<div class="history-text">${this._escapeHtml(a.content)}</div>`;if(a.type==="tool_call"){let l=a.tool_output||a.tool_error;return`
          <div class="history-tool">
            <div class="tool-header">
              <ha-icon icon="mdi:tools"></ha-icon>
              <span class="tool-name">${a.tool_name||"unknown"}</span>
            </div>
            ${a.tool_args?`<pre class="tool-args">${this._escapeHtml(JSON.stringify(a.tool_args,null,2))}</pre>`:""}
            ${l?`
              <div class="tool-result ${a.tool_error?"error":""}">
                <span class="tool-result-label">${a.tool_error?"Error:":"Output:"}</span>
                <pre class="tool-output">${this._escapeHtml(a.tool_error||a.tool_output||"")}</pre>
              </div>
            `:""}
          </div>
        `}else if(a.type==="image")return`<div class="history-image"><ha-icon icon="mdi:image"></ha-icon> ${a.content||"Image"}</div>`;return""}).join(""),o="";if(!i&&(e.model||e.tokens_input||e.cost)){let a=[];e.model&&a.push(e.model),(e.tokens_input||e.tokens_output)&&a.push(`${e.tokens_input||0}/${e.tokens_output||0} tokens`),e.cost&&a.push(`$${e.cost.toFixed(4)}`),o=`<div class="message-meta">${a.join(" \xB7 ")}</div>`}let r=e.parts.some(a=>a.type==="text"&&a.content),n=this._speakingMessageId===e.id,d=!i&&r?`
      <button class="speak-btn ${n?"speaking":""}" data-message-id="${e.id}" title="${n?"Stop speaking":"Read aloud"}">
        <ha-icon icon="${n?"mdi:stop":"mdi:volume-high"}"></ha-icon>
      </button>
    `:"",c=`
      <button class="copy-btn" data-message-id="${e.id}" title="Copy as Markdown">
        <ha-icon icon="mdi:content-copy"></ha-icon>
      </button>
    `;return`
      <div class="history-message ${i?"user":"assistant"}" data-message-id="${e.id}">
        <div class="message-header">
          <ha-icon icon="${i?"mdi:account":"mdi:robot"}"></ha-icon>
          <span class="message-role">${i?"You":"Assistant"}</span>
          <span class="message-time" title="${t.tooltip}">${t.display}</span>
          <div class="message-actions">
            ${c}
            ${d}
          </div>
        </div>
        <div class="message-content">
          ${s}
        </div>
        ${o}
      </div>
    `}_escapeHtml(e){let i=document.createElement("div");return i.textContent=e,i.innerHTML}_renderEmpty(){return`
      <div class="empty-state">
        <ha-icon icon="mdi:code-braces-box"></ha-icon>
        <p>No OpenCode sessions found</p>
      </div>
    `}_renderDevices(){let e=Array.from(this._devices.values());return this._sortMode==="activity"?e.sort((i,t)=>{let s=i.entities.get("last_activity")?.state??"",o=t.entities.get("last_activity")?.state??"";return!s&&!o?0:s?o?new Date(o).getTime()-new Date(s).getTime():-1:1}):e.sort((i,t)=>{let s=i.deviceName.replace("OpenCode - ","").toLowerCase(),o=t.deviceName.replace("OpenCode - ","").toLowerCase();return s.localeCompare(o)}),e.map(i=>this._renderDevice(i)).join("")}_renderDetailView(e,i){let t=e.entities.get("state"),s=e.entities.get("session_title"),o=e.entities.get("model"),r=e.entities.get("current_tool"),n=e.entities.get("cost"),d=e.entities.get("tokens_input"),c=e.entities.get("tokens_output"),a=e.entities.get("last_activity"),l=t?.state??"unknown",p=$[l]||$.unknown,f=s?.state??"Unknown Session",m=o?.state??"unknown",b=r?.state??"none",I=n?.state??"0",E=d?.state??"0",x=c?.state??"0",u=a?.state??"",v=t?.attributes?.agent||null,h=t?.attributes?.current_agent||null,y=t?.attributes?.hostname||null,k="";u&&(k=new Date(u).toLocaleTimeString());let w=this._getPermissionDetails(e),D="";if(w){let M=!!w.permission_id;D=`
        <div class="permission-alert pinned clickable" data-device-id="${e.deviceId}">
          <ha-icon icon="mdi:shield-alert"></ha-icon>
          <div class="permission-details">
            <div class="permission-title">${w.title}</div>
            <div class="permission-type">${w.type}${M?"":" (loading...)"}</div>
          </div>
          <ha-icon icon="mdi:chevron-right" class="permission-chevron"></ha-icon>
        </div>
      `}else l==="waiting_permission"&&(D=`
        <div class="permission-alert pinned clickable" data-device-id="${e.deviceId}">
          <ha-icon icon="mdi:shield-alert"></ha-icon>
          <div class="permission-details">
            <div class="permission-title">Permission Required</div>
            <div class="permission-type">Tap to view details</div>
          </div>
          <ha-icon icon="mdi:chevron-right" class="permission-chevron"></ha-icon>
        </div>
      `);return`
      <div class="detail-view">
        ${i?`
      <button class="back-button" data-action="back">
        <ha-icon icon="mdi:arrow-left"></ha-icon>
        <span>Back</span>
      </button>
    `:""}
        <div class="detail-header">
          <div class="detail-status ${l==="working"?"pulse":""}" style="background: ${p.color}20; border-color: ${p.color}">
            <ha-icon icon="${p.icon}" style="color: ${p.color}"></ha-icon>
            <span class="status-text" style="color: ${p.color}">${p.label}</span>
          </div>
          <div class="detail-project-info">
            <div class="detail-project">${e.deviceName.replace("OpenCode - ","")}</div>
            ${y?`<div class="detail-hostname"><ha-icon icon="mdi:server"></ha-icon> ${y}</div>`:""}
          </div>
        </div>

        <div class="detail-session">
          <ha-icon icon="mdi:message-text"></ha-icon>
          <span class="session-title">${f}</span>
        </div>

        ${D}

        <div class="detail-info">
          <div class="detail-row">
            <ha-icon icon="mdi:brain"></ha-icon>
            <span class="detail-label">Model</span>
            <span class="detail-value mono">${m}</span>
          </div>
          ${v?`
          <div class="detail-row">
            <ha-icon icon="mdi:account-cog"></ha-icon>
            <span class="detail-label">Agent</span>
            <span class="detail-value agent-badge">${v}${h&&h!==v?` <span class="sub-agent-indicator"><ha-icon icon="mdi:arrow-right"></ha-icon> ${h}</span>`:""}</span>
          </div>
          `:""}
          ${b!=="none"?`
          <div class="detail-row highlight">
            <ha-icon icon="mdi:tools"></ha-icon>
            <span class="detail-label">Tool</span>
            <span class="detail-value mono tool-active">${b}</span>
          </div>
          `:""}
          <div class="detail-row">
            <ha-icon icon="mdi:clock-outline"></ha-icon>
            <span class="detail-label">Last Activity</span>
            <span class="detail-value">${k||"\u2014"}</span>
          </div>
        </div>

        <div class="detail-stats">
          <div class="stat">
            <ha-icon icon="mdi:currency-usd"></ha-icon>
            <span class="stat-value">$${parseFloat(I).toFixed(4)}</span>
            <span class="stat-label">Cost</span>
          </div>
          <div class="stat">
            <ha-icon icon="mdi:arrow-right-bold"></ha-icon>
            <span class="stat-value">${Number(E).toLocaleString()}</span>
            <span class="stat-label">In</span>
          </div>
          <div class="stat">
            <ha-icon icon="mdi:arrow-left-bold"></ha-icon>
            <span class="stat-value">${Number(x).toLocaleString()}</span>
            <span class="stat-label">Out</span>
          </div>
        </div>

        <div class="detail-actions">
          <button class="open-chat-btn" data-device-id="${e.deviceId}" data-session-id="${e.sessionId}">
            <ha-icon icon="mdi:chat"></ha-icon>
            <span>Chat</span>
          </button>
        </div>

        <div class="detail-footer">
          <code class="session-id">${e.sessionId}</code>
        </div>
      </div>
    `}_renderDevice(e){let i=e.entities.get("state"),t=e.entities.get("session_title"),s=e.entities.get("model"),o=e.entities.get("current_tool"),r=e.entities.get("cost"),n=e.entities.get("tokens_input"),d=e.entities.get("tokens_output"),c=e.entities.get("last_activity"),a=i?.state??"unknown",l=$[a]||$.unknown,p=t?.state??"Unknown Session",f=s?.state??"unknown",m=o?.state??"none",b=r?.state??"0",I=n?.state??"0",E=d?.state??"0",x=c?.state??"",u=x?L(x):null,v=i?.attributes?.current_agent||null,h=this._getPermissionDetails(e),y="";if(h){let k=!!h.permission_id;y=`
        <div class="permission-alert clickable" data-device-id="${e.deviceId}">
          <ha-icon icon="mdi:shield-alert"></ha-icon>
          <div class="permission-details">
            <div class="permission-title">${h.title}</div>
            <div class="permission-type">${h.type}${k?"":" (loading...)"}</div>
          </div>
          <ha-icon icon="mdi:chevron-right" class="permission-chevron"></ha-icon>
        </div>
      `}else a==="waiting_permission"&&(y=`
        <div class="permission-alert clickable" data-device-id="${e.deviceId}">
          <ha-icon icon="mdi:shield-alert"></ha-icon>
          <div class="permission-details">
            <div class="permission-title">Permission Required</div>
            <div class="permission-type">Tap to view details</div>
          </div>
          <ha-icon icon="mdi:chevron-right" class="permission-chevron"></ha-icon>
        </div>
      `);return`
      <div class="device-card clickable" data-device-id="${e.deviceId}">
        <div class="device-header">
          <div class="device-status ${a==="working"?"pulse":""}">
            <ha-icon icon="${l.icon}" style="color: ${l.color}"></ha-icon>
            <span class="status-label" style="color: ${l.color}">${l.label}</span>
          </div>
          <div class="device-name-container">
            <div class="device-name">${e.deviceName.replace("OpenCode - ","")}</div>
            ${u?`<div class="device-activity" title="${u.tooltip}">${u.display}</div>`:""}
          </div>
          <ha-icon icon="mdi:chevron-right" class="device-chevron"></ha-icon>
        </div>
        
        <div class="device-info">
          <div class="info-row">
            <ha-icon icon="mdi:message-text"></ha-icon>
            <span class="info-label">Session:</span>
            <span class="info-value">${p}</span>
          </div>
          <div class="info-row">
            <ha-icon icon="mdi:brain"></ha-icon>
            <span class="info-label">Model:</span>
            <span class="info-value model">${f}</span>
          </div>
          ${m!=="none"?`
          <div class="info-row">
            <ha-icon icon="mdi:tools"></ha-icon>
            <span class="info-label">Tool:</span>
            <span class="info-value tool">${m}</span>
          </div>
          `:""}
          ${v?`
          <div class="info-row">
            <ha-icon icon="mdi:account-switch"></ha-icon>
            <span class="info-label">Sub-agent:</span>
            <span class="info-value sub-agent">${v}</span>
          </div>
          `:""}
          <div class="info-row stats">
            <ha-icon icon="mdi:currency-usd"></ha-icon>
            <span class="stat-value">$${parseFloat(b).toFixed(4)}</span>
            <ha-icon icon="mdi:arrow-right-bold"></ha-icon>
            <span class="stat-value">${I}</span>
            <ha-icon icon="mdi:arrow-left-bold"></ha-icon>
            <span class="stat-value">${E}</span>
          </div>
        </div>

        ${y}
      </div>
    `}_getStyles(){return`
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
    `}static getConfigElement(){return document.createElement("opencode-card-editor")}static getStubConfig(){return{title:"OpenCode Sessions"}}};_.HISTORY_PAGE_SIZE=10;var H=_;customElements.define("opencode-card",H);window.customCards=window.customCards||[];window.customCards.push({type:"opencode-card",name:"OpenCode Card",description:"Display and interact with OpenCode AI coding assistant sessions"});
