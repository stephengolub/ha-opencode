var z=Object.defineProperty;var C=(g,c,e)=>c in g?z(g,c,{enumerable:!0,configurable:!0,writable:!0,value:e}):g[c]=e;var a=(g,c,e)=>(C(g,typeof c!="symbol"?c+"":c,e),e);function R(g){return`opencode_history_${g}`}function M(g){let c=new Date(g);if(isNaN(c.getTime()))return{display:"Unknown",tooltip:"Invalid timestamp"};let e=new Date,t=e.getTime()-c.getTime(),i=Math.floor(t/6e4),s=Math.floor(t/36e5),o=c.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),n=c.toLocaleDateString([],{month:"short",day:"numeric"}),r=c.toLocaleString(),l=c.toDateString()===e.toDateString();if(s>=2)return l?{display:o,tooltip:r}:{display:`${n} ${o}`,tooltip:r};if(i<1)return{display:"Just now",tooltip:r};if(i<60)return{display:`${i}m ago`,tooltip:r};{let p=Math.floor(i/60),d=i%60;return d===0?{display:`${p}h ago`,tooltip:r}:{display:`${p}h ${d}m ago`,tooltip:r}}}var I={idle:{icon:"mdi:sleep",color:"#4caf50",label:"Idle"},working:{icon:"mdi:cog",color:"#2196f3",label:"Working"},waiting_permission:{icon:"mdi:shield-alert",color:"#ff9800",label:"Needs Permission"},error:{icon:"mdi:alert-circle",color:"#f44336",label:"Error"},unknown:{icon:"mdi:help-circle",color:"#9e9e9e",label:"Unknown"}},x=class x extends HTMLElement{constructor(){super(...arguments);a(this,"_hass");a(this,"_config");a(this,"_devices",new Map);a(this,"_deviceRegistry",new Map);a(this,"_entityRegistry",new Map);a(this,"_initialized",!1);a(this,"_showPermissionModal",!1);a(this,"_activePermission",null);a(this,"_selectedDeviceId",null);a(this,"_showHistoryView",!1);a(this,"_historyLoading",!1);a(this,"_historyData",null);a(this,"_historySessionId",null);a(this,"_historyDeviceId",null);a(this,"_historyVisibleCount",10);a(this,"_historyLoadingMore",!1);a(this,"_isAtBottom",!0);a(this,"_pendingPermissions",new Map);a(this,"_lastRenderHash","");a(this,"_availableAgents",[]);a(this,"_selectedAgent",null);a(this,"_agentsLoading",!1);a(this,"_autoRefreshInterval",null);a(this,"_lastDeviceState",null);a(this,"_sortMode","activity");a(this,"_stateChangeUnsubscribe",null);a(this,"_historyResponseUnsubscribe",null);a(this,"_agentsResponseUnsubscribe",null)}set hass(e){if(this._hass=e,!this._initialized)this._initialize();else{if(this._updateDevices(),this._showHistoryView&&this._historyDeviceId){let o=this._devices.get(this._historyDeviceId)?.entities.get("state")?.state??"unknown";this._lastDeviceState!==null&&this._lastDeviceState!==o&&this._refreshHistory(),this._lastDeviceState=o,this._manageAutoRefresh(o);return}if(this._showPermissionModal&&this._activePermission){let i=this._findDeviceIdForPermission(this._activePermission);if(i){let s=this._pendingPermissions.get(i);if(s&&s.permission_id&&!this._activePermission.permission_id){this._activePermission=s,this._render();return}}return}let t=this._computeStateHash();t!==this._lastRenderHash&&(this._lastRenderHash=t,this._render())}}_manageAutoRefresh(e){let t=(this._config?.working_refresh_interval??10)*1e3;e==="working"?this._autoRefreshInterval||(this._autoRefreshInterval=setInterval(()=>{this._showHistoryView&&!this._historyLoading&&this._refreshHistory()},t)):this._autoRefreshInterval&&(clearInterval(this._autoRefreshInterval),this._autoRefreshInterval=null)}_computeStateHash(){let e=[];for(let[t,i]of this._devices){let s=i.entities.get("state"),o=i.entities.get("session_title"),n=i.entities.get("model"),r=i.entities.get("current_tool"),l=i.entities.get("cost"),p=i.entities.get("tokens_input"),d=i.entities.get("tokens_output"),h=i.entities.get("permission_pending"),m=i.entities.get("last_activity"),b=s?.attributes?.agent,u=s?.attributes?.current_agent;e.push(`${t}:${s?.state}:${o?.state}:${n?.state}:${r?.state}:${l?.state}:${p?.state}:${d?.state}:${h?.state}:${m?.state}:${b}:${u}`),h?.state==="on"&&e.push(`perm:${h.attributes?.permission_id}`)}for(let[t,i]of this._pendingPermissions)e.push(`pending:${t}:${i.permission_id}`);return e.join("|")}_findDeviceIdForPermission(e){for(let[t,i]of this._devices)if(i.sessionId===e.session_id)return t;return null}setConfig(e){this._config=e}async _initialize(){this._hass&&(this._initialized=!0,await this._fetchRegistries(),this._updateDevices(),await this._setupEventSubscriptions(),this._render())}async _setupEventSubscriptions(){this._hass&&(this._stateChangeUnsubscribe=await this._hass.connection.subscribeEvents(e=>{let t=e.data;this._updateDevices();let i=this._computeStateHash();i!==this._lastRenderHash&&(this._lastRenderHash=i,this._render())},"opencode_state_change"),this._historyResponseUnsubscribe=await this._hass.connection.subscribeEvents(e=>{let t=e.data;this._historySessionId&&t.session_id===this._historySessionId&&this._handleHistoryResponse(t.history)},"opencode_history_response"),this._agentsResponseUnsubscribe=await this._hass.connection.subscribeEvents(e=>{let t=e.data;this._historySessionId&&t.session_id===this._historySessionId&&(this._availableAgents=t.agents,this._agentsLoading=!1,this._render())},"opencode_agents_response"))}disconnectedCallback(){this._stateChangeUnsubscribe&&(this._stateChangeUnsubscribe(),this._stateChangeUnsubscribe=null),this._historyResponseUnsubscribe&&(this._historyResponseUnsubscribe(),this._historyResponseUnsubscribe=null),this._agentsResponseUnsubscribe&&(this._agentsResponseUnsubscribe(),this._agentsResponseUnsubscribe=null),this._autoRefreshInterval&&(clearInterval(this._autoRefreshInterval),this._autoRefreshInterval=null)}async _fetchRegistries(){if(this._hass)try{let e=await this._hass.callWS({type:"config/device_registry/list"});for(let i of e)i.manufacturer==="OpenCode"&&this._deviceRegistry.set(i.id,i);let t=await this._hass.callWS({type:"config/entity_registry/list"});for(let i of t)i.platform==="opencode"&&this._deviceRegistry.has(i.device_id)&&this._entityRegistry.set(i.entity_id,i)}catch(e){console.error("[opencode-card] Failed to fetch registries:",e)}}_updateDevices(){if(this._hass){this._devices.clear();for(let[e,t]of this._entityRegistry){let i=this._deviceRegistry.get(t.device_id);if(!i)continue;let s=this._hass.states[e];if(!s)continue;let o=this._devices.get(i.id);if(!o){let p=i.identifiers?.[0]?.[1]?.replace("opencode_","ses_")||"";o={deviceId:i.id,deviceName:i.name,sessionId:p,entities:new Map},this._devices.set(i.id,o)}let n=t.unique_id||"",r=i.identifiers?.[0]?.[1]||"",l="";if(r&&n.startsWith(r+"_"))l=n.slice(r.length+1);else{let p=["state","session_title","model","current_tool","tokens_input","tokens_output","cost","last_activity","permission_pending"];for(let d of p)if(n.endsWith("_"+d)){l=d;break}}l&&o.entities.set(l,s)}this._updatePendingPermissions()}}_updatePendingPermissions(){for(let[e,t]of this._devices){let i=t.entities.get("permission_pending"),s=t.entities.get("state");if(i?.state==="on"&&i.attributes){let o=i.attributes;o.permission_id&&o.permission_title&&this._pendingPermissions.set(e,{permission_id:o.permission_id,type:o.permission_type||"unknown",title:o.permission_title,session_id:t.sessionId,pattern:o.pattern,metadata:o.metadata})}else s?.state!=="waiting_permission"||i?.state==="off"?this._pendingPermissions.delete(e):s?.state==="waiting_permission"&&!this._pendingPermissions.has(e)&&this._pendingPermissions.set(e,{permission_id:"",type:"pending",title:"Permission Required",session_id:t.sessionId})}}_getPinnedDevice(){return this._config?.device&&this._devices.get(this._config.device)||null}_getPermissionDetails(e){let t=this._pendingPermissions.get(e.deviceId);if(t&&t.permission_id)return t;let i=e.entities.get("permission_pending");if(i?.state!=="on"||!i.attributes)return t||null;let s=i.attributes;return{permission_id:s.permission_id,type:s.permission_type,title:s.permission_title,session_id:e.sessionId,pattern:s.pattern,metadata:s.metadata}}_showPermission(e){this._activePermission=e,this._showPermissionModal=!0,this._render()}_hidePermissionModal(){this._showPermissionModal=!1,this._activePermission=null,this._render()}_selectDevice(e){this._selectedDeviceId=e,this._render()}_goBack(){this._selectedDeviceId=null,this._render()}_isPinned(){return!!this._config?.device}async _sendChatMessage(e){if(!(!this._hass||!this._historySessionId||!e.trim()))try{if(this._historyData){let i={id:`temp_${Date.now()}`,role:"user",timestamp:new Date().toISOString(),parts:[{type:"text",content:e.trim()}]};this._historyData.messages.push(i),this._render(),setTimeout(()=>{let s=this.querySelector(".history-body");s&&(s.scrollTop=s.scrollHeight)},0)}let t={session_id:this._historySessionId,text:e.trim()};this._selectedAgent&&(t.agent=this._selectedAgent),await this._hass.callService("opencode","send_prompt",t)}catch(t){console.error("[opencode-card] Failed to send chat message:",t)}}async _showHistory(e,t){this._historyDeviceId=e,this._historySessionId=t,this._showHistoryView=!0,this._historyLoading=!0,this._selectedAgent=null;let s=this._devices.get(e)?.entities.get("state");this._lastDeviceState=s?.state??"unknown",this._manageAutoRefresh(this._lastDeviceState),this._render(),this._fetchAgents();let o=this._loadHistoryFromCache(t);o?(this._historyData=o.data,this._historyLoading=!1,this._render(),await this._fetchHistorySince(o.lastFetched)):await this._fetchFullHistory()}async _fetchAgents(){if(!(!this._hass||!this._historySessionId)){this._agentsLoading=!0;try{await this._hass.callService("opencode","get_agents",{session_id:this._historySessionId,request_id:`agents_${Date.now()}`}),setTimeout(()=>{this._agentsLoading&&(this._agentsLoading=!1,this._render())},1e4)}catch(e){console.error("[opencode-card] Failed to fetch agents:",e),this._agentsLoading=!1}}}_hideHistoryView(){this._showHistoryView=!1,this._historyLoading=!1,this._historyData=null,this._historyDeviceId=null,this._historySessionId=null,this._historyVisibleCount=10,this._isAtBottom=!0,this._availableAgents=[],this._selectedAgent=null,this._agentsLoading=!1,this._lastDeviceState=null,this._autoRefreshInterval&&(clearInterval(this._autoRefreshInterval),this._autoRefreshInterval=null),this._render()}_scrollToBottom(){let e=this.querySelector(".history-body");if(e){e.scrollTop=e.scrollHeight,this._isAtBottom=!0;let t=this.querySelector(".scroll-to-bottom-btn");t&&t.classList.add("hidden")}}_loadHistoryFromCache(e){try{let t=localStorage.getItem(R(e));if(t)return JSON.parse(t)}catch(t){console.error("[opencode-card] Failed to load history from cache:",t)}return null}_saveHistoryToCache(e,t){try{let i={data:t,lastFetched:t.fetched_at};localStorage.setItem(R(e),JSON.stringify(i))}catch(i){console.error("[opencode-card] Failed to save history to cache:",i)}}async _fetchFullHistory(){if(!(!this._hass||!this._historySessionId))try{await this._hass.callService("opencode","get_history",{session_id:this._historySessionId,request_id:`req_${Date.now()}`})}catch(e){console.error("[opencode-card] Failed to request history:",e),this._historyLoading=!1,this._render()}}async _fetchHistorySince(e){if(!(!this._hass||!this._historySessionId))try{await this._hass.callService("opencode","get_history",{session_id:this._historySessionId,since:e,request_id:`req_${Date.now()}`})}catch(t){console.error("[opencode-card] Failed to request history update:",t)}}_handleHistoryResponse(e){if(!this._historySessionId)return;let t=e.since&&e.messages.length>0,i=!this._historyData;if(e.since&&this._historyData){let s=new Set(this._historyData.messages.map(n=>n.id)),o=e.messages.filter(n=>!s.has(n.id));this._historyData.messages.push(...o),this._historyData.fetched_at=e.fetched_at}else this._historyData=e;this._saveHistoryToCache(this._historySessionId,this._historyData),this._historyLoading=!1,this._render(),(i||t&&this._isAtBottom)&&setTimeout(()=>this._scrollToBottom(),0)}_refreshHistory(){!this._historySessionId||!this._historyData||(this._historyLoading=!0,this._render(),this._fetchHistorySince(this._historyData.fetched_at))}async _respondToPermission(e){if(!this._hass||!this._activePermission)return;let{permission_id:t,session_id:i}=this._activePermission;if(!t){console.error("[opencode-card] Cannot respond: missing permission_id");return}try{await this._hass.callService("opencode","respond_permission",{session_id:i,permission_id:t,response:e}),this._hidePermissionModal()}catch(s){console.error("[opencode-card] Failed to send permission response:",s)}}_render(){let e=this._config?.title??"OpenCode Sessions",t=this._getPinnedDevice(),i=this._selectedDeviceId?this._devices.get(this._selectedDeviceId):null,s="";if(t)s=`
        <ha-card>
          <div class="card-content pinned">
            ${this._renderDetailView(t,!1)}
          </div>
        </ha-card>
      `;else if(i)s=`
        <ha-card>
          <div class="card-content pinned">
            ${this._renderDetailView(i,!0)}
          </div>
        </ha-card>
      `;else{let o=this._sortMode==="activity"?"mdi:sort-clock-descending":"mdi:sort-alphabetical-ascending",n=this._sortMode==="activity"?"Sorted by latest activity":"Sorted by name";s=`
        <ha-card>
          <div class="card-header">
            <div class="name">${e}</div>
            ${this._devices.size>1?`
              <button class="sort-toggle" title="${n}">
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
    `,this._attachEventListeners()}_attachEventListeners(){!this._isPinned()&&!this._selectedDeviceId&&this.querySelectorAll(".device-card[data-device-id]").forEach(t=>{t.addEventListener("click",i=>{if(i.target.closest(".permission-alert"))return;let s=t.dataset.deviceId;s&&this._selectDevice(s)})}),this.querySelector(".back-button")?.addEventListener("click",()=>{this._goBack()}),this.querySelector(".sort-toggle")?.addEventListener("click",()=>{this._sortMode=this._sortMode==="activity"?"name":"activity",this._render()}),this.querySelectorAll(".permission-alert[data-device-id]").forEach(t=>{t.addEventListener("click",i=>{i.stopPropagation();let s=t.dataset.deviceId;if(s){let o=this._devices.get(s);if(o){let n=this._getPermissionDetails(o);n?this._showPermission(n):this._showPermission({permission_id:"",type:"pending",title:"Permission Required",session_id:o.sessionId})}}})}),this.querySelector(".modal-backdrop:not(.history-modal-backdrop)")?.addEventListener("click",t=>{t.target.classList.contains("modal-backdrop")&&this._hidePermissionModal()}),this.querySelector(".modal-close:not(.history-close)")?.addEventListener("click",()=>{this._hidePermissionModal()}),this.querySelector(".btn-allow-once")?.addEventListener("click",()=>{this._respondToPermission("once")}),this.querySelector(".btn-allow-always")?.addEventListener("click",()=>{this._respondToPermission("always")}),this.querySelector(".btn-reject")?.addEventListener("click",()=>{this._respondToPermission("reject")}),this.querySelector(".open-chat-btn")?.addEventListener("click",()=>{let t=this.querySelector(".open-chat-btn"),i=t?.dataset.deviceId,s=t?.dataset.sessionId;i&&s&&this._showHistory(i,s)}),this.querySelector(".history-modal-backdrop")?.addEventListener("click",t=>{t.target.classList.contains("history-modal-backdrop")&&this._hideHistoryView()}),this.querySelector(".history-close")?.addEventListener("click",()=>{this._hideHistoryView()}),this.querySelector(".history-refresh-btn")?.addEventListener("click",()=>{this._refreshHistory()}),this.querySelector(".history-load-more")?.addEventListener("click",()=>{this._loadMoreHistory()});let e=this.querySelector(".history-body");e&&e.addEventListener("scroll",()=>{if(e.scrollTop<50&&!this._historyLoadingMore){let i=this._historyData?.messages.length||0;Math.max(0,i-this._historyVisibleCount)>0&&this._loadMoreHistory()}let t=e.scrollHeight-e.scrollTop-e.clientHeight<50;if(t!==this._isAtBottom){this._isAtBottom=t;let i=this.querySelector(".scroll-to-bottom-btn");i&&i.classList.toggle("hidden",t)}}),this.querySelector(".scroll-to-bottom-btn")?.addEventListener("click",()=>{this._scrollToBottom()}),this.querySelector(".chat-send-btn")?.addEventListener("click",()=>{let t=this.querySelector(".chat-input");t?.value.trim()&&(this._sendChatMessage(t.value.trim()),t.value="")}),this.querySelector(".chat-input")?.addEventListener("keydown",t=>{let i=t;if(i.key==="Enter"&&!i.shiftKey){t.preventDefault();let s=t.target;s?.value.trim()&&(this._sendChatMessage(s.value.trim()),s.value="")}}),this.querySelector(".agent-selector")?.addEventListener("change",t=>{let i=t.target;this._selectedAgent=i.value||null}),this.querySelectorAll(".inline-perm-btn").forEach(t=>{t.addEventListener("click",()=>{let i=t.dataset.response;i&&this._respondToInlinePermission(i)})})}async _respondToInlinePermission(e){if(!this._hass||!this._historyDeviceId)return;let t=this._pendingPermissions.get(this._historyDeviceId);if(!t?.permission_id){console.error("[opencode-card] Cannot respond: missing permission details");return}try{await this._hass.callService("opencode","respond_permission",{session_id:t.session_id,permission_id:t.permission_id,response:e}),this._pendingPermissions.delete(this._historyDeviceId),setTimeout(()=>this._refreshHistory(),500)}catch(i){console.error("[opencode-card] Failed to respond to permission:",i)}}_loadMoreHistory(){if(!this._historyData||this._historyLoadingMore)return;let e=this._historyData.messages.length;Math.max(0,e-this._historyVisibleCount)<=0||(this._historyLoadingMore=!0,this._render(),setTimeout(()=>{this._historyVisibleCount+=x.HISTORY_PAGE_SIZE,this._historyLoadingMore=!1;let s=this.querySelector(".history-body")?.scrollHeight||0;this._render();let o=this.querySelector(".history-body");if(o&&s>0){let r=o.scrollHeight-s;o.scrollTop=r}},100))}_renderPermissionModal(e){let t=!!e.permission_id,i=t?"":"disabled";return`
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
            ${t?"":`
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
            <button class="btn btn-reject" ${i}>
              <ha-icon icon="mdi:close-circle"></ha-icon>
              Reject
            </button>
            <button class="btn btn-allow-once" ${i}>
              <ha-icon icon="mdi:check"></ha-icon>
              Allow Once
            </button>
            <button class="btn btn-allow-always" ${i}>
              <ha-icon icon="mdi:check-all"></ha-icon>
              Always Allow
            </button>
          </div>
        </div>
      </div>
    `}_renderHistoryView(){let e=this._historyData?.fetched_at?new Date(this._historyData.fetched_at).toLocaleString():"",o=((this._historyDeviceId?this._devices.get(this._historyDeviceId):null)?.entities.get("state")?.state??"unknown")==="working";return`
      <div class="modal-backdrop history-modal-backdrop">
        <div class="modal history-modal chat-modal">
          <div class="modal-header history-header">
            <ha-icon icon="mdi:chat"></ha-icon>
            <span class="modal-title">${this._historyData?.session_title||"Chat"}</span>
            <div class="history-header-actions">
              ${o?'<span class="working-indicator"><ha-icon icon="mdi:loading" class="spinning"></ha-icon></span>':""}
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
      `;if(this._availableAgents.length===0)return"";let e=this._availableAgents.filter(i=>i.mode==="primary"||i.mode==="all");if(e.length===0)return"";let t=e.map(i=>{let s=this._selectedAgent===i.name?"selected":"",o=i.description?` - ${i.description}`:"";return`<option value="${i.name}" ${s}>${i.name}${o}</option>`}).join("");return`
      <select class="agent-selector" title="Select agent">
        <option value="" ${this._selectedAgent?"":"selected"}>Default Agent</option>
        ${t}
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
      `;let e=this._historyData.messages.length,t=Math.max(0,e-this._historyVisibleCount),i=this._historyData.messages.slice(t),s=t>0,o="";if(s){let n=t;o+=`
        <div class="history-load-more" data-action="load-more">
          <ha-icon icon="${this._historyLoadingMore?"mdi:loading":"mdi:chevron-up"}" class="${this._historyLoadingMore?"spinning":""}"></ha-icon>
          <span>${this._historyLoadingMore?"Loading...":`Load ${Math.min(n,x.HISTORY_PAGE_SIZE)} more (${n} remaining)`}</span>
        </div>
      `}return o+=i.map(n=>this._renderHistoryMessage(n)).join(""),o+=this._renderInlinePermission(),o}_renderInlinePermission(){if(!this._historyDeviceId)return"";let e=this._devices.get(this._historyDeviceId);if(!e||(e.entities.get("state")?.state??"unknown")!=="waiting_permission")return"";let s=this._pendingPermissions.get(this._historyDeviceId),o=s?.permission_id;return`
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
                ${Object.entries(s.metadata).map(([n,r])=>`
                  <div class="inline-metadata-item">
                    <span class="inline-metadata-key">${n}:</span>
                    <span class="inline-metadata-value">${typeof r=="object"?JSON.stringify(r):String(r)}</span>
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
    `}_renderHistoryMessage(e){let t=e.role==="user",i=M(e.timestamp),s=e.parts.map(n=>{if(n.type==="text"&&n.content)return`<div class="history-text">${this._escapeHtml(n.content)}</div>`;if(n.type==="tool_call"){let r=n.tool_output||n.tool_error;return`
          <div class="history-tool">
            <div class="tool-header">
              <ha-icon icon="mdi:tools"></ha-icon>
              <span class="tool-name">${n.tool_name||"unknown"}</span>
            </div>
            ${n.tool_args?`<pre class="tool-args">${this._escapeHtml(JSON.stringify(n.tool_args,null,2))}</pre>`:""}
            ${r?`
              <div class="tool-result ${n.tool_error?"error":""}">
                <span class="tool-result-label">${n.tool_error?"Error:":"Output:"}</span>
                <pre class="tool-output">${this._escapeHtml(n.tool_error||n.tool_output||"")}</pre>
              </div>
            `:""}
          </div>
        `}else if(n.type==="image")return`<div class="history-image"><ha-icon icon="mdi:image"></ha-icon> ${n.content||"Image"}</div>`;return""}).join(""),o="";if(!t&&(e.model||e.tokens_input||e.cost)){let n=[];e.model&&n.push(e.model),(e.tokens_input||e.tokens_output)&&n.push(`${e.tokens_input||0}/${e.tokens_output||0} tokens`),e.cost&&n.push(`$${e.cost.toFixed(4)}`),o=`<div class="message-meta">${n.join(" \xB7 ")}</div>`}return`
      <div class="history-message ${t?"user":"assistant"}">
        <div class="message-header">
          <ha-icon icon="${t?"mdi:account":"mdi:robot"}"></ha-icon>
          <span class="message-role">${t?"You":"Assistant"}</span>
          <span class="message-time" title="${i.tooltip}">${i.display}</span>
        </div>
        <div class="message-content">
          ${s}
        </div>
        ${o}
      </div>
    `}_escapeHtml(e){let t=document.createElement("div");return t.textContent=e,t.innerHTML}_renderEmpty(){return`
      <div class="empty-state">
        <ha-icon icon="mdi:code-braces-box"></ha-icon>
        <p>No OpenCode sessions found</p>
      </div>
    `}_renderDevices(){let e=Array.from(this._devices.values());return this._sortMode==="activity"?e.sort((t,i)=>{let s=t.entities.get("last_activity")?.state??"",o=i.entities.get("last_activity")?.state??"";return!s&&!o?0:s?o?new Date(o).getTime()-new Date(s).getTime():-1:1}):e.sort((t,i)=>{let s=t.deviceName.replace("OpenCode - ","").toLowerCase(),o=i.deviceName.replace("OpenCode - ","").toLowerCase();return s.localeCompare(o)}),e.map(t=>this._renderDevice(t)).join("")}_renderDetailView(e,t){let i=e.entities.get("state"),s=e.entities.get("session_title"),o=e.entities.get("model"),n=e.entities.get("current_tool"),r=e.entities.get("cost"),l=e.entities.get("tokens_input"),p=e.entities.get("tokens_output"),d=e.entities.get("last_activity"),h=i?.state??"unknown",m=I[h]||I.unknown,b=s?.state??"Unknown Session",u=o?.state??"unknown",w=n?.state??"none",D=r?.state??"0",E=l?.state??"0",k=p?.state??"0",y=d?.state??"",f=i?.attributes?.agent||null,v=i?.attributes?.current_agent||null,_=i?.attributes?.hostname||null,$="";y&&($=new Date(y).toLocaleTimeString());let S=this._getPermissionDetails(e),H="";if(S){let L=!!S.permission_id;H=`
        <div class="permission-alert pinned clickable" data-device-id="${e.deviceId}">
          <ha-icon icon="mdi:shield-alert"></ha-icon>
          <div class="permission-details">
            <div class="permission-title">${S.title}</div>
            <div class="permission-type">${S.type}${L?"":" (loading...)"}</div>
          </div>
          <ha-icon icon="mdi:chevron-right" class="permission-chevron"></ha-icon>
        </div>
      `}else h==="waiting_permission"&&(H=`
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
        ${t?`
      <button class="back-button" data-action="back">
        <ha-icon icon="mdi:arrow-left"></ha-icon>
        <span>Back</span>
      </button>
    `:""}
        <div class="detail-header">
          <div class="detail-status ${h==="working"?"pulse":""}" style="background: ${m.color}20; border-color: ${m.color}">
            <ha-icon icon="${m.icon}" style="color: ${m.color}"></ha-icon>
            <span class="status-text" style="color: ${m.color}">${m.label}</span>
          </div>
          <div class="detail-project-info">
            <div class="detail-project">${e.deviceName.replace("OpenCode - ","")}</div>
            ${_?`<div class="detail-hostname"><ha-icon icon="mdi:server"></ha-icon> ${_}</div>`:""}
          </div>
        </div>

        <div class="detail-session">
          <ha-icon icon="mdi:message-text"></ha-icon>
          <span class="session-title">${b}</span>
        </div>

        ${H}

        <div class="detail-info">
          <div class="detail-row">
            <ha-icon icon="mdi:brain"></ha-icon>
            <span class="detail-label">Model</span>
            <span class="detail-value mono">${u}</span>
          </div>
          ${f?`
          <div class="detail-row">
            <ha-icon icon="mdi:account-cog"></ha-icon>
            <span class="detail-label">Agent</span>
            <span class="detail-value agent-badge">${f}${v&&v!==f?` <span class="sub-agent-indicator"><ha-icon icon="mdi:arrow-right"></ha-icon> ${v}</span>`:""}</span>
          </div>
          `:""}
          ${w!=="none"?`
          <div class="detail-row highlight">
            <ha-icon icon="mdi:tools"></ha-icon>
            <span class="detail-label">Tool</span>
            <span class="detail-value mono tool-active">${w}</span>
          </div>
          `:""}
          <div class="detail-row">
            <ha-icon icon="mdi:clock-outline"></ha-icon>
            <span class="detail-label">Last Activity</span>
            <span class="detail-value">${$||"\u2014"}</span>
          </div>
        </div>

        <div class="detail-stats">
          <div class="stat">
            <ha-icon icon="mdi:currency-usd"></ha-icon>
            <span class="stat-value">$${parseFloat(D).toFixed(4)}</span>
            <span class="stat-label">Cost</span>
          </div>
          <div class="stat">
            <ha-icon icon="mdi:arrow-right-bold"></ha-icon>
            <span class="stat-value">${Number(E).toLocaleString()}</span>
            <span class="stat-label">In</span>
          </div>
          <div class="stat">
            <ha-icon icon="mdi:arrow-left-bold"></ha-icon>
            <span class="stat-value">${Number(k).toLocaleString()}</span>
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
    `}_renderDevice(e){let t=e.entities.get("state"),i=e.entities.get("session_title"),s=e.entities.get("model"),o=e.entities.get("current_tool"),n=e.entities.get("cost"),r=e.entities.get("tokens_input"),l=e.entities.get("tokens_output"),p=e.entities.get("last_activity"),d=t?.state??"unknown",h=I[d]||I.unknown,m=i?.state??"Unknown Session",b=s?.state??"unknown",u=o?.state??"none",w=n?.state??"0",D=r?.state??"0",E=l?.state??"0",k=p?.state??"",y=k?M(k):null,f=t?.attributes?.current_agent||null,v=this._getPermissionDetails(e),_="";if(v){let $=!!v.permission_id;_=`
        <div class="permission-alert clickable" data-device-id="${e.deviceId}">
          <ha-icon icon="mdi:shield-alert"></ha-icon>
          <div class="permission-details">
            <div class="permission-title">${v.title}</div>
            <div class="permission-type">${v.type}${$?"":" (loading...)"}</div>
          </div>
          <ha-icon icon="mdi:chevron-right" class="permission-chevron"></ha-icon>
        </div>
      `}else d==="waiting_permission"&&(_=`
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
          <div class="device-status ${d==="working"?"pulse":""}">
            <ha-icon icon="${h.icon}" style="color: ${h.color}"></ha-icon>
            <span class="status-label" style="color: ${h.color}">${h.label}</span>
          </div>
          <div class="device-name-container">
            <div class="device-name">${e.deviceName.replace("OpenCode - ","")}</div>
            ${y?`<div class="device-activity" title="${y.tooltip}">${y.display}</div>`:""}
          </div>
          <ha-icon icon="mdi:chevron-right" class="device-chevron"></ha-icon>
        </div>
        
        <div class="device-info">
          <div class="info-row">
            <ha-icon icon="mdi:message-text"></ha-icon>
            <span class="info-label">Session:</span>
            <span class="info-value">${m}</span>
          </div>
          <div class="info-row">
            <ha-icon icon="mdi:brain"></ha-icon>
            <span class="info-label">Model:</span>
            <span class="info-value model">${b}</span>
          </div>
          ${u!=="none"?`
          <div class="info-row">
            <ha-icon icon="mdi:tools"></ha-icon>
            <span class="info-label">Tool:</span>
            <span class="info-value tool">${u}</span>
          </div>
          `:""}
          ${f?`
          <div class="info-row">
            <ha-icon icon="mdi:account-switch"></ha-icon>
            <span class="info-label">Sub-agent:</span>
            <span class="info-value sub-agent">${f}</span>
          </div>
          `:""}
          <div class="info-row stats">
            <ha-icon icon="mdi:currency-usd"></ha-icon>
            <span class="stat-value">$${parseFloat(w).toFixed(4)}</span>
            <ha-icon icon="mdi:arrow-right-bold"></ha-icon>
            <span class="stat-value">${D}</span>
            <ha-icon icon="mdi:arrow-left-bold"></ha-icon>
            <span class="stat-value">${E}</span>
          </div>
        </div>

        ${_}
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
    `}static getConfigElement(){return document.createElement("opencode-card-editor")}static getStubConfig(){return{title:"OpenCode Sessions"}}};a(x,"HISTORY_PAGE_SIZE",10);var P=x;customElements.define("opencode-card",P);window.customCards=window.customCards||[];window.customCards.push({type:"opencode-card",name:"OpenCode Card",description:"Display and interact with OpenCode AI coding assistant sessions"});
