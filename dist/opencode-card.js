var q=Object.defineProperty;var A=(p,c,e)=>c in p?q(p,c,{enumerable:!0,configurable:!0,writable:!0,value:e}):p[c]=e;var r=(p,c,e)=>(A(p,typeof c!="symbol"?c+"":c,e),e);function C(p){return`opencode_history_${p}`}function j(p){let c=new Date(p);if(isNaN(c.getTime()))return{display:"Unknown",tooltip:"Invalid timestamp"};let e=new Date,t=e.getTime()-c.getTime(),i=Math.floor(t/6e4),s=Math.floor(t/36e5),o=c.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),n=c.toLocaleDateString([],{month:"short",day:"numeric"}),a=c.toLocaleString(),d=c.toDateString()===e.toDateString();if(s>=2)return d?{display:o,tooltip:a}:{display:`${n} ${o}`,tooltip:a};if(i<1)return{display:"Just now",tooltip:a};if(i<60)return{display:`${i}m ago`,tooltip:a};{let h=Math.floor(i/60),l=i%60;return l===0?{display:`${h}h ago`,tooltip:a}:{display:`${h}h ${l}m ago`,tooltip:a}}}var D={idle:{icon:"mdi:sleep",color:"#4caf50",label:"Idle"},working:{icon:"mdi:cog",color:"#2196f3",label:"Working"},waiting_permission:{icon:"mdi:shield-alert",color:"#ff9800",label:"Needs Permission"},error:{icon:"mdi:alert-circle",color:"#f44336",label:"Error"},unknown:{icon:"mdi:help-circle",color:"#9e9e9e",label:"Unknown"}},b=class b extends HTMLElement{constructor(){super(...arguments);r(this,"_hass");r(this,"_config");r(this,"_devices",new Map);r(this,"_deviceRegistry",new Map);r(this,"_entityRegistry",new Map);r(this,"_initialized",!1);r(this,"_showPermissionModal",!1);r(this,"_activePermission",null);r(this,"_selectedDeviceId",null);r(this,"_showHistoryView",!1);r(this,"_historyLoading",!1);r(this,"_historyData",null);r(this,"_historyDeviceId",null);r(this,"_historyCommandTopic",null);r(this,"_historyResponseTopic",null);r(this,"_mqttUnsubscribe",null);r(this,"_historyVisibleCount",10);r(this,"_historyLoadingMore",!1);r(this,"_isAtBottom",!0);r(this,"_pendingPermissions",new Map);r(this,"_lastRenderHash","");r(this,"_availableAgents",[]);r(this,"_selectedAgent",null);r(this,"_agentsLoading",!1);r(this,"_autoRefreshInterval",null);r(this,"_lastDeviceState",null)}set hass(e){if(this._hass=e,!this._initialized)this._initialize();else{if(this._updateDevices(),this._showHistoryView&&this._historyDeviceId){let o=this._devices.get(this._historyDeviceId)?.entities.get("state")?.state??"unknown";this._lastDeviceState!==null&&this._lastDeviceState!==o&&this._refreshHistory(),this._lastDeviceState=o,this._manageAutoRefresh(o);return}if(this._showPermissionModal&&this._activePermission){let i=this._findDeviceIdForPermission(this._activePermission);if(i){let s=this._pendingPermissions.get(i);if(s&&s.permission_id&&!this._activePermission.permission_id){this._activePermission=s,this._render();return}}return}let t=this._computeStateHash();t!==this._lastRenderHash&&(this._lastRenderHash=t,this._render())}}_manageAutoRefresh(e){let t=(this._config?.working_refresh_interval??10)*1e3;e==="working"?this._autoRefreshInterval||(this._autoRefreshInterval=setInterval(()=>{this._showHistoryView&&!this._historyLoading&&this._refreshHistory()},t)):this._autoRefreshInterval&&(clearInterval(this._autoRefreshInterval),this._autoRefreshInterval=null)}_computeStateHash(){let e=[];for(let[t,i]of this._devices){let s=i.entities.get("state"),o=i.entities.get("session_title"),n=i.entities.get("model"),a=i.entities.get("current_tool"),d=i.entities.get("cost"),h=i.entities.get("tokens_input"),l=i.entities.get("tokens_output"),m=i.entities.get("permission"),v=i.entities.get("last_activity"),g=s?.attributes?.agent,u=s?.attributes?.current_agent;e.push(`${t}:${s?.state}:${o?.state}:${n?.state}:${a?.state}:${d?.state}:${h?.state}:${l?.state}:${m?.state}:${v?.state}:${g}:${u}`),m?.state==="pending"&&e.push(`perm:${m.attributes?.permission_id}`)}for(let[t,i]of this._pendingPermissions)e.push(`pending:${t}:${i.permission_id}`);return e.join("|")}_findDeviceIdForPermission(e){for(let[t,i]of this._devices)if(i.entities.get("device_id")?.attributes?.command_topic===e.commandTopic)return t;return null}setConfig(e){this._config=e}async _initialize(){this._hass&&(this._initialized=!0,await this._fetchRegistries(),this._updateDevices(),this._render())}async _fetchRegistries(){if(this._hass)try{let e=await this._hass.callWS({type:"config/device_registry/list"});for(let i of e)i.manufacturer==="OpenCode"&&this._deviceRegistry.set(i.id,i);let t=await this._hass.callWS({type:"config/entity_registry/list"});for(let i of t)i.platform==="mqtt"&&this._deviceRegistry.has(i.device_id)&&this._entityRegistry.set(i.entity_id,i)}catch(e){console.error("[opencode-card] Failed to fetch registries:",e)}}_updateDevices(){if(this._hass){this._devices.clear();for(let[e,t]of this._entityRegistry){let i=this._deviceRegistry.get(t.device_id);if(!i)continue;let s=this._hass.states[e];if(!s)continue;let o=this._devices.get(i.id);o||(o={deviceId:i.id,deviceName:i.name,entities:new Map},this._devices.set(i.id,o));let n=t.unique_id||"",a="",d=i.identifiers?.[0]?.[1]||"";if(d&&n.startsWith(d+"_"))a=n.slice(d.length+1);else{let h=["device_id","state","session_title","model","current_tool","tokens_input","tokens_output","cost","last_activity","permission"];for(let l of h)if(n.endsWith("_"+l)){a=l;break}}a&&o.entities.set(a,s)}this._updatePendingPermissions()}}_updatePendingPermissions(){for(let[e,t]of this._devices){let i=t.entities.get("permission"),s=t.entities.get("state"),o=t.entities.get("device_id");if(i?.state==="pending"&&i.attributes){let n=i.attributes;n.permission_id&&n.title&&this._pendingPermissions.set(e,{permission_id:n.permission_id,type:n.type||"unknown",title:n.title,session_id:n.session_id||"",message_id:n.message_id||"",call_id:n.call_id,pattern:n.pattern,metadata:n.metadata,commandTopic:o?.attributes?.command_topic??""})}else if(s?.state!=="waiting_permission"||i?.state==="none")this._pendingPermissions.delete(e);else if(s?.state==="waiting_permission"&&!this._pendingPermissions.has(e)){let n=o?.attributes?.command_topic??"";n&&this._pendingPermissions.set(e,{permission_id:"",type:"pending",title:"Permission Required",session_id:"",message_id:"",commandTopic:n})}}}_getPinnedDevice(){return this._config?.device&&this._devices.get(this._config.device)||null}_getPermissionDetails(e){let t=this._pendingPermissions.get(e.deviceId);if(t&&t.permission_id)return t;let i=e.entities.get("permission"),s=e.entities.get("device_id");if(i?.state!=="pending"||!i.attributes)return t||null;let o=i.attributes;return{permission_id:o.permission_id,type:o.type,title:o.title,session_id:o.session_id,message_id:o.message_id,call_id:o.call_id,pattern:o.pattern,metadata:o.metadata,commandTopic:s?.attributes?.command_topic??""}}_showPermission(e){this._activePermission=e,this._showPermissionModal=!0,this._render()}_hidePermissionModal(){this._showPermissionModal=!1,this._activePermission=null,this._render()}_selectDevice(e){this._selectedDeviceId=e,this._render()}_goBack(){this._selectedDeviceId=null,this._render()}_isPinned(){return!!this._config?.device}async _sendChatMessage(e){if(!(!this._hass||!this._historyCommandTopic||!e.trim()))try{if(this._historyData){let i={id:`temp_${Date.now()}`,role:"user",timestamp:new Date().toISOString(),parts:[{type:"text",content:e.trim()}]};this._historyData.messages.push(i),this._render(),setTimeout(()=>{let s=this.querySelector(".history-body");s&&(s.scrollTop=s.scrollHeight)},0)}let t={command:"prompt",text:e.trim()};this._selectedAgent&&(t.agent=this._selectedAgent),await this._hass.callService("mqtt","publish",{topic:this._historyCommandTopic,payload:JSON.stringify(t)})}catch(t){console.error("[opencode-card] Failed to send chat message:",t)}}async _showHistory(e,t,i){this._historyDeviceId=e,this._historyCommandTopic=t,this._historyResponseTopic=i,this._showHistoryView=!0,this._historyLoading=!0,this._selectedAgent=null;let o=this._devices.get(e)?.entities.get("state");this._lastDeviceState=o?.state??"unknown",this._manageAutoRefresh(this._lastDeviceState),this._render(),this._fetchAgents();let n=this._loadHistoryFromCache(e);n?(this._historyData=n.data,this._historyLoading=!1,this._render(),await this._fetchHistorySince(n.lastFetched)):await this._fetchFullHistory()}async _fetchAgents(){if(!this._hass||!this._historyCommandTopic||!this._historyResponseTopic)return;this._agentsLoading=!0;let e=`agents_${Date.now()}`;try{let t=await this._hass.connection.subscribeMessage(i=>{let o=i.variables?.trigger;if(o?.topic===this._historyResponseTopic)try{let n=o.payload_json||JSON.parse(o.payload||"{}");n.type==="agents"&&(!n.request_id||n.request_id===e)&&(this._availableAgents=n.agents,this._agentsLoading=!1,this._render(),t())}catch(n){console.error("[opencode-card] Failed to parse agents response:",n)}},{type:"subscribe_trigger",trigger:{platform:"mqtt",topic:this._historyResponseTopic}});await this._hass.callService("mqtt","publish",{topic:this._historyCommandTopic,payload:JSON.stringify({command:"get_agents",request_id:e})}),setTimeout(()=>{this._agentsLoading&&(this._agentsLoading=!1,t())},1e4)}catch(t){console.error("[opencode-card] Failed to fetch agents:",t),this._agentsLoading=!1}}_hideHistoryView(){this._showHistoryView=!1,this._historyLoading=!1,this._historyData=null,this._historyDeviceId=null,this._historyCommandTopic=null,this._historyResponseTopic=null,this._historyVisibleCount=10,this._isAtBottom=!0,this._availableAgents=[],this._selectedAgent=null,this._agentsLoading=!1,this._lastDeviceState=null,this._autoRefreshInterval&&(clearInterval(this._autoRefreshInterval),this._autoRefreshInterval=null),this._render()}_scrollToBottom(){let e=this.querySelector(".history-body");if(e){e.scrollTop=e.scrollHeight,this._isAtBottom=!0;let t=this.querySelector(".scroll-to-bottom-btn");t&&t.classList.add("hidden")}}_loadHistoryFromCache(e){try{let t=localStorage.getItem(C(e));if(t)return JSON.parse(t)}catch(t){console.error("[opencode-card] Failed to load history from cache:",t)}return null}_saveHistoryToCache(e,t){try{let i={data:t,lastFetched:t.fetched_at};localStorage.setItem(C(e),JSON.stringify(i))}catch(i){console.error("[opencode-card] Failed to save history to cache:",i)}}async _fetchFullHistory(){if(!this._hass||!this._historyCommandTopic||!this._historyResponseTopic||!this._historyDeviceId)return;let e=`req_${Date.now()}`;await this._subscribeToResponse(e);try{await this._hass.callService("mqtt","publish",{topic:this._historyCommandTopic,payload:JSON.stringify({command:"get_history",request_id:e})})}catch(t){console.error("[opencode-card] Failed to request history:",t),this._historyLoading=!1,this._render()}}async _fetchHistorySince(e){if(!this._hass||!this._historyCommandTopic||!this._historyResponseTopic||!this._historyDeviceId)return;let t=`req_${Date.now()}`;await this._subscribeToResponse(t);try{await this._hass.callService("mqtt","publish",{topic:this._historyCommandTopic,payload:JSON.stringify({command:"get_history_since",since:e,request_id:t})})}catch(i){console.error("[opencode-card] Failed to request history update:",i)}}async _subscribeToResponse(e){if(!(!this._hass||!this._historyResponseTopic))try{let t=await this._hass.connection.subscribeMessage(i=>{let o=i.variables?.trigger;if(o?.topic===this._historyResponseTopic)try{let n=o.payload_json||JSON.parse(o.payload||"{}");n.type==="history"&&(!n.request_id||n.request_id===e)&&this._handleHistoryResponse(n)}catch(n){console.error("[opencode-card] Failed to parse history response:",n)}},{type:"subscribe_trigger",trigger:{platform:"mqtt",topic:this._historyResponseTopic}});this._mqttUnsubscribe=t,setTimeout(()=>{this._mqttUnsubscribe&&(this._mqttUnsubscribe(),this._mqttUnsubscribe=null),this._historyLoading&&(this._historyLoading=!1,this._render())},3e4)}catch(t){console.error("[opencode-card] Failed to subscribe to response topic:",t)}}_handleHistoryResponse(e){if(!this._historyDeviceId)return;let t=e.since&&e.messages.length>0,i=!this._historyData;if(e.since&&this._historyData){let s=new Set(this._historyData.messages.map(n=>n.id)),o=e.messages.filter(n=>!s.has(n.id));this._historyData.messages.push(...o),this._historyData.fetched_at=e.fetched_at}else this._historyData=e;this._saveHistoryToCache(this._historyDeviceId,this._historyData),this._historyLoading=!1,this._render(),(i||t&&this._isAtBottom)&&setTimeout(()=>this._scrollToBottom(),0),this._mqttUnsubscribe&&(this._mqttUnsubscribe(),this._mqttUnsubscribe=null)}_refreshHistory(){!this._historyDeviceId||!this._historyData||(this._historyLoading=!0,this._render(),this._fetchHistorySince(this._historyData.fetched_at))}async _respondToPermission(e){if(!this._hass||!this._activePermission)return;let{commandTopic:t,permission_id:i}=this._activePermission;if(!t){console.error("[opencode-card] Cannot respond: missing command topic");return}if(!i){console.error("[opencode-card] Cannot respond: missing permission_id (still loading)");return}try{await this._hass.callService("mqtt","publish",{topic:t,payload:JSON.stringify({command:"permission_response",permission_id:i,response:e})}),this._hidePermissionModal()}catch(s){console.error("[opencode-card] Failed to send permission response:",s)}}_render(){let e=this._config?.title??"OpenCode Sessions",t=this._getPinnedDevice(),i=this._selectedDeviceId?this._devices.get(this._selectedDeviceId):null,s="";t?s=`
        <ha-card>
          <div class="card-content pinned">
            ${this._renderDetailView(t,!1)}
          </div>
        </ha-card>
      `:i?s=`
        <ha-card>
          <div class="card-content pinned">
            ${this._renderDetailView(i,!0)}
          </div>
        </ha-card>
      `:s=`
        <ha-card>
          <div class="card-header">
            <div class="name">${e}</div>
          </div>
          <div class="card-content">
            ${this._devices.size===0?this._renderEmpty():this._renderDevices()}
          </div>
        </ha-card>
      `,this._showPermissionModal&&this._activePermission&&(s+=this._renderPermissionModal(this._activePermission)),this._showHistoryView&&(s+=this._renderHistoryView()),this.innerHTML=`
      ${s}
      <style>
        ${this._getStyles()}
      </style>
    `,this._attachEventListeners()}_attachEventListeners(){!this._isPinned()&&!this._selectedDeviceId&&this.querySelectorAll(".device-card[data-device-id]").forEach(t=>{t.addEventListener("click",i=>{if(i.target.closest(".permission-alert"))return;let s=t.dataset.deviceId;s&&this._selectDevice(s)})}),this.querySelector(".back-button")?.addEventListener("click",()=>{this._goBack()}),this.querySelectorAll(".permission-alert[data-device-id]").forEach(t=>{t.addEventListener("click",i=>{i.stopPropagation();let s=t.dataset.deviceId;if(s){let o=this._devices.get(s);if(o){let n=this._getPermissionDetails(o);if(n)this._showPermission(n);else{let d=o.entities.get("device_id")?.attributes?.command_topic??"";d&&this._showPermission({permission_id:"",type:"pending",title:"Permission Required",session_id:"",message_id:"",commandTopic:d})}}}})}),this.querySelector(".modal-backdrop:not(.history-modal-backdrop)")?.addEventListener("click",t=>{t.target.classList.contains("modal-backdrop")&&this._hidePermissionModal()}),this.querySelector(".modal-close:not(.history-close)")?.addEventListener("click",()=>{this._hidePermissionModal()}),this.querySelector(".btn-allow-once")?.addEventListener("click",()=>{this._respondToPermission("once")}),this.querySelector(".btn-allow-always")?.addEventListener("click",()=>{this._respondToPermission("always")}),this.querySelector(".btn-reject")?.addEventListener("click",()=>{this._respondToPermission("reject")}),this.querySelector(".open-chat-btn")?.addEventListener("click",()=>{let t=this.querySelector(".open-chat-btn"),i=t?.dataset.deviceId,s=t?.dataset.commandTopic,o=t?.dataset.responseTopic;i&&s&&o&&this._showHistory(i,s,o)}),this.querySelector(".history-modal-backdrop")?.addEventListener("click",t=>{t.target.classList.contains("history-modal-backdrop")&&this._hideHistoryView()}),this.querySelector(".history-close")?.addEventListener("click",()=>{this._hideHistoryView()}),this.querySelector(".history-refresh-btn")?.addEventListener("click",()=>{this._refreshHistory()}),this.querySelector(".history-load-more")?.addEventListener("click",()=>{this._loadMoreHistory()});let e=this.querySelector(".history-body");e&&e.addEventListener("scroll",()=>{if(e.scrollTop<50&&!this._historyLoadingMore){let i=this._historyData?.messages.length||0;Math.max(0,i-this._historyVisibleCount)>0&&this._loadMoreHistory()}let t=e.scrollHeight-e.scrollTop-e.clientHeight<50;if(t!==this._isAtBottom){this._isAtBottom=t;let i=this.querySelector(".scroll-to-bottom-btn");i&&i.classList.toggle("hidden",t)}}),this.querySelector(".scroll-to-bottom-btn")?.addEventListener("click",()=>{this._scrollToBottom()}),this.querySelector(".chat-send-btn")?.addEventListener("click",()=>{let t=this.querySelector(".chat-input");t?.value.trim()&&(this._sendChatMessage(t.value.trim()),t.value="")}),this.querySelector(".chat-input")?.addEventListener("keydown",t=>{let i=t;if(i.key==="Enter"&&!i.shiftKey){t.preventDefault();let s=t.target;s?.value.trim()&&(this._sendChatMessage(s.value.trim()),s.value="")}}),this.querySelector(".agent-selector")?.addEventListener("change",t=>{let i=t.target;this._selectedAgent=i.value||null}),this.querySelectorAll(".inline-perm-btn").forEach(t=>{t.addEventListener("click",i=>{let s=t.dataset.response;s&&this._respondToInlinePermission(s)})})}async _respondToInlinePermission(e){if(!this._hass||!this._historyDeviceId)return;let t=this._pendingPermissions.get(this._historyDeviceId);if(!t?.permission_id||!t?.commandTopic){console.error("[opencode-card] Cannot respond: missing permission details");return}try{await this._hass.callService("mqtt","publish",{topic:t.commandTopic,payload:JSON.stringify({command:"permission_response",permission_id:t.permission_id,response:e})}),this._pendingPermissions.delete(this._historyDeviceId),setTimeout(()=>this._refreshHistory(),500)}catch(i){console.error("[opencode-card] Failed to respond to permission:",i)}}_renderPermissionModal(e){let t=!!e.permission_id,i=t?"":"disabled";return`
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
          <span>${this._historyLoadingMore?"Loading...":`Load ${Math.min(n,b.HISTORY_PAGE_SIZE)} more (${n} remaining)`}</span>
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
                ${Object.entries(s.metadata).map(([n,a])=>`
                  <div class="inline-metadata-item">
                    <span class="inline-metadata-key">${n}:</span>
                    <span class="inline-metadata-value">${typeof a=="object"?JSON.stringify(a):String(a)}</span>
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
    `}_loadMoreHistory(){if(!this._historyData||this._historyLoadingMore)return;let e=this._historyData.messages.length;Math.max(0,e-this._historyVisibleCount)<=0||(this._historyLoadingMore=!0,this._render(),setTimeout(()=>{this._historyVisibleCount+=b.HISTORY_PAGE_SIZE,this._historyLoadingMore=!1;let s=this.querySelector(".history-body")?.scrollHeight||0;this._render();let o=this.querySelector(".history-body");if(o&&s>0){let a=o.scrollHeight-s;o.scrollTop=a}},100))}_renderHistoryMessage(e){let t=e.role==="user",i=j(e.timestamp),s=e.parts.map(n=>{if(n.type==="text"&&n.content)return`<div class="history-text">${this._escapeHtml(n.content)}</div>`;if(n.type==="tool_call"){let a=n.tool_output||n.tool_error;return`
          <div class="history-tool">
            <div class="tool-header">
              <ha-icon icon="mdi:tools"></ha-icon>
              <span class="tool-name">${n.tool_name||"unknown"}</span>
            </div>
            ${n.tool_args?`<pre class="tool-args">${this._escapeHtml(JSON.stringify(n.tool_args,null,2))}</pre>`:""}
            ${a?`
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
    `}_renderDevices(){let e=[];for(let[,t]of this._devices)e.push(this._renderDevice(t));return e.join("")}_renderDetailView(e,t){let i=e.entities.get("state"),s=e.entities.get("session_title"),o=e.entities.get("model"),n=e.entities.get("current_tool"),a=e.entities.get("device_id"),d=e.entities.get("cost"),h=e.entities.get("tokens_input"),l=e.entities.get("tokens_output"),m=e.entities.get("last_activity"),v=i?.state??"unknown",g=D[v]||D.unknown,u=s?.state??"Unknown Session",P=o?.state??"unknown",_=n?.state??"none",x=a?.attributes?.command_topic??"unknown",E=a?.attributes?.response_topic??"",w=d?.state??"0",y=h?.state??"0",f=l?.state??"0",k=m?.state??"",S=i?.attributes?.agent||null,H=i?.attributes?.current_agent||null,z=i?.attributes?.hostname||null,R="";k&&(R=new Date(k).toLocaleTimeString());let $=this._getPermissionDetails(e),T="";if($){let M=!!$.permission_id;T=`
        <div class="permission-alert pinned clickable" data-device-id="${e.deviceId}">
          <ha-icon icon="mdi:shield-alert"></ha-icon>
          <div class="permission-details">
            <div class="permission-title">${$.title}</div>
            <div class="permission-type">${$.type}${M?"":" (loading...)"}</div>
          </div>
          <ha-icon icon="mdi:chevron-right" class="permission-chevron"></ha-icon>
        </div>
      `}else v==="waiting_permission"&&(T=`
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
          <div class="detail-status ${v==="working"?"pulse":""}" style="background: ${g.color}20; border-color: ${g.color}">
            <ha-icon icon="${g.icon}" style="color: ${g.color}"></ha-icon>
            <span class="status-text" style="color: ${g.color}">${g.label}</span>
          </div>
          <div class="detail-project-info">
            <div class="detail-project">${e.deviceName.replace("OpenCode - ","")}</div>
            ${z?`<div class="detail-hostname"><ha-icon icon="mdi:server"></ha-icon> ${z}</div>`:""}
          </div>
        </div>

        <div class="detail-session">
          <ha-icon icon="mdi:message-text"></ha-icon>
          <span class="session-title">${u}</span>
        </div>

        ${T}

        <div class="detail-info">
          <div class="detail-row">
            <ha-icon icon="mdi:brain"></ha-icon>
            <span class="detail-label">Model</span>
            <span class="detail-value mono">${P}</span>
          </div>
          ${S?`
          <div class="detail-row">
            <ha-icon icon="mdi:account-cog"></ha-icon>
            <span class="detail-label">Agent</span>
            <span class="detail-value agent-badge">${S}${H&&H!==S?` <span class="sub-agent-indicator"><ha-icon icon="mdi:arrow-right"></ha-icon> ${H}</span>`:""}</span>
          </div>
          `:""}
          ${_!=="none"?`
          <div class="detail-row highlight">
            <ha-icon icon="mdi:tools"></ha-icon>
            <span class="detail-label">Tool</span>
            <span class="detail-value mono tool-active">${_}</span>
          </div>
          `:""}
          <div class="detail-row">
            <ha-icon icon="mdi:clock-outline"></ha-icon>
            <span class="detail-label">Last Activity</span>
            <span class="detail-value">${R||"\u2014"}</span>
          </div>
        </div>

        <div class="detail-stats">
          <div class="stat">
            <ha-icon icon="mdi:currency-usd"></ha-icon>
            <span class="stat-value">$${parseFloat(w).toFixed(4)}</span>
            <span class="stat-label">Cost</span>
          </div>
          <div class="stat">
            <ha-icon icon="mdi:arrow-right-bold"></ha-icon>
            <span class="stat-value">${Number(y).toLocaleString()}</span>
            <span class="stat-label">In</span>
          </div>
          <div class="stat">
            <ha-icon icon="mdi:arrow-left-bold"></ha-icon>
            <span class="stat-value">${Number(f).toLocaleString()}</span>
            <span class="stat-label">Out</span>
          </div>
        </div>

        <div class="detail-actions">
          <button class="open-chat-btn" data-device-id="${e.deviceId}" data-command-topic="${x}" data-response-topic="${E}">
            <ha-icon icon="mdi:chat"></ha-icon>
            <span>Chat</span>
          </button>
        </div>

        <div class="detail-footer">
          <code class="command-topic">${x}</code>
        </div>
      </div>
    `}_renderDevice(e){let t=e.entities.get("state"),i=e.entities.get("session_title"),s=e.entities.get("model"),o=e.entities.get("current_tool"),n=e.entities.get("device_id"),a=e.entities.get("cost"),d=e.entities.get("tokens_input"),h=e.entities.get("tokens_output"),l=t?.state??"unknown",m=D[l]||D.unknown,v=i?.state??"Unknown Session",g=s?.state??"unknown",u=o?.state??"none",P=n?.attributes?.command_topic??"unknown",_=a?.state??"0",x=d?.state??"0",E=h?.state??"0",w=t?.attributes?.current_agent||null,y=this._getPermissionDetails(e),f="";if(y){let k=!!y.permission_id;f=`
        <div class="permission-alert clickable" data-device-id="${e.deviceId}">
          <ha-icon icon="mdi:shield-alert"></ha-icon>
          <div class="permission-details">
            <div class="permission-title">${y.title}</div>
            <div class="permission-type">${y.type}${k?"":" (loading...)"}</div>
          </div>
          <ha-icon icon="mdi:chevron-right" class="permission-chevron"></ha-icon>
        </div>
      `}else l==="waiting_permission"&&(f=`
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
          <div class="device-status ${l==="working"?"pulse":""}">
            <ha-icon icon="${m.icon}" style="color: ${m.color}"></ha-icon>
            <span class="status-label" style="color: ${m.color}">${m.label}</span>
          </div>
          <div class="device-name">${e.deviceName.replace("OpenCode - ","")}</div>
          <ha-icon icon="mdi:chevron-right" class="device-chevron"></ha-icon>
        </div>
        
        <div class="device-info">
          <div class="info-row">
            <ha-icon icon="mdi:message-text"></ha-icon>
            <span class="info-label">Session:</span>
            <span class="info-value">${v}</span>
          </div>
          <div class="info-row">
            <ha-icon icon="mdi:brain"></ha-icon>
            <span class="info-label">Model:</span>
            <span class="info-value model">${g}</span>
          </div>
          ${u!=="none"?`
          <div class="info-row">
            <ha-icon icon="mdi:tools"></ha-icon>
            <span class="info-label">Tool:</span>
            <span class="info-value tool">${u}</span>
          </div>
          `:""}
          ${w?`
          <div class="info-row">
            <ha-icon icon="mdi:account-switch"></ha-icon>
            <span class="info-label">Sub-agent:</span>
            <span class="info-value sub-agent">${w}</span>
          </div>
          `:""}
          <div class="info-row stats">
            <ha-icon icon="mdi:currency-usd"></ha-icon>
            <span class="stat-value">$${parseFloat(_).toFixed(4)}</span>
            <ha-icon icon="mdi:arrow-right-bold"></ha-icon>
            <span class="stat-value">${x}</span>
            <ha-icon icon="mdi:arrow-left-bold"></ha-icon>
            <span class="stat-value">${E}</span>
          </div>
        </div>

        ${f}
      </div>
    `}_getStyles(){return`
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
    `}static getConfigElement(){return document.createElement("opencode-card-editor")}static getStubConfig(){return{title:"OpenCode Sessions"}}};r(b,"HISTORY_PAGE_SIZE",10);var I=b,L=class extends HTMLElement{constructor(){super(...arguments);r(this,"_config");r(this,"_hass");r(this,"_devices",[])}set hass(e){this._hass=e,this._fetchDevices()}setConfig(e){this._config=e,this._render()}async _fetchDevices(){if(this._hass)try{let e=await this._hass.callWS({type:"config/device_registry/list"});this._devices=e.filter(t=>t.manufacturer==="OpenCode"),this._render()}catch(e){console.error("[opencode-card-editor] Failed to fetch devices:",e)}}_render(){let e=this._config?.device??"",t=this._config?.title??"";this.innerHTML=`
      <div class="editor">
        <div class="field">
          <label for="title">Title</label>
          <input type="text" id="title" value="${t}" placeholder="OpenCode Sessions">
          <div class="hint">Leave empty to use default title. Hidden when device is selected.</div>
        </div>
        <div class="field">
          <label for="device">Pin to Device</label>
          <select id="device">
            <option value="">Show all devices</option>
            ${this._devices.map(o=>`
              <option value="${o.id}" ${o.id===e?"selected":""}>
                ${o.name}
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
    `;let i=this.querySelector("#title"),s=this.querySelector("#device");i?.addEventListener("input",o=>this._valueChanged("title",o.target.value)),s?.addEventListener("change",o=>this._valueChanged("device",o.target.value))}_valueChanged(e,t){let i={...this._config,[e]:t||void 0};i.title||delete i.title,i.device||delete i.device;let s=new CustomEvent("config-changed",{detail:{config:i},bubbles:!0,composed:!0});this.dispatchEvent(s)}};customElements.define("opencode-card",I);customElements.define("opencode-card-editor",L);window.customCards=window.customCards||[];window.customCards.push({type:"opencode-card",name:"OpenCode Card",description:"Display OpenCode sessions and their states"});console.info("%c OPENCODE-CARD %c 0.1.0 ","color: white; background: #2196f3; font-weight: bold;","color: #2196f3; background: white; font-weight: bold;");
