function J(q){return`opencode_history_${q}`}function Q(q){let l=new Date(q);if(isNaN(l.getTime()))return{display:"Unknown",tooltip:"Invalid timestamp"};let e=new Date,i=e.getTime()-l.getTime(),t=Math.floor(i/6e4),s=Math.floor(i/36e5),n=l.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),o=l.toLocaleDateString([],{month:"short",day:"numeric"}),a=l.toLocaleString(),c=l.toDateString()===e.toDateString();if(s>=2)return c?{display:n,tooltip:a}:{display:`${o} ${n}`,tooltip:a};if(t<1)return{display:"Just now",tooltip:a};if(t<60)return{display:`${t}m ago`,tooltip:a};{let d=Math.floor(t/60),r=t%60;return r===0?{display:`${d}h ago`,tooltip:a}:{display:`${d}h ${r}m ago`,tooltip:a}}}var b={idle:{icon:"mdi:sleep",color:"#4caf50",label:"Idle"},working:{icon:"mdi:cog",color:"#2196f3",label:"Working"},waiting_permission:{icon:"mdi:shield-alert",color:"#ff9800",label:"Needs Permission"},waiting_input:{icon:"mdi:comment-question",color:"#9c27b0",label:"Awaiting Input"},error:{icon:"mdi:alert-circle",color:"#f44336",label:"Error"},unknown:{icon:"mdi:help-circle",color:"#9e9e9e",label:"Unknown"}},w=class w extends HTMLElement{constructor(){super(...arguments);this._devices=new Map;this._deviceRegistry=new Map;this._entityRegistry=new Map;this._initialized=!1;this._showPermissionModal=!1;this._activePermission=null;this._selectedDeviceId=null;this._showHistoryView=!1;this._historyLoading=!1;this._historyData=null;this._historySessionId=null;this._historyDeviceId=null;this._historyVisibleCount=10;this._historyLoadingMore=!1;this._isAtBottom=!0;this._pendingPermissions=new Map;this._lastRenderHash="";this._availableAgents=[];this._selectedAgent=null;this._agentsLoading=!1;this._autoRefreshInterval=null;this._autoRefreshEnabled=!0;this._lastDeviceState=null;this._sortMode="activity";this._hideUnknown=!1;this._stateChangeUnsubscribe=null;this._historyResponseUnsubscribe=null;this._agentsResponseUnsubscribe=null;this._speakingMessageId=null;this._showQuestionModal=!1;this._activeQuestion=null;this._questionAnswers=[];this._currentQuestionIndex=0;this._otherInputs=[];this._pendingQuestions=new Map}set hass(e){if(this._hass=e,!this._initialized)this._initialize();else{if(this._updateDevices(),this._showHistoryView&&this._historyDeviceId){let n=this._devices.get(this._historyDeviceId)?.entities.get("state")?.state??"unknown";this._lastDeviceState!==null&&this._lastDeviceState!==n&&this._refreshHistory(),this._lastDeviceState=n,this._manageAutoRefresh(n);return}if(this._showPermissionModal&&this._activePermission){let t=this._findDeviceIdForPermission(this._activePermission);if(t){let s=this._pendingPermissions.get(t);if(s&&s.permission_id&&!this._activePermission.permission_id){this._activePermission=s,this._render();return}}return}let i=this._computeStateHash();i!==this._lastRenderHash&&(this._lastRenderHash=i,this._render())}}_manageAutoRefresh(e){let i=(this._config?.working_refresh_interval??10)*1e3;e==="working"&&this._autoRefreshEnabled?this._autoRefreshInterval||(this._autoRefreshInterval=setInterval(()=>{this._showHistoryView&&!this._historyLoading&&this._refreshHistory()},i)):this._autoRefreshInterval&&(clearInterval(this._autoRefreshInterval),this._autoRefreshInterval=null)}_toggleAutoRefresh(){if(this._autoRefreshEnabled=!this._autoRefreshEnabled,this._autoRefreshEnabled&&this._historyDeviceId){let t=this._devices.get(this._historyDeviceId)?.entities.get("state")?.state??"unknown";this._manageAutoRefresh(t)}else!this._autoRefreshEnabled&&this._autoRefreshInterval&&(clearInterval(this._autoRefreshInterval),this._autoRefreshInterval=null);this._render()}_computeStateHash(){let e=[];for(let[i,t]of this._devices){let s=t.entities.get("state"),n=t.entities.get("session_title"),o=t.entities.get("model"),a=t.entities.get("current_tool"),c=t.entities.get("cost"),d=t.entities.get("tokens_input"),r=t.entities.get("tokens_output"),h=t.entities.get("permission_pending"),u=t.entities.get("last_activity"),x=s?.attributes?.agent,v=s?.attributes?.current_agent;e.push(`${i}:${s?.state}:${n?.state}:${o?.state}:${a?.state}:${c?.state}:${d?.state}:${r?.state}:${h?.state}:${u?.state}:${x}:${v}`),h?.state==="on"&&e.push(`perm:${h.attributes?.permission_id}`)}for(let[i,t]of this._pendingPermissions)e.push(`pending:${i}:${t.permission_id}`);return e.join("|")}_findDeviceIdForPermission(e){for(let[i,t]of this._devices)if(t.sessionId===e.session_id)return i;return null}setConfig(e){this._config=e,e.hide_unknown!==void 0&&(this._hideUnknown=e.hide_unknown),e.sort_by!==void 0&&(this._sortMode=e.sort_by)}async _initialize(){this._hass&&(this._initialized=!0,await this._fetchRegistries(),this._updateDevices(),await this._setupEventSubscriptions(),this._render())}async _setupEventSubscriptions(){this._hass&&(this._stateChangeUnsubscribe=await this._hass.connection.subscribeEvents(e=>{let i=e.data;this._updateDevices();let t=this._computeStateHash();t!==this._lastRenderHash&&(this._lastRenderHash=t,this._render())},"opencode_state_change"),this._historyResponseUnsubscribe=await this._hass.connection.subscribeEvents(e=>{let i=e.data;this._historySessionId&&i.session_id===this._historySessionId&&this._handleHistoryResponse(i.history)},"opencode_history_response"),this._agentsResponseUnsubscribe=await this._hass.connection.subscribeEvents(e=>{let i=e.data;this._historySessionId&&i.session_id===this._historySessionId&&(this._availableAgents=i.agents,this._agentsLoading=!1,this._render())},"opencode_agents_response"))}disconnectedCallback(){this._stateChangeUnsubscribe&&(this._stateChangeUnsubscribe(),this._stateChangeUnsubscribe=null),this._historyResponseUnsubscribe&&(this._historyResponseUnsubscribe(),this._historyResponseUnsubscribe=null),this._agentsResponseUnsubscribe&&(this._agentsResponseUnsubscribe(),this._agentsResponseUnsubscribe=null),this._autoRefreshInterval&&(clearInterval(this._autoRefreshInterval),this._autoRefreshInterval=null),this._stopSpeaking()}async _fetchRegistries(){if(this._hass)try{let e=await this._hass.callWS({type:"config/device_registry/list"});for(let t of e)t.manufacturer==="OpenCode"&&this._deviceRegistry.set(t.id,t);let i=await this._hass.callWS({type:"config/entity_registry/list"});for(let t of i)t.platform==="opencode"&&this._deviceRegistry.has(t.device_id)&&this._entityRegistry.set(t.entity_id,t)}catch(e){console.error("[opencode-card] Failed to fetch registries:",e)}}_updateDevices(){if(this._hass){this._devices.clear();for(let[e,i]of this._entityRegistry){let t=this._deviceRegistry.get(i.device_id);if(!t)continue;let s=this._hass.states[e];if(!s)continue;let n=this._devices.get(t.id);if(!n){let d=t.identifiers?.[0]?.[1]?.replace("opencode_","ses_")||"";n={deviceId:t.id,deviceName:t.name,sessionId:d,entities:new Map,parentSessionId:null},this._devices.set(t.id,n)}let o=i.unique_id||"",a=t.identifiers?.[0]?.[1]||"",c="";if(a&&o.startsWith(a+"_"))c=o.slice(a.length+1);else{let d=["state","session_title","model","current_tool","tokens_input","tokens_output","cost","last_activity","permission_pending"];for(let r of d)if(o.endsWith("_"+r)){c=r;break}}c&&n.entities.set(c,s),c==="state"&&s.attributes?.parent_session_id&&(n.parentSessionId=s.attributes.parent_session_id)}this._updatePendingPermissions(),this._updatePendingQuestions()}}_updatePendingPermissions(){for(let[e,i]of this._devices){let t=i.entities.get("permission_pending"),s=i.entities.get("state");if(s?.state==="waiting_permission"&&console.log("[opencode-card] PERMISSION DEBUG:",{deviceId:e,stateEntityState:s?.state,permissionEntityState:t?.state,permissionEntityAttrs:t?.attributes}),t?.state==="on"&&t.attributes){let n=t.attributes;n.permission_id&&n.permission_title?this._pendingPermissions.set(e,{permission_id:n.permission_id,type:n.permission_type||"unknown",title:n.permission_title,session_id:i.sessionId,pattern:n.pattern,metadata:n.metadata}):s?.state==="waiting_permission"&&(console.log("[opencode-card] Permission entity on but missing attrs, using fallback"),this._pendingPermissions.set(e,{permission_id:"",type:"pending",title:"Permission Required",session_id:i.sessionId}))}else s?.state!=="waiting_permission"||t?.state==="off"?this._pendingPermissions.delete(e):s?.state==="waiting_permission"&&!this._pendingPermissions.has(e)&&(console.log("[opencode-card] Using fallback permission display for device:",e),this._pendingPermissions.set(e,{permission_id:"",type:"pending",title:"Permission Required",session_id:i.sessionId}))}}_updatePendingQuestions(){for(let[e,i]of this._devices){let t=i.entities.get("state");if((t?.state??"unknown")==="waiting_input"){let n=t?.attributes?.question;n&&n.questions&&n.questions.length>0?this._pendingQuestions.set(e,n):this._pendingQuestions.has(e)||this._pendingQuestions.set(e,{session_id:i.sessionId,questions:[]})}else this._pendingQuestions.delete(e)}}_getPinnedDevice(){return this._config?.device&&this._devices.get(this._config.device)||null}_getQuestionDetails(e){return this._pendingQuestions.get(e.deviceId)||null}_getPermissionDetails(e){let i=this._pendingPermissions.get(e.deviceId);if(i&&i.permission_id)return i;let t=e.entities.get("permission_pending");if(t?.state!=="on"||!t.attributes)return i||null;let s=t.attributes;return{permission_id:s.permission_id,type:s.permission_type,title:s.permission_title,session_id:e.sessionId,pattern:s.pattern,metadata:s.metadata}}_showPermission(e){this._activePermission=e,this._showPermissionModal=!0,this._render()}_hidePermissionModal(){this._showPermissionModal=!1,this._activePermission=null,this._render()}_showQuestion(e){let i=this._pendingQuestions.get(e);i&&i.questions.length>0&&(this._activeQuestion=i,this._showQuestionModal=!0,this._currentQuestionIndex=0,this._questionAnswers=i.questions.map(()=>[]),this._otherInputs=i.questions.map(()=>""),this._render())}_hideQuestionModal(){this._showQuestionModal=!1,this._activeQuestion=null,this._currentQuestionIndex=0,this._questionAnswers=[],this._otherInputs=[],this._render()}_nextQuestion(){this._activeQuestion&&this._currentQuestionIndex<this._activeQuestion.questions.length-1&&(this._currentQuestionIndex++,this._render())}_prevQuestion(){this._currentQuestionIndex>0&&(this._currentQuestionIndex--,this._render())}_updateQuestionAnswer(e,i){if(!this._activeQuestion)return;let t=this._activeQuestion.questions[this._currentQuestionIndex],s=[...this._questionAnswers[this._currentQuestionIndex]||[]];t.multiple?i?s.includes(e)||s.push(e):s=s.filter(n=>n!==e):s=i?[e]:[],this._questionAnswers[this._currentQuestionIndex]=s,this._render()}_updateOtherInput(e){this._otherInputs[this._currentQuestionIndex]=e}async _cancelQuestion(){if(!(!this._hass||!this._activeQuestion)){try{await this._hass.callService("opencode","respond_question",{session_id:this._activeQuestion.session_id,answers:[]})}catch(e){console.error("[opencode-card] Failed to cancel question:",e)}this._hideQuestionModal()}}async _submitQuestionAnswers(){if(!this._hass||!this._activeQuestion)return;let e=this._activeQuestion.questions.map((i,t)=>{let s=this._questionAnswers[t]||[],n=this._otherInputs[t]||"";return s.map(o=>o==="__other__"&&n?n:o).filter(o=>o!=="__other__")});try{await this._hass.callService("opencode","respond_question",{session_id:this._activeQuestion.session_id,answers:e}),this._hideQuestionModal(),this._showHistoryView&&setTimeout(()=>this._refreshHistory(),500)}catch(i){console.error("[opencode-card] Failed to submit question answers:",i)}}async _submitInlineQuestion(){if(!this._hass||!this._historyDeviceId)return;let e=this._pendingQuestions.get(this._historyDeviceId);if(!e||e.questions.length===0)return;let i=[],t=e.questions[0],s=[];this.querySelectorAll(".inline-question-input:checked").forEach(n=>{let o=n.dataset.label;o&&s.push(o)}),i.push(s);for(let n=1;n<e.questions.length;n++)i.push([]);try{await this._hass.callService("opencode","respond_question",{session_id:e.session_id,answers:i}),setTimeout(()=>this._refreshHistory(),500)}catch(n){console.error("[opencode-card] Failed to submit inline question:",n)}}_selectDevice(e){this._selectedDeviceId=e,this._render()}_goBack(){let e=this._selectedDeviceId?this._devices.get(this._selectedDeviceId):null;if(e?.parentSessionId){let i=this._findDeviceBySessionId(e.parentSessionId);if(i){this._selectedDeviceId=i.deviceId,this._render();return}}this._selectedDeviceId=null,this._render()}_isPinned(){return!!this._config?.device}_findDeviceBySessionId(e){for(let i of this._devices.values())if(i.sessionId===e)return i}_getChildSessions(e){let i=[];for(let t of this._devices.values())t.parentSessionId===e&&i.push(t);return i.sort((t,s)=>{let n=t.entities.get("last_activity")?.state??"",o=s.entities.get("last_activity")?.state??"";return!n&&!o?0:n?o?new Date(o).getTime()-new Date(n).getTime():-1:1}),i}async _sendChatMessage(e){if(!(!this._hass||!this._historySessionId||!e.trim()))try{if(this._historyData){let t={id:`temp_${Date.now()}`,role:"user",timestamp:new Date().toISOString(),parts:[{type:"text",content:e.trim()}]};this._historyData.messages.push(t),this._render(),setTimeout(()=>{let s=this.querySelector(".history-body");s&&(s.scrollTop=s.scrollHeight)},0)}let i={session_id:this._historySessionId,text:e.trim()};this._selectedAgent&&(i.agent=this._selectedAgent),await this._hass.callService("opencode","send_prompt",i)}catch(i){console.error("[opencode-card] Failed to send chat message:",i)}}async _showHistory(e,i){this._historyDeviceId=e,this._historySessionId=i,this._showHistoryView=!0,this._historyLoading=!0,this._selectedAgent=null;let s=this._devices.get(e)?.entities.get("state");this._lastDeviceState=s?.state??"unknown",this._manageAutoRefresh(this._lastDeviceState),this._render(),this._fetchAgents();let n=this._loadHistoryFromCache(i);n?(this._historyData=n.data,this._historyLoading=!1,this._render(),await this._fetchHistorySince(n.lastFetched)):await this._fetchFullHistory()}async _fetchAgents(){if(!(!this._hass||!this._historySessionId)){this._agentsLoading=!0;try{await this._hass.callService("opencode","get_agents",{session_id:this._historySessionId,request_id:`agents_${Date.now()}`}),setTimeout(()=>{this._agentsLoading&&(this._agentsLoading=!1,this._render())},1e4)}catch(e){console.error("[opencode-card] Failed to fetch agents:",e),this._agentsLoading=!1}}}_hideHistoryView(){this._showHistoryView=!1,this._historyLoading=!1,this._historyData=null,this._historyDeviceId=null,this._historySessionId=null,this._historyVisibleCount=10,this._isAtBottom=!0,this._availableAgents=[],this._selectedAgent=null,this._agentsLoading=!1,this._lastDeviceState=null,this._autoRefreshEnabled=!0,this._autoRefreshInterval&&(clearInterval(this._autoRefreshInterval),this._autoRefreshInterval=null),this._render()}_scrollToBottom(){let e=this.querySelector(".history-body");if(e){e.scrollTop=e.scrollHeight,this._isAtBottom=!0;let i=this.querySelector(".scroll-to-bottom-btn");i&&i.classList.add("hidden")}}_loadHistoryFromCache(e){try{let i=localStorage.getItem(J(e));if(i)return JSON.parse(i)}catch(i){console.error("[opencode-card] Failed to load history from cache:",i)}return null}_saveHistoryToCache(e,i){try{let t={data:i,lastFetched:i.fetched_at};localStorage.setItem(J(e),JSON.stringify(t))}catch(t){console.error("[opencode-card] Failed to save history to cache:",t)}}async _fetchFullHistory(){if(!(!this._hass||!this._historySessionId))try{await this._hass.callService("opencode","get_history",{session_id:this._historySessionId,limit:w.HISTORY_PAGE_SIZE,request_id:`req_${Date.now()}`})}catch(e){console.error("[opencode-card] Failed to request history:",e),this._historyLoading=!1,this._render()}}async _fetchHistorySince(e){if(!(!this._hass||!this._historySessionId))try{await this._hass.callService("opencode","get_history",{session_id:this._historySessionId,since:e,request_id:`req_${Date.now()}`})}catch(i){console.error("[opencode-card] Failed to request history update:",i)}}_handleHistoryResponse(e){if(!this._historySessionId)return;let i=e.since&&e.messages.length>0,t=!this._historyData,s=this._historyLoadingMore;if(e.since&&this._historyData){let c=new Set(this._historyData.messages.map(r=>r.id)),d=e.messages.filter(r=>!c.has(r.id));this._historyData.messages.push(...d),this._historyData.fetched_at=e.fetched_at,e.total_count!==void 0&&(this._historyData.total_count=e.total_count)}else if(s&&this._historyData){let c=new Set(this._historyData.messages.map(r=>r.id)),d=e.messages.filter(r=>!c.has(r.id));this._historyData.messages=[...d,...this._historyData.messages],this._historyData.fetched_at=e.fetched_at,this._historyVisibleCount=this._historyData.messages.length,e.total_count!==void 0&&(this._historyData.total_count=e.total_count)}else this._historyData=e,this._historyVisibleCount=Math.max(this._historyVisibleCount,e.messages.length);this._saveHistoryToCache(this._historySessionId,this._historyData),this._historyLoading=!1,this._historyLoadingMore=!1,this._render();let o=(this._historyDeviceId?this._devices.get(this._historyDeviceId):null)?.entities.get("state")?.state==="working";(t&&!s||i&&(this._isAtBottom||this._autoRefreshEnabled&&o))&&setTimeout(()=>this._scrollToBottom(),0)}_refreshHistory(){!this._historySessionId||!this._historyData||(this._historyLoading=!0,this._render(),this._fetchHistorySince(this._historyData.fetched_at))}async _respondToPermission(e){if(!this._hass||!this._activePermission)return;let{permission_id:i,session_id:t}=this._activePermission;if(!i){console.error("[opencode-card] Cannot respond: missing permission_id");return}try{await this._hass.callService("opencode","respond_permission",{session_id:t,permission_id:i,response:e}),this._hidePermissionModal()}catch(s){console.error("[opencode-card] Failed to send permission response:",s)}}_render(){let e=this._config?.title??"OpenCode Sessions",i=this._getPinnedDevice(),t=this._selectedDeviceId?this._devices.get(this._selectedDeviceId):null,s="";if(i)s=`
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
      `;else{let n=this._sortMode==="activity"?"mdi:sort-clock-descending":"mdi:sort-alphabetical-ascending",o=this._sortMode==="activity"?"Sorted by latest activity":"Sorted by name",a=this._hideUnknown?"mdi:eye-off":"mdi:eye",c=this._hideUnknown?"Showing active sessions only":"Showing all sessions";s=`
        <ha-card>
          <div class="card-header">
            <div class="name">${e}</div>
            <div class="header-actions">
              <button class="hide-unknown-toggle" title="${c}">
                <ha-icon icon="${a}"></ha-icon>
              </button>
              ${this._devices.size>1?`
                <button class="sort-toggle" title="${o}">
                  <ha-icon icon="${n}"></ha-icon>
                </button>
              `:""}
            </div>
          </div>
          <div class="card-content">
            ${this._devices.size===0?this._renderEmpty():this._renderDevices()}
          </div>
        </ha-card>
      `}this._showPermissionModal&&this._activePermission&&(s+=this._renderPermissionModal(this._activePermission)),this._showQuestionModal&&this._activeQuestion&&(s+=this._renderQuestionModal()),this._showHistoryView&&(s+=this._renderHistoryView()),this.innerHTML=`
      ${s}
      <style>
        ${this._getStyles()}
      </style>
    `,this._attachEventListeners()}_attachEventListeners(){!this._isPinned()&&!this._selectedDeviceId&&this.querySelectorAll(".device-card[data-device-id]").forEach(t=>{t.addEventListener("click",s=>{if(s.target.closest(".permission-alert")||s.target.closest(".question-alert"))return;let n=t.dataset.deviceId;n&&this._selectDevice(n)})}),this.querySelector(".back-button")?.addEventListener("click",()=>{this._goBack()}),this.querySelectorAll(".child-session-item[data-device-id]").forEach(t=>{t.addEventListener("click",()=>{let s=t.dataset.deviceId;s&&this._selectDevice(s)})}),this.querySelector(".sort-toggle")?.addEventListener("click",()=>{this._sortMode=this._sortMode==="activity"?"name":"activity",this._render()}),this.querySelector(".hide-unknown-toggle")?.addEventListener("click",()=>{this._hideUnknown=!this._hideUnknown,this._render()}),this.querySelectorAll(".permission-alert[data-device-id]").forEach(t=>{t.addEventListener("click",s=>{s.stopPropagation();let n=t.dataset.deviceId;if(n){let o=this._devices.get(n);if(o){let a=this._getPermissionDetails(o);a?this._showPermission(a):this._showPermission({permission_id:"",type:"pending",title:"Permission Required",session_id:o.sessionId})}}})}),this.querySelectorAll(".question-alert[data-device-id]").forEach(t=>{t.addEventListener("click",s=>{s.stopPropagation();let n=t.dataset.deviceId;n&&this._showQuestion(n)})}),this.querySelector(".modal-backdrop:not(.history-modal-backdrop):not(.question-modal-backdrop)")?.addEventListener("click",t=>{t.target.classList.contains("modal-backdrop")&&this._hidePermissionModal()}),this.querySelector(".modal-close:not(.history-close):not(.question-close)")?.addEventListener("click",()=>{this._hidePermissionModal()}),this.querySelector(".question-modal-backdrop")?.addEventListener("click",t=>{t.target.classList.contains("question-modal-backdrop")&&this._hideQuestionModal()}),this.querySelector(".question-close")?.addEventListener("click",()=>{this._hideQuestionModal()}),this.querySelector(".btn-cancel-question")?.addEventListener("click",()=>{this._cancelQuestion()}),this.querySelector(".btn-prev-question")?.addEventListener("click",()=>{this._prevQuestion()}),this.querySelector(".btn-next-question")?.addEventListener("click",()=>{this._nextQuestion()}),this.querySelector(".btn-submit-question")?.addEventListener("click",()=>{this._submitQuestionAnswers()}),this.querySelectorAll(".question-input").forEach(t=>{t.addEventListener("change",s=>{let n=s.target,o=n.dataset.label||"";this._updateQuestionAnswer(o,n.checked)})}),this.querySelector(".question-other-input")?.addEventListener("input",t=>{let s=t.target.value;this._updateOtherInput(s)}),this.querySelectorAll("[data-action='open-question-modal']").forEach(t=>{t.addEventListener("click",()=>{let s=t.dataset.deviceId;s&&this._showQuestion(s)})}),this.querySelectorAll("[data-action='cancel-question']").forEach(t=>{t.addEventListener("click",()=>{this._cancelQuestion()})}),this.querySelectorAll("[data-action='submit-inline-question']").forEach(t=>{t.addEventListener("click",()=>{this._submitInlineQuestion()})}),this.querySelectorAll(".inline-question-input").forEach(t=>{t.addEventListener("change",()=>{})}),this.querySelector(".btn-allow-once")?.addEventListener("click",()=>{this._respondToPermission("once")}),this.querySelector(".btn-allow-always")?.addEventListener("click",()=>{this._respondToPermission("always")}),this.querySelector(".btn-reject")?.addEventListener("click",()=>{this._respondToPermission("reject")}),this.querySelector(".open-chat-btn")?.addEventListener("click",()=>{let t=this.querySelector(".open-chat-btn"),s=t?.dataset.deviceId,n=t?.dataset.sessionId;s&&n&&this._showHistory(s,n)}),this.querySelector(".history-modal-backdrop")?.addEventListener("click",t=>{t.target.classList.contains("history-modal-backdrop")&&this._hideHistoryView()}),this.querySelector(".history-close")?.addEventListener("click",()=>{this._hideHistoryView()}),this.querySelector(".history-refresh-btn")?.addEventListener("click",()=>{this._refreshHistory()}),this.querySelector(".auto-refresh-toggle")?.addEventListener("click",()=>{this._toggleAutoRefresh()}),this.querySelector(".history-load-more")?.addEventListener("click",()=>{this._loadMoreHistory()});let e=this.querySelector(".history-body");e&&e.addEventListener("scroll",()=>{if(e.scrollTop<50&&!this._historyLoadingMore){let s=this._historyData?.messages.length||0;Math.max(0,s-this._historyVisibleCount)>0&&this._loadMoreHistory()}let t=e.scrollHeight-e.scrollTop-e.clientHeight<50;if(t!==this._isAtBottom){this._isAtBottom=t;let s=this.querySelector(".scroll-to-bottom-btn");s&&s.classList.toggle("hidden",t)}}),this.querySelector(".scroll-to-bottom-btn")?.addEventListener("click",()=>{this._scrollToBottom()}),this.querySelector(".chat-send-btn")?.addEventListener("click",()=>{let t=this.querySelector(".chat-input");t?.value.trim()&&(this._sendChatMessage(t.value.trim()),t.value="")}),this.querySelector(".chat-input")?.addEventListener("keydown",t=>{let s=t;if(s.key==="Enter"&&!s.shiftKey){t.preventDefault();let n=t.target;n?.value.trim()&&(this._sendChatMessage(n.value.trim()),n.value="")}}),this.querySelector(".agent-selector")?.addEventListener("change",t=>{let s=t.target;this._selectedAgent=s.value||null}),this.querySelectorAll(".inline-perm-btn").forEach(t=>{t.addEventListener("click",()=>{let s=t.dataset.response;s&&this._respondToInlinePermission(s)})}),this.querySelectorAll(".speak-btn").forEach(t=>{t.addEventListener("click",s=>{s.stopPropagation();let n=t.dataset.messageId;if(!n)return;if(this._speakingMessageId===n){this._stopSpeaking(),this._render();return}let o=this._historyData?.messages.find(a=>a.id===n);if(o){let a=this._extractTextFromMessage(o);a&&this._speakMessage(n,a)}})}),this.querySelectorAll(".copy-btn").forEach(t=>{t.addEventListener("click",s=>{s.stopPropagation();let n=t.dataset.messageId;if(!n)return;let o=this._historyData?.messages.find(a=>a.id===n);if(o){let a=this._getRawMarkdownFromMessage(o);this._copyToClipboard(a,t)}})});let i=this.querySelector(".history-body");i&&i.addEventListener("mouseup",()=>{setTimeout(()=>this._handleTextSelection(),10)})}async _respondToInlinePermission(e){if(!this._hass||!this._historyDeviceId)return;let i=this._pendingPermissions.get(this._historyDeviceId);if(!i?.permission_id){console.error("[opencode-card] Cannot respond: missing permission details");return}try{await this._hass.callService("opencode","respond_permission",{session_id:i.session_id,permission_id:i.permission_id,response:e}),this._pendingPermissions.delete(this._historyDeviceId),setTimeout(()=>this._refreshHistory(),500)}catch(t){console.error("[opencode-card] Failed to respond to permission:",t)}}_speakMessage(e,i){if(this._speakingMessageId&&this._stopSpeaking(),!("speechSynthesis"in window)){console.warn("[opencode-card] Speech synthesis not supported in this browser");return}let t=new SpeechSynthesisUtterance(i);t.onstart=()=>{this._speakingMessageId=e,this._render()},t.onend=()=>{this._speakingMessageId=null,this._render()},t.onerror=()=>{this._speakingMessageId=null,this._render()},window.speechSynthesis.speak(t)}_stopSpeaking(){"speechSynthesis"in window&&window.speechSynthesis.cancel(),this._speakingMessageId=null}_extractTextFromMessage(e){return e.parts.filter(i=>i.type==="text"&&i.content).map(i=>i.content).join(`
`)}async _copyToClipboard(e,i){try{if(await navigator.clipboard.writeText(e),i){let t=i.querySelector("ha-icon"),s=t?.getAttribute("icon");t&&s&&(t.setAttribute("icon","mdi:check"),i.classList.add("copied"),setTimeout(()=>{t.setAttribute("icon",s),i.classList.remove("copied")},1500))}return!0}catch(t){return console.error("[opencode-card] Failed to copy to clipboard:",t),!1}}_getRawMarkdownFromMessage(e){return e.parts.map(i=>{if(i.type==="text"&&i.content)return i.content;if(i.type==="tool_call"){let t=`**Tool: ${i.tool_name||"unknown"}**
`;return i.tool_args&&(t+="```json\n"+JSON.stringify(i.tool_args,null,2)+"\n```\n"),i.tool_output&&(t+="**Output:**\n```\n"+i.tool_output+"\n```\n"),i.tool_error&&(t+="**Error:**\n```\n"+i.tool_error+"\n```\n"),t}else if(i.type==="image")return`[Image: ${i.content||"embedded"}]`;return""}).filter(Boolean).join(`

`)}_handleTextSelection(){let e=window.getSelection();if(!e||e.isCollapsed)return;let i=e.toString().trim();if(!i)return;let t=this.querySelector(".history-body");if(!t)return;let s=e.anchorNode,n=e.focusNode;!s||!n||!t.contains(s)||!t.contains(n)||this._copyToClipboard(i)}async _loadMoreHistory(){if(!this._historyData||this._historyLoadingMore||!this._hass||!this._historySessionId)return;let e=this._historyData.total_count??this._historyData.messages.length;if(this._historyData.messages.length>=e){let n=this._historyData.messages.length;if(Math.max(0,n-this._historyVisibleCount)<=0)return;this._historyVisibleCount+=w.HISTORY_PAGE_SIZE,this._render();return}this._historyLoadingMore=!0,this._render();let s=this.querySelector(".history-body")?.scrollHeight||0;try{await this._hass.callService("opencode","get_history",{session_id:this._historySessionId,request_id:`loadmore_${Date.now()}`}),setTimeout(()=>{this._historyLoadingMore&&(this._historyLoadingMore=!1,this._render());let n=this.querySelector(".history-body");if(n&&s>0){let a=n.scrollHeight-s;n.scrollTop=a}},500)}catch(n){console.error("[opencode-card] Failed to load more history:",n),this._historyLoadingMore=!1,this._render()}}_renderPermissionModal(e){let i=!!e.permission_id,t=i?"":"disabled";return`
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
                  ${Object.entries(e.metadata).map(([s,n])=>`
                    <div class="metadata-item">
                      <span class="metadata-key">${s}:</span>
                      <span class="metadata-value">${typeof n=="object"?JSON.stringify(n):String(n)}</span>
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
    `}_renderQuestionModal(){if(!this._activeQuestion||this._activeQuestion.questions.length===0)return"";let e=this._activeQuestion.questions,i=e[this._currentQuestionIndex],t=e.length,s=this._currentQuestionIndex===t-1,n=this._currentQuestionIndex===0;this._questionAnswers.length!==t&&(this._questionAnswers=e.map(()=>[]),this._otherInputs=e.map(()=>""));let o=this._questionAnswers[this._currentQuestionIndex]||[],a=this._otherInputs[this._currentQuestionIndex]||"",c=o.includes("__other__");return`
      <div class="modal-backdrop question-modal-backdrop">
        <div class="modal question-modal">
          <div class="modal-header question-header">
            <ha-icon icon="mdi:comment-question"></ha-icon>
            <span class="modal-title">${i.header||"Question"}</span>
            ${t>1?`<span class="question-progress">${this._currentQuestionIndex+1} / ${t}</span>`:""}
            <button class="modal-close question-close">
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>
          <div class="modal-body question-body">
            <div class="question-text">${i.question}</div>
            <div class="question-options">
              ${i.options.map((d,r)=>{let h=`q-${this._currentQuestionIndex}-opt-${r}`,u=o.includes(d.label);return`
                  <div class="question-option ${u?"selected":""}">
                    <input type="${i.multiple?"checkbox":"radio"}" 
                           name="question-${this._currentQuestionIndex}" 
                           id="${h}"
                           class="question-input"
                           data-label="${this._escapeHtml(d.label)}"
                           ${u?"checked":""}>
                    <label for="${h}" class="question-option-label">
                      <span class="question-option-text">${d.label}</span>
                      ${d.description?`<span class="question-option-desc">${d.description}</span>`:""}
                    </label>
                  </div>
                `}).join("")}
              <div class="question-option other-option ${c?"selected":""}">
                <input type="${i.multiple?"checkbox":"radio"}" 
                       name="question-${this._currentQuestionIndex}" 
                       id="q-${this._currentQuestionIndex}-other"
                       class="question-input question-other-check"
                       data-label="__other__"
                       ${c?"checked":""}>
                <label for="q-${this._currentQuestionIndex}-other" class="question-option-label">
                  <span class="question-option-text">Other</span>
                </label>
              </div>
              ${c?`
                <div class="question-other-input-container">
                  <input type="text" 
                         class="question-other-input" 
                         placeholder="Enter your answer..."
                         value="${this._escapeHtml(a)}">
                </div>
              `:""}
            </div>
          </div>
          <div class="modal-actions question-actions">
            <button class="btn btn-cancel-question">
              <ha-icon icon="mdi:close"></ha-icon>
              Cancel
            </button>
            ${n?"":`
              <button class="btn btn-prev-question">
                <ha-icon icon="mdi:chevron-left"></ha-icon>
                Previous
              </button>
            `}
            ${s?`
              <button class="btn btn-submit-question">
                <ha-icon icon="mdi:send"></ha-icon>
                Submit
              </button>
            `:`
              <button class="btn btn-next-question">
                Next
                <ha-icon icon="mdi:chevron-right"></ha-icon>
              </button>
            `}
          </div>
        </div>
      </div>
    `}_renderHistoryView(){let e=this._historyData?.fetched_at?new Date(this._historyData.fetched_at).toLocaleString():"",n=((this._historyDeviceId?this._devices.get(this._historyDeviceId):null)?.entities.get("state")?.state??"unknown")==="working",o=this._autoRefreshEnabled?"mdi:sync":"mdi:sync-off",a=this._autoRefreshEnabled?"Auto-refresh ON (click to disable)":"Auto-refresh OFF (click to enable)";return`
      <div class="modal-backdrop history-modal-backdrop">
        <div class="modal history-modal chat-modal">
          <div class="modal-header history-header">
            <ha-icon icon="mdi:chat"></ha-icon>
            <span class="modal-title">${this._historyData?.session_title||"Chat"}</span>
            <div class="history-header-actions">
              ${n?'<span class="working-indicator"><ha-icon icon="mdi:loading" class="spinning"></ha-icon></span>':""}
              <button class="auto-refresh-toggle ${this._autoRefreshEnabled?"enabled":""}" title="${a}">
                <ha-icon icon="${o}"></ha-icon>
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
      `;if(this._availableAgents.length===0)return"";let e=this._availableAgents.filter(t=>t.mode==="primary"||t.mode==="all");if(e.length===0)return"";let i=e.map(t=>{let s=this._selectedAgent===t.name?"selected":"",n=t.description?` - ${t.description}`:"";return`<option value="${t.name}" ${s}>${t.name}${n}</option>`}).join("");return`
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
      `;let e=this._historyData.messages.length,i=this._historyData.total_count??e,t=Math.max(0,e-this._historyVisibleCount),s=this._historyData.messages.slice(t),n=t>0,o=e<i,a=n||o,c="";if(a){let d=t,r=i-e,h=d+r;c+=`
        <div class="history-load-more" data-action="load-more">
          <ha-icon icon="${this._historyLoadingMore?"mdi:loading":"mdi:chevron-up"}" class="${this._historyLoadingMore?"spinning":""}"></ha-icon>
          <span>${this._historyLoadingMore?"Loading...":`Load more (${h} older messages)`}</span>
        </div>
      `}return c+=s.map(d=>this._renderHistoryMessage(d)).join(""),c+=this._renderInlinePermission(),c+=this._renderInlineQuestion(),c}_renderInlinePermission(){if(!this._historyDeviceId)return"";let e=this._devices.get(this._historyDeviceId);if(!e||(e.entities.get("state")?.state??"unknown")!=="waiting_permission")return"";let s=this._pendingPermissions.get(this._historyDeviceId),n=s?.permission_id;return`
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
                ${Object.entries(s.metadata).map(([o,a])=>`
                  <div class="inline-metadata-item">
                    <span class="inline-metadata-key">${o}:</span>
                    <span class="inline-metadata-value">${typeof a=="object"?JSON.stringify(a):String(a)}</span>
                  </div>
                `).join("")}
              </div>
            </div>
          `:""}
          ${n?"":`
            <div class="inline-permission-loading">
              <ha-icon icon="mdi:loading" class="spinning"></ha-icon>
              <span>Loading details...</span>
            </div>
          `}
        </div>
        <div class="inline-permission-actions">
          <button class="inline-perm-btn reject" data-response="reject" ${n?"":"disabled"}>
            <ha-icon icon="mdi:close-circle"></ha-icon>
            Reject
          </button>
          <button class="inline-perm-btn allow-once" data-response="once" ${n?"":"disabled"}>
            <ha-icon icon="mdi:check"></ha-icon>
            Allow Once
          </button>
          <button class="inline-perm-btn allow-always" data-response="always" ${n?"":"disabled"}>
            <ha-icon icon="mdi:check-all"></ha-icon>
            Always
          </button>
        </div>
      </div>
    `}_renderInlineQuestion(){if(!this._historyDeviceId)return"";let e=this._devices.get(this._historyDeviceId);if(!e||(e.entities.get("state")?.state??"unknown")!=="waiting_input")return"";let s=this._pendingQuestions.get(this._historyDeviceId);if(!(s&&s.questions.length>0))return`
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
      `;let o=s.questions[0],a=s.questions.length;return`
      <div class="inline-question">
        <div class="inline-question-header">
          <ha-icon icon="mdi:comment-question"></ha-icon>
          <span class="inline-question-title">${o.header||"Question"}</span>
          ${a>1?`<span class="inline-question-count">${a} questions</span>`:""}
        </div>
        <div class="inline-question-body">
          <div class="inline-question-text">${o.question}</div>
          <div class="inline-question-options">
            ${o.options.slice(0,3).map((c,d)=>`
              <div class="inline-question-option" data-option-index="${d}">
                <input type="${o.multiple?"checkbox":"radio"}" 
                       name="inline-q-0" 
                       id="inline-opt-${d}" 
                       class="inline-question-input"
                       data-label="${this._escapeHtml(c.label)}">
                <label for="inline-opt-${d}" class="inline-question-label">
                  <span class="option-label">${c.label}</span>
                  ${c.description?`<span class="option-desc">${c.description}</span>`:""}
                </label>
              </div>
            `).join("")}
            ${o.options.length>3?`
              <div class="inline-question-more">
                +${o.options.length-3} more options
              </div>
            `:""}
          </div>
        </div>
        <div class="inline-question-actions">
          <button class="inline-question-btn cancel" data-action="cancel-question">
            <ha-icon icon="mdi:close"></ha-icon>
            Cancel
          </button>
          ${a>1||o.options.length>3?`
            <button class="inline-question-btn open-modal" data-action="open-question-modal" data-device-id="${this._historyDeviceId}">
              <ha-icon icon="mdi:arrow-expand"></ha-icon>
              ${a>1?"Answer All":"View All Options"}
            </button>
          `:`
            <button class="inline-question-btn submit" data-action="submit-inline-question">
              <ha-icon icon="mdi:send"></ha-icon>
              Submit
            </button>
          `}
        </div>
      </div>
    `}_renderHistoryMessage(e){let i=e.role==="user",t=Q(e.timestamp),s=e.parts.map(r=>{if(r.type==="text"&&r.content)return`<div class="history-text">${this._escapeHtml(r.content)}</div>`;if(r.type==="tool_call"){let h=r.tool_output||r.tool_error;return`
          <div class="history-tool">
            <div class="tool-header">
              <ha-icon icon="mdi:tools"></ha-icon>
              <span class="tool-name">${r.tool_name||"unknown"}</span>
            </div>
            ${r.tool_args?`<pre class="tool-args">${this._escapeHtml(JSON.stringify(r.tool_args,null,2))}</pre>`:""}
            ${h?`
              <div class="tool-result ${r.tool_error?"error":""}">
                <span class="tool-result-label">${r.tool_error?"Error:":"Output:"}</span>
                <pre class="tool-output">${this._escapeHtml(r.tool_error||r.tool_output||"")}</pre>
              </div>
            `:""}
          </div>
        `}else if(r.type==="image")return`<div class="history-image"><ha-icon icon="mdi:image"></ha-icon> ${r.content||"Image"}</div>`;return""}).join(""),n="";if(!i&&(e.model||e.tokens_input||e.cost)){let r=[];e.model&&r.push(e.model),(e.tokens_input||e.tokens_output)&&r.push(`${e.tokens_input||0}/${e.tokens_output||0} tokens`),e.cost&&r.push(`$${e.cost.toFixed(4)}`),n=`<div class="message-meta">${r.join(" \xB7 ")}</div>`}let o=e.parts.some(r=>r.type==="text"&&r.content),a=this._speakingMessageId===e.id,c=!i&&o?`
      <button class="speak-btn ${a?"speaking":""}" data-message-id="${e.id}" title="${a?"Stop speaking":"Read aloud"}">
        <ha-icon icon="${a?"mdi:stop":"mdi:volume-high"}"></ha-icon>
      </button>
    `:"",d=`
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
            ${d}
            ${c}
          </div>
        </div>
        <div class="message-content">
          ${s}
        </div>
        ${n}
      </div>
    `}_escapeHtml(e){let i=document.createElement("div");return i.textContent=e,i.innerHTML}_renderEmpty(){return`
      <div class="empty-state">
        <ha-icon icon="mdi:code-braces-box"></ha-icon>
        <p>No OpenCode sessions found</p>
      </div>
    `}_renderDevices(){let e=["idle","working","waiting_permission","waiting_input","error"],i=Array.from(this._devices.values()).filter(t=>!t.parentSessionId);return this._hideUnknown&&(i=i.filter(t=>{let s=t.entities.get("state")?.state??"";return e.includes(s)})),this._sortMode==="activity"?i.sort((t,s)=>{let n=t.entities.get("last_activity")?.state??"",o=s.entities.get("last_activity")?.state??"";if(!n&&!o)return 0;if(!n)return 1;if(!o)return-1;let a=new Date(n).getTime(),c=new Date(o).getTime();return isNaN(a)&&isNaN(c)?0:isNaN(a)?1:isNaN(c)?-1:c-a}):i.sort((t,s)=>{let n=t.deviceName.replace("OpenCode - ","").toLowerCase(),o=s.deviceName.replace("OpenCode - ","").toLowerCase();return n.localeCompare(o)}),i.map(t=>this._renderDevice(t)).join("")}_renderDetailView(e,i){let t=e.entities.get("state"),s=e.entities.get("session_title"),n=e.entities.get("model"),o=e.entities.get("current_tool"),a=e.entities.get("cost"),c=e.entities.get("tokens_input"),d=e.entities.get("tokens_output"),r=e.entities.get("last_activity"),h=t?.state??"unknown",u=b[h]||b.unknown,x=s?.state??"Unknown Session",v=n?.state??"unknown",$=o?.state??"none",D=a?.state??"0",H=c?.state??"0",I=d?.state??"0",y=r?.state??"",_=t?.attributes?.agent||null,g=t?.attributes?.current_agent||null,f=t?.attributes?.hostname||null,S=this._getChildSessions(e.sessionId),L=!!e.parentSessionId,O="";y&&(O=new Date(y).toLocaleTimeString());let E=this._getPermissionDetails(e),M="";if(E){let p=!!E.permission_id;M=`
        <div class="permission-alert pinned clickable" data-device-id="${e.deviceId}">
          <ha-icon icon="mdi:shield-alert"></ha-icon>
          <div class="permission-details">
            <div class="permission-title">${E.title}</div>
            <div class="permission-type">${E.type}${p?"":" (loading...)"}</div>
          </div>
          <ha-icon icon="mdi:chevron-right" class="permission-chevron"></ha-icon>
        </div>
      `}else h==="waiting_permission"&&(M=`
        <div class="permission-alert pinned clickable" data-device-id="${e.deviceId}">
          <ha-icon icon="mdi:shield-alert"></ha-icon>
          <div class="permission-details">
            <div class="permission-title">Permission Required</div>
            <div class="permission-type">Tap to view details</div>
          </div>
          <ha-icon icon="mdi:chevron-right" class="permission-chevron"></ha-icon>
        </div>
      `);let k=this._getQuestionDetails(e),A="";if(k&&k.questions.length>0){let p=k.questions[0];A=`
        <div class="question-alert pinned clickable" data-device-id="${e.deviceId}">
          <ha-icon icon="mdi:comment-question"></ha-icon>
          <div class="question-details">
            <div class="question-title">${p.header||"Question"}</div>
            <div class="question-preview">${k.questions.length>1?`${k.questions.length} questions`:"Tap to answer"}</div>
          </div>
          <ha-icon icon="mdi:chevron-right" class="question-chevron"></ha-icon>
        </div>
      `}else h==="waiting_input"&&(A=`
        <div class="question-alert pinned clickable" data-device-id="${e.deviceId}">
          <ha-icon icon="mdi:comment-question"></ha-icon>
          <div class="question-details">
            <div class="question-title">Input Required</div>
            <div class="question-preview">Loading question...</div>
          </div>
          <ha-icon icon="mdi:chevron-right" class="question-chevron"></ha-icon>
        </div>
      `);let G=i||L?`
      <button class="back-button" data-action="back">
        <ha-icon icon="mdi:arrow-left"></ha-icon>
        <span>${L?"Parent Session":"Back"}</span>
      </button>
    `:"",K=L?`
      <div class="sub-agent-badge">
        <ha-icon icon="mdi:source-branch"></ha-icon>
        <span>Sub-agent Session</span>
      </div>
    `:"",j=["working","waiting_permission","waiting_input"],z=S.filter(p=>j.includes(p.entities.get("state")?.state??"")),R=S.filter(p=>!j.includes(p.entities.get("state")?.state??"")),F=(p,m)=>{let N=p.entities.get("state")?.state??"unknown",B=b[N]||b.unknown,Y=p.entities.get("session_title")?.state??"Unknown",U=p.entities.get("last_activity")?.state??"",V=U?Q(U):null,W=p.entities.get("current_tool")?.state??"none";return`
        <div class="child-session-item clickable ${m?"active":""}" data-device-id="${p.deviceId}">
          <div class="child-session-status ${N==="working"?"pulse":""}">
            <ha-icon icon="${B.icon}" style="color: ${B.color}"></ha-icon>
          </div>
          <div class="child-session-info">
            <div class="child-session-title">${Y}</div>
            ${m&&W!=="none"?`<div class="child-session-tool"><ha-icon icon="mdi:tools"></ha-icon> ${W}</div>`:""}
            ${!m&&V?`<div class="child-session-activity">${V.display}</div>`:""}
          </div>
          <ha-icon icon="mdi:chevron-right" class="child-session-chevron"></ha-icon>
        </div>
      `},T="";if(z.length>0){let p=z.map(m=>F(m,!0)).join("");T+=`
        <div class="child-sessions-section active-section">
          <div class="child-sessions-header active">
            <ha-icon icon="mdi:run-fast"></ha-icon>
            <span>Active Sub-agents (${z.length})</span>
          </div>
          <div class="child-sessions-list">
            ${p}
          </div>
        </div>
      `}if(R.length>0){let p=R.map(m=>F(m,!1)).join("");T+=`
        <div class="child-sessions-section">
          <div class="child-sessions-header">
            <ha-icon icon="mdi:source-branch"></ha-icon>
            <span>Sub-agent History (${R.length})</span>
          </div>
          <div class="child-sessions-list">
            ${p}
          </div>
        </div>
      `}return`
      <div class="detail-view">
        ${G}
        ${K}
        <div class="detail-header">
          <div class="detail-status ${h==="working"?"pulse":""}" style="background: ${u.color}20; border-color: ${u.color}">
            <ha-icon icon="${u.icon}" style="color: ${u.color}"></ha-icon>
            <span class="status-text" style="color: ${u.color}">${u.label}</span>
          </div>
          <div class="detail-project-info">
            <div class="detail-project">${e.deviceName.replace("OpenCode - ","")}</div>
            ${f?`<div class="detail-hostname"><ha-icon icon="mdi:server"></ha-icon> ${f}</div>`:""}
          </div>
        </div>

        <div class="detail-session">
          <ha-icon icon="mdi:message-text"></ha-icon>
          <span class="session-title">${x}</span>
        </div>

        ${M}
        ${A}

        <div class="detail-info">
          <div class="detail-row">
            <ha-icon icon="mdi:brain"></ha-icon>
            <span class="detail-label">Model</span>
            <span class="detail-value mono">${v}</span>
          </div>
          ${_?`
          <div class="detail-row">
            <ha-icon icon="mdi:account-cog"></ha-icon>
            <span class="detail-label">Agent</span>
            <span class="detail-value agent-badge">${_}${g&&g!==_?` <span class="sub-agent-indicator"><ha-icon icon="mdi:arrow-right"></ha-icon> ${g}</span>`:""}</span>
          </div>
          `:""}
          ${$!=="none"?`
          <div class="detail-row highlight">
            <ha-icon icon="mdi:tools"></ha-icon>
            <span class="detail-label">Tool</span>
            <span class="detail-value mono tool-active">${$}</span>
          </div>
          `:""}
          <div class="detail-row">
            <ha-icon icon="mdi:clock-outline"></ha-icon>
            <span class="detail-label">Last Activity</span>
            <span class="detail-value">${O||"\u2014"}</span>
          </div>
        </div>

        ${T}

        <div class="detail-stats">
          <div class="stat">
            <ha-icon icon="mdi:currency-usd"></ha-icon>
            <span class="stat-value">$${parseFloat(D).toFixed(4)}</span>
            <span class="stat-label">Cost</span>
          </div>
          <div class="stat">
            <ha-icon icon="mdi:arrow-right-bold"></ha-icon>
            <span class="stat-value">${Number(H).toLocaleString()}</span>
            <span class="stat-label">In</span>
          </div>
          <div class="stat">
            <ha-icon icon="mdi:arrow-left-bold"></ha-icon>
            <span class="stat-value">${Number(I).toLocaleString()}</span>
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
    `}_renderDevice(e){let i=e.entities.get("state"),t=e.entities.get("session_title"),s=e.entities.get("model"),n=e.entities.get("current_tool"),o=e.entities.get("cost"),a=e.entities.get("tokens_input"),c=e.entities.get("tokens_output"),d=e.entities.get("last_activity"),r=i?.state??"unknown",h=b[r]||b.unknown,u=t?.state??"Unknown Session",x=s?.state??"unknown",v=n?.state??"none",$=o?.state??"0",D=a?.state??"0",H=c?.state??"0",I=d?.state??"",y=I?Q(I):null,_=i?.attributes?.current_agent||null,g=this._getPermissionDetails(e),f="";if(g){let S=!!g.permission_id;f=`
        <div class="permission-alert clickable" data-device-id="${e.deviceId}">
          <ha-icon icon="mdi:shield-alert"></ha-icon>
          <div class="permission-details">
            <div class="permission-title">${g.title}</div>
            <div class="permission-type">${g.type}${S?"":" (loading...)"}</div>
          </div>
          <ha-icon icon="mdi:chevron-right" class="permission-chevron"></ha-icon>
        </div>
      `}else r==="waiting_permission"&&(f=`
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
          <div class="device-status ${r==="working"?"pulse":""}">
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
            <span class="info-value">${u}</span>
          </div>
          <div class="info-row">
            <ha-icon icon="mdi:brain"></ha-icon>
            <span class="info-label">Model:</span>
            <span class="info-value model">${x}</span>
          </div>
          ${v!=="none"?`
          <div class="info-row">
            <ha-icon icon="mdi:tools"></ha-icon>
            <span class="info-label">Tool:</span>
            <span class="info-value tool">${v}</span>
          </div>
          `:""}
          ${_?`
          <div class="info-row">
            <ha-icon icon="mdi:account-switch"></ha-icon>
            <span class="info-label">Sub-agent:</span>
            <span class="info-value sub-agent">${_}</span>
          </div>
          `:""}
          <div class="info-row stats">
            <ha-icon icon="mdi:currency-usd"></ha-icon>
            <span class="stat-value">$${parseFloat($).toFixed(4)}</span>
            <ha-icon icon="mdi:arrow-right-bold"></ha-icon>
            <span class="stat-value">${D}</span>
            <ha-icon icon="mdi:arrow-left-bold"></ha-icon>
            <span class="stat-value">${H}</span>
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
    `}static getConfigElement(){return document.createElement("opencode-card-editor")}static getStubConfig(){return{title:"OpenCode Sessions"}}};w.HISTORY_PAGE_SIZE=10;var C=w,P=class extends HTMLElement{set hass(l){this._hass=l}setConfig(l){this._config=l,this._render()}_render(){this._config&&(this.innerHTML=`
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
        <input type="text" id="title" value="${this._config.title||""}" placeholder="OpenCode Sessions">
        <span class="hint">Card header title</span>
      </div>
      
      <div class="editor-row">
        <label for="device">Pin to Device (optional)</label>
        <input type="text" id="device" value="${this._config.device||""}" placeholder="Device ID">
        <span class="hint">Pin card to a specific device ID</span>
      </div>
      
      <div class="editor-row">
        <label for="sort_by">Default Sort</label>
        <select id="sort_by">
          <option value="activity" ${this._config.sort_by!=="name"?"selected":""}>By Activity (newest first)</option>
          <option value="name" ${this._config.sort_by==="name"?"selected":""}>By Name (alphabetical)</option>
        </select>
        <span class="hint">Default sorting for session list</span>
      </div>
      
      <div class="editor-row">
        <div class="checkbox-row">
          <input type="checkbox" id="hide_unknown" ${this._config.hide_unknown?"checked":""}>
          <label for="hide_unknown">Hide unknown sessions by default</label>
        </div>
        <span class="hint">Hide sessions with unknown/unavailable state</span>
      </div>
      
      <div class="editor-row">
        <label for="working_refresh_interval">Auto-refresh Interval (seconds)</label>
        <input type="number" id="working_refresh_interval" value="${this._config.working_refresh_interval||10}" min="1" max="60">
        <span class="hint">History refresh interval when session is working</span>
      </div>
    `,this._attachListeners())}_attachListeners(){this.querySelector("#title")?.addEventListener("input",l=>{this._updateConfig("title",l.target.value||void 0)}),this.querySelector("#device")?.addEventListener("input",l=>{this._updateConfig("device",l.target.value||void 0)}),this.querySelector("#sort_by")?.addEventListener("change",l=>{let e=l.target.value;this._updateConfig("sort_by",e==="activity"?void 0:e)}),this.querySelector("#hide_unknown")?.addEventListener("change",l=>{this._updateConfig("hide_unknown",l.target.checked||void 0)}),this.querySelector("#working_refresh_interval")?.addEventListener("input",l=>{let e=parseInt(l.target.value,10);this._updateConfig("working_refresh_interval",isNaN(e)||e===10?void 0:e)})}_updateConfig(l,e){if(!this._config)return;let i={...this._config};e===void 0?delete i[l]:i[l]=e,this._config=i;let t=new CustomEvent("config-changed",{detail:{config:i},bubbles:!0,composed:!0});this.dispatchEvent(t)}};customElements.define("opencode-card-editor",P);customElements.define("opencode-card",C);window.customCards=window.customCards||[];window.customCards.push({type:"opencode-card",name:"OpenCode Card",description:"Display and interact with OpenCode AI coding assistant sessions"});
