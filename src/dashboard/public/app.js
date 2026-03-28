var CURRENT_PAGE = 'chat';
var SELECTED_MODEL = localStorage.getItem('gc_model') || 'google/gemini-2.0-flash-001'; 
var DIALOGUE_ID = Number(localStorage.getItem('gc_dialogue_id') || '0') || 0;
var MODELS = null;
var SIDEBAR_HIDDEN = false;
var _emailCache = [];           // persists email list across tab switches
window.scanPollInterval = null; // persists scan polling across tab switches

var urlParams = new URLSearchParams(window.location.search);
var TOKEN = urlParams.get('token') || localStorage.getItem('gc_token') || "";
if(urlParams.get('token')) localStorage.setItem('gc_token', TOKEN);

function withToken(path){
  const u = new URL(path, window.location.origin);
  if(TOKEN) u.searchParams.set('token', TOKEN);
  return u.toString();
}

function modelLabel(id){
  if(MODELS && Array.isArray(MODELS)){
    const m = MODELS.find(x => x.id === id);
    if(m) return m.label || m.id;
  }
  return id;
}

async function jf(u, d){ 
  try { 
    var url = new URL(u, window.location.origin);
    if(TOKEN) url.searchParams.set('token', TOKEN);
    var r = await fetch(url); 
    if(!r.ok) return d;
    const json = await r.json();
    return json; 
  } catch(e) { return d; } 
}

function xs(s){ if(!s) return ""; var e=document.createElement('div'); e.textContent=s; return e.innerHTML; }
function decodeHtml(s){ if(!s) return ""; var e=document.createElement('textarea'); e.innerHTML=s; return e.value; }

window.toggleThinking = function(el) {
  var body = el.nextElementSibling;
  var arrow = el.querySelector('.thinking-arrow');
  if(!body) return;
  if(body.classList.contains('open')) {
    body.classList.remove('open');
    if(arrow) arrow.classList.remove('open');
  } else {
    body.classList.add('open');
    if(arrow) arrow.classList.add('open');
  }
};

var CV_LIST = [];
async function loadCvs(){ CV_LIST = await jf('/api/cvs', []); return CV_LIST; }

function cvPickerHtml(selectId, includeNone){
  let opts = includeNone ? '<option value="">— No CV —</option>' : '';
  (CV_LIST || []).forEach(c => {
    opts += '<option value="' + c.id + '">' + xs(c.file_name) + ' (' + xs(c.job_type) + '/' + xs(c.language) + ')</option>';
  });
  return '<select id="' + selectId + '" style="height:34px; background:#151b2b; border:1px solid #ffffff1a; color:#e4e4e7; border-radius:8px; padding:0 12px; font-size:11px;">' + opts + '</select>';
}

function applyTheme(t){
  const root = document.documentElement;
  if(t === 'light'){
    root.style.setProperty('--bg', '#f5f5f7');
    root.style.setProperty('--sb-bg', '#ffffff');
    root.style.setProperty('--body-bg', '#f0f0f3');
    root.style.setProperty('--kpi-bg', '#ffffff');
    root.style.setProperty('--border', '#e4e4e7');
    root.style.setProperty('--t', '#18181b');
    root.style.setProperty('--t2', '#52525b');
    root.style.setProperty('--t3', '#a1a1aa');
  } else {
    root.style.setProperty('--bg', '#0a0e1a');
    root.style.setProperty('--sb-bg', '#080a10');
    root.style.setProperty('--body-bg', '#05060a');
    root.style.setProperty('--kpi-bg', '#080a12');
    root.style.setProperty('--border', '#ffffff0f');
    root.style.setProperty('--t', '#ffffff');
    root.style.setProperty('--t2', '#a1a1aa');
    root.style.setProperty('--t3', '#71717a');
  }
}

async function pollTask(taskId, cb){
  if(!taskId) return;
  while(true){
    var t = await jf('/api/tasks/' + taskId, null);
    if(!t) break;
    if(cb) cb(t);
    if(t.status === 'done' || t.status === 'error' || t.status === 'cancelled') break;
    await new Promise(r => setTimeout(r, 1200));
  }
}

function gcLoaderHtml(id, color, msg) {
  color = color || 'blue';
  msg = msg || 'Processing…';
  return '<div id="' + id + '" class="gc-loading-overlay">' +
    '<div class="gc-spinner lg ' + color + '"></div>' +
    '<div class="gc-loading-text" id="' + id + '-msg">' + msg + '</div>' +
    '<div class="gc-progress" style="max-width:240px;"><div class="gc-progress-bar indeterminate ' + color + '"></div></div>' +
    '<div class="gc-loading-elapsed" id="' + id + '-time">0s</div>' +
    '</div>';
}

var _gcTimers = {};
function gcStartTimer(id) {
  var start = Date.now();
  _gcTimers[id] = setInterval(function(){
    var el = document.getElementById(id + '-time');
    if(!el){ clearInterval(_gcTimers[id]); return; }
    var s = Math.floor((Date.now() - start) / 1000);
    el.textContent = s < 60 ? s + 's' : Math.floor(s/60) + 'm ' + (s%60) + 's';
  }, 1000);
}
function gcStopTimer(id) {
  if(_gcTimers[id]){ clearInterval(_gcTimers[id]); delete _gcTimers[id]; }
}
function gcUpdateMsg(id, msg) {
  var el = document.getElementById(id + '-msg');
  if(el) el.textContent = msg || '';
}
function gcSetProgress(id, pct) {
  var bar = document.querySelector('#' + id + ' .gc-progress-bar');
  if(!bar) return;
  bar.classList.remove('indeterminate');
  bar.style.width = Math.min(100, Math.max(0, pct)) + '%';
}

window.swPage = function(p){ 
  if(CURRENT_PAGE === p) return;
  CURRENT_PAGE = p; 
  render(); 
};

window.toggleModelDropdown = function(e) {
  if(e) e.stopPropagation();
  const d = document.getElementById('model-dropdown');
  if(d) d.classList.toggle('hidden');
}

window.selectModel = function(m) {
  SELECTED_MODEL = m;
  localStorage.setItem('gc_model', m);
  const lbl = document.getElementById('model-label');
  if(lbl) lbl.textContent = modelLabel(m) + ' ▾';
  const d = document.getElementById('model-dropdown');
  if(d) d.classList.add('hidden');

  // Persist model selection to the active dialogue
  if(DIALOGUE_ID) {
    fetch(withToken('/api/dialogues/' + DIALOGUE_ID), {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ model: m })
    }).catch(()=>{});
  }
}

window.toggleSidebar = function() {
  SIDEBAR_HIDDEN = !SIDEBAR_HIDDEN;
  const sb = document.getElementById('sidebar');
  if(sb) sb.style.display = SIDEBAR_HIDDEN ? 'none' : 'flex';
  const fab = document.getElementById('sb-fab');
  if(fab) {
    if (SIDEBAR_HIDDEN) fab.classList.remove('hidden');
    else fab.classList.add('hidden');
  }
  const btn = document.querySelector('.hide-sb-btn');
  if(btn && window.lucide) {
    btn.setAttribute('data-lucide', SIDEBAR_HIDDEN ? 'panel-left-open' : 'panel-left-close');
    window.lucide.createIcons();
  }
}

window.toggleSpotlight = function(e) {
  if(e) e.stopPropagation();
  const overlay = document.getElementById('spotlight-overlay');
  if(overlay) {
    overlay.classList.toggle('hidden');
    if(!overlay.classList.contains('hidden')) {
      const input = document.getElementById('spotlight-input');
      if(input){ input.focus(); input.value = ''; }
      const sres = document.querySelector('.s-res');
      if(sres) sres.innerHTML = '<div style="color:#71717a; padding:16px; font-size:13px;">Type to search jobs, memories, or commands…</div>';
    }
  }
}

var spotlightDebounce = null;
document.addEventListener('input', function(e){
  if(e.target && e.target.id === 'spotlight-input'){
    clearTimeout(spotlightDebounce);
    spotlightDebounce = setTimeout(async () => {
      const q = e.target.value.trim();
      const res = document.querySelector('.s-res');
      if(!res || !q){ if(res) res.innerHTML = '<div style="color:#71717a; padding:16px; font-size:13px;">Type to search jobs, memories, or commands…</div>'; return; }
      res.innerHTML = '<div style="color:#71717a; padding:16px;">Searching…</div>';
      const [jobs, mems] = await Promise.all([
        jf('/api/jobs?limit=50', []),
        jf('/api/memories/search?q=' + encodeURIComponent(q) + '&limit=10', [])
      ]);
      const ql = q.toLowerCase();
      const matchedJobs = jobs.filter(j => ((j.title||'')+(j.company||'')).toLowerCase().includes(ql)).slice(0,5);
      let html = '';
      if(matchedJobs.length){
        html += '<div style="padding:8px 16px; font-size:10px; font-weight:700; color:#71717a; letter-spacing:1px;">JOBS</div>';
        matchedJobs.forEach(j => {
          html += '<div style="padding:8px 16px; cursor:pointer; border-radius:8px;" onmouseover="this.style.background=\'#ffffff0a\'" onmouseout="this.style.background=\'\'" onclick="toggleSpotlight(); swPage(\'jobs\'); localStorage.setItem(\'gc_job_sel\',\'' + j.id + '\');render();"><div style="font-size:13px; color:#e4e4e7;">' + xs(j.title) + '</div><div style="font-size:11px; color:#71717a;">' + xs(j.company) + '</div></div>';
        });
      }
      if(mems.length){
        html += '<div style="padding:8px 16px; font-size:10px; font-weight:700; color:#71717a; letter-spacing:1px; margin-top:8px;">MEMORIES</div>';
        mems.slice(0,5).forEach(m => {
          html += '<div style="padding:8px 16px; cursor:pointer; border-radius:8px;" onmouseover="this.style.background=\'#ffffff0a\'" onmouseout="this.style.background=\'\'" onclick="toggleSpotlight(); swPage(\'memories\'); localStorage.setItem(\'gc_mem_sel\',\'' + m.id + '\');render();"><div style="font-size:12px; color:#e4e4e7; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + xs(m.content) + '</div></div>';
        });
      }
      if(!html) html = '<div style="color:#71717a; padding:16px;">No results for "' + xs(q) + '"</div>';
      res.innerHTML = html;
    }, 300);
  }
});

async function updateKPIs(data) {
  if(!data) {
    const k = await jf('/api/kpis', null);
    if(!k) return;

    data = [
      { n: k.messages || 0, l: 'MESSAGES', t: '', c: 'blue' },
      { n: k.memories || 0, l: 'MEMORIES', t: '', c: 'gold' },
      { n: k.jobsTracked || 0, l: 'JOBS TRACKED', t: '', c: 'blue' },
      { n: k.jobsInPipeline || 0, l: 'PIPELINE', t: '', c: 'gold' }
    ];

    const costVal = document.querySelector('.c-val');
    if(costVal && typeof k.todayCost === 'number') costVal.textContent = `$${k.todayCost.toFixed(4)}`;
  }

  const strip = document.getElementById('kpi-strip');
  if(!strip) return;
  strip.style.display = '';
  
  strip.innerHTML = data.map((k, i) => `
    <div class="kc" style="${i === data.length - 1 ? 'border-right:none' : ''}">
      <div class="kn ${k.c}">${k.n}</div>
      <div class="kl">${k.l}</div>
      <div class="trend ${k.c}" style="opacity:${k.t ? 1 : 0.25};"><i data-lucide="trending-up"></i> ${k.t || '—'}</div>
    </div>
  `).join('');
  if (window.lucide) window.lucide.createIcons();
}

function getModelSelectorHtml() {
  const models = MODELS || [];
  return `
    <div style="position:relative;">
      <div class="model-pill" onclick="toggleModelDropdown(event)">
        <div class="mdot"></div>
        <span id="model-label">${modelLabel(SELECTED_MODEL)} ▾</span>
      </div>
      <div id="model-dropdown" class="hidden">
        ${models.length ? models.map(m => `<div class="md-opt" onclick="selectModel('${m.id}')" style="${m.id === SELECTED_MODEL ? 'color:var(--blue);background:#3B82F610;' : ''}">${m.id === SELECTED_MODEL ? '<span style="color:var(--green); margin-right:6px;">●</span>' : ''}${xs(m.label || m.id)}</div>`).join('') : '<div style="padding:12px; color:var(--t3); font-size:11px;">Loading models…</div>'}
      </div>
    </div>
  `;
}

async function updateLiveActivity() {
  const exchanges = await jf('/api/exchanges', []);
  const feed = document.getElementById('la-feed');
  if(!feed) return;
  
  let pendingHtml = '';
  const pendingIds = Object.keys(PENDING_CHATS);
  if(pendingIds.length > 0){
    pendingHtml = pendingIds.map(id => `
      <div class="la-item" style="border-left:2px solid var(--gold); padding-left:8px;">
        <span style="color:var(--gold); font-weight:700; font-size:11px;">⏳ Processing…</span>
        <div style="color:var(--t3); font-size:10px;">Dialogue #${id}</div>
      </div>
    `).join('');
  }
  
  const exchangeHtml = exchanges.slice(0, 12).map(e => {
    const ts = new Date(e.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const shortModel = e.model.split('/').pop();
    let tierClass = '';
    if(e.tier === 'smart') tierClass = 'error';
    else if(e.tier === 'cheap') tierClass = 'warning';
    else tierClass = 'success';
    
    return `
      <div class="la-item">
        <span style="color:var(--t3); font-size:9px;">[${ts}]</span> 
        <span class="${tierClass}" style="font-weight:700;">${shortModel}</span>
        <div style="color:var(--t3); font-size:10px; margin-top:2px;">${e.total_tokens} tokens · $${e.cost_usd.toFixed(4)}</div>
      </div>
    `;
  }).join('');
  
  feed.innerHTML = pendingHtml + exchangeHtml;
}

function toggleMobileMenu() {
  var overlay = document.getElementById('mobile-menu-overlay');
  if(overlay) overlay.classList.toggle('hidden');
  if(window.lucide) window.lucide.createIcons();
}

function swPageMobile(p) {
  swPage(p);
  toggleMobileMenu();
}

var NAV_COLORS = {
  chat:'#3B82F6', convos:'#10B981', memories:'#F59E0B', jobs:'#8B5CF6', apps:'#EC4899',
  emails:'#06B6D4', calendar:'#F43F5E', spontanee:'#F97316', studio:'#84CC16', logs:'#64748B', settings:'#71717a'
};

async function render(){
  var navColor = NAV_COLORS[CURRENT_PAGE] || '#3B82F6';
  document.querySelectorAll('.nav-item').forEach(i => {
    var isActive = i.getAttribute('data-page') === CURRENT_PAGE;
    i.classList.toggle('active', isActive);
    if(isActive){
      i.style.background = navColor + '15';
      i.style.borderColor = navColor + '33';
      i.style.color = navColor;
      i.querySelectorAll('i').forEach(ic => ic.style.color = navColor);
    } else {
      i.style.background = ''; i.style.borderColor = 'transparent'; i.style.color = ''; 
      i.querySelectorAll('i').forEach(ic => ic.style.color = '');
    }
  });
  const mainWrap = document.getElementById('main-wrap');
  if(!mainWrap) return;
  
  if(CURRENT_PAGE === 'chat') {
    await updateKPIs();
    await rChat();
  } else if(CURRENT_PAGE === 'convos') {
    await updateKPIs();
    await rConvos();
  } else if(CURRENT_PAGE === 'jobs') {
    await updateKPIs();
    await rJobs();
  } else if(CURRENT_PAGE === 'calendar') {
    await updateKPIs();
    await rCalendar();
  } else if(CURRENT_PAGE === 'spontanee') {
    const _sStats = await jf('/api/spontanee/stats', { byStatus: {}, sent: 0, replied: 0, sentToday: 0 });
    const _sPending = (_sStats.byStatus?.pending || 0) + (_sStats.byStatus?.draft || 0);
    await updateKPIs([
      { n: _sStats.sent || 0, l: 'SENT', t: '', c: 'blue' },
      { n: _sPending, l: 'PENDING', t: '', c: 'gold' },
      { n: _sStats.replied || 0, l: 'REPLIED', t: '', c: 'blue' },
      { n: _sStats.sentToday || 0, l: 'SENT TODAY', t: '', c: 'gold' }
    ]);
    await rSpontanee();
  } else if(CURRENT_PAGE === 'studio') {
    const _stLast = await jf('/api/studio/last', null);
    const _stCompany = _stLast && _stLast.job && _stLast.job.company ? _stLast.job.company.slice(0,14) : '—';
    const _stDate = _stLast && _stLast.updated_at ? _stLast.updated_at : '—';
    await updateKPIs([
      { n: _stLast ? 1 : 0, l: 'LAST GENERATED', t: '', c: 'blue' },
      { n: _stCompany, l: 'COMPANY', t: '', c: 'gold' },
      { n: _stDate, l: 'DATE', t: '', c: 'blue' },
      { n: _stLast && _stLast.files ? _stLast.files.length : 0, l: 'FILES', t: '', c: 'gold' }
    ]);
    await rStudio();
  } else if(CURRENT_PAGE === 'logs') {
    document.getElementById('kpi-strip').innerHTML = '';
    document.getElementById('kpi-strip').style.display = 'none';
    await rLogs();
  } else if(CURRENT_PAGE === 'apps') {
    const _allApps = await jf('/api/applications?limit=300', []);
    const _interviews = _allApps.filter(a => (a.status || a.pipeline_status) === 'interview').length;
    const _offers = _allApps.filter(a => (a.status || a.pipeline_status) === 'offer').length;
    const _applied = _allApps.filter(a => ['applied','interview','offer','rejected'].includes(a.status || a.pipeline_status || '')).length;
    const _conv = _applied > 0 ? ((_interviews / _applied) * 100).toFixed(1) + '%' : '—';
    await updateKPIs([
      { n: _allApps.length, l: 'ACTIVE APPS', t: '', c: 'blue' },
      { n: _interviews, l: 'INTERVIEWS', t: '', c: 'gold' },
      { n: _offers, l: 'OFFERS', t: '', c: 'blue' },
      { n: _conv, l: 'CONVERSION', t: '', c: 'gold' }
    ]);
    await rApps();
  } else if(CURRENT_PAGE === 'memories') {
    await updateKPIs();
    await rMemories();
  } else if(CURRENT_PAGE === 'emails') {
    const eStats = await jf('/api/emails/stats', {});
    await updateKPIs([
      { n: eStats.total || 0, l: 'JOB EMAILS', t: '', c: 'blue' },
      { n: eStats.positive || 0, l: 'POSITIVE', t: '', c: 'gold' },
      { n: eStats.unread || 0, l: 'NEUTRAL', t: '', c: 'blue' },
      { n: eStats.drafts || 0, l: 'DRAFTS', t: '', c: 'gold' }
    ]);
    await rEmails();
  } else if(CURRENT_PAGE === 'settings') {
    document.getElementById('kpi-strip').innerHTML = '';
    document.getElementById('kpi-strip').style.display = 'none';
    await rSettings();
  } else {
    mainWrap.innerHTML = `<div style="padding: 32px; color: var(--t3);">Page: ${CURRENT_PAGE} (Coming Soon)</div>`;
  }
  if (window.lucide) window.lucide.createIcons();
  requestAnimationFrame(() => { mainWrap.style.opacity = '1'; });
}

var SETTINGS_TAB = 'connectivity';

async function rSettings(){
  const mainWrap = document.getElementById('main-wrap');
  const tab = SETTINGS_TAB;
  const soul = await jf('/api/soul', { content: '' });
  const s = await jf('/api/settings', {});
  const st = await jf('/api/status', {});

  const tabs = [
    { id:'connectivity', icon:'plug-2', label:'Connectivity', group:'GENERAL' },
    { id:'cv-manager', icon:'file-text', label:'CV Manager', group:'GENERAL' },
    { id:'ai-soul', icon:'sparkles', label:'AI Soul', group:'GENERAL' },
    { id:'appearance', icon:'palette', label:'Appearance', group:'PREFERENCES' },
  ];

  const groups = ['GENERAL','PREFERENCES'];
  const tabsHtml = groups.map(g => {
    const items = tabs.filter(t => t.group === g);
    return `<div style="margin-bottom:16px;">
      <div style="font-size:10px; font-weight:700; letter-spacing:1.2px; color:#71717a; margin-bottom:8px; padding:0 12px;">${g}</div>
      ${items.map(t => {
        const active = t.id === tab;
        return `<div data-stab="${t.id}" style="height:36px; display:flex; align-items:center; gap:10px; padding:0 12px; border-radius:8px; cursor:pointer; ${active ? 'background:#3B82F615; border:1px solid #3B82F633;' : 'border:1px solid transparent;'}">
          <i data-lucide="${t.icon}" style="width:16px; height:16px; color:${active ? 'var(--blue)' : '#71717a'};"></i>
          <span style="font-size:13px; font-weight:${active ? '600' : '500'}; color:${active ? 'var(--blue)' : '#71717a'};">${t.label}</span>
        </div>`;
      }).join('')}
    </div>`;
  }).join('');

  let content = '';

  const modelsJson = JSON.stringify((s.models || []), null, 2);

  if(tab === 'connectivity'){
    const tgColor = st.telegramConnected ? '#10b981' : '#f43f5e';
    const tgLabel = st.telegramConnected ? 'Connected' : 'Not connected';
    const gmailColor = st.gmailConnected ? '#10b981' : '#f43f5e';
    const gmailLabel = st.gmailConnected ? 'Connected' : 'Not connected';
    const railwayColor = st.env === 'railway' ? '#10b981' : '#f59e0b';
    const railwayLabel = st.env === 'railway' ? ('Railway' + (st.railwayService ? ' · ' + st.railwayService : '')) : 'Local mode';
    const uptimeStr = st.uptime != null ? (st.uptime < 3600 ? Math.floor(st.uptime/60) + 'm' : Math.floor(st.uptime/3600) + 'h ' + Math.floor((st.uptime%3600)/60) + 'm') : '—';
    content = `
      <div style="font-size:14px; font-weight:600; color:#fff; margin-bottom:14px;">Connections</div>
      <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px;">
        <div id="s-tg-status" style="display:flex; align-items:center; gap:10px; padding:10px 14px; background:#ffffff05; border:1px solid #ffffff1a; border-radius:8px;">
          <div style="width:8px; height:8px; border-radius:50%; background:${tgColor};"></div>
          <span style="font-size:12px; color:#e4e4e7; flex:1;">Telegram Bot</span>
          <span style="font-size:10px; color:${tgColor}; font-weight:600;">${tgLabel}</span>
        </div>
        <div id="s-gmail-status" style="display:flex; align-items:center; gap:10px; padding:10px 14px; background:#ffffff05; border:1px solid #ffffff1a; border-radius:8px;">
          <div style="width:8px; height:8px; border-radius:50%; background:${gmailColor};"></div>
          <span style="font-size:12px; color:#e4e4e7; flex:1;">Gmail OAuth</span>
          <span style="font-size:10px; color:${gmailColor}; font-weight:600;">${gmailLabel}</span>
        </div>
        <div style="display:flex; align-items:center; gap:10px; padding:10px 14px; background:#ffffff05; border:1px solid #ffffff1a; border-radius:8px;">
          <div style="width:8px; height:8px; border-radius:50%; background:#10b981;"></div>
          <span style="font-size:12px; color:#e4e4e7; flex:1;">Calendar (ICS)</span>
          <span style="font-size:10px; color:#10b981; font-weight:600;">Linked</span>
        </div>
        <div id="s-railway-status" style="display:flex; align-items:center; gap:10px; padding:10px 14px; background:#ffffff05; border:1px solid #ffffff1a; border-radius:8px;">
          <div style="width:8px; height:8px; border-radius:50%; background:${railwayColor};"></div>
          <span style="font-size:12px; color:#e4e4e7; flex:1;">Deployment</span>
          <span style="font-size:10px; color:${railwayColor}; font-weight:600;">${railwayLabel}</span>
        </div>
      </div>
      <div style="display:flex; gap:8px; margin-bottom:24px; flex-wrap:wrap;">
        <div style="flex:1; min-width:120px; padding:10px 14px; background:#ffffff05; border:1px solid #ffffff1a; border-radius:8px;">
          <div style="font-size:10px; color:#71717a; margin-bottom:4px;">UPTIME</div>
          <div id="s-uptime-val" style="font-size:13px; font-weight:600; color:#e4e4e7;">${uptimeStr}</div>
        </div>
        <div style="flex:1; min-width:120px; padding:10px 14px; background:#ffffff05; border:1px solid #ffffff1a; border-radius:8px;">
          <div style="font-size:10px; color:#71717a; margin-bottom:4px;">MEMORIES</div>
          <div style="font-size:13px; font-weight:600; color:var(--gold);">${st.memoryCount != null ? st.memoryCount : '—'}</div>
        </div>
        <div style="flex:1; min-width:120px; padding:10px 14px; background:#ffffff05; border:1px solid #ffffff1a; border-radius:8px;">
          <div style="font-size:10px; color:#71717a; margin-bottom:4px;">JOBS</div>
          <div style="font-size:13px; font-weight:600; color:var(--blue);">${st.jobCount != null ? st.jobCount : '—'}</div>
        </div>
        <div style="flex:1; min-width:120px; padding:10px 14px; background:#ffffff05; border:1px solid #ffffff1a; border-radius:8px;">
          <div style="font-size:10px; color:#71717a; margin-bottom:4px;">NODE</div>
          <div style="font-size:13px; font-weight:600; color:#e4e4e7;">${xs(st.nodeVersion||'—')}</div>
        </div>
      </div>
      <div style="font-size:14px; font-weight:600; color:#fff; margin-bottom:14px;">Dashboard Token</div>
      <div style="display:flex; gap:10px; align-items:center; margin-bottom:24px;">
        <input id="s-token" value="${xs(TOKEN)}" placeholder="token..." style="flex:1; height:40px; background:#00000033; border:1px solid #ffffff1a; color:#e4e4e7; border-radius:8px; padding:0 16px; font-family:'JetBrains Mono'; font-size:13px; outline:none;" />
        <button class="btn" id="s-copy-token">Copy</button>
      </div>
      <div style="font-size:14px; font-weight:600; color:#fff; margin-bottom:14px;">Curated Model List</div>
      <textarea id="s-models" style="width:100%; min-height:140px; background:#00000033; border:1px solid #ffffff1a; color:#e4e4e7; border-radius:8px; padding:12px; font-family:'JetBrains Mono'; font-size:11px; line-height:1.5; outline:none; resize:vertical;">${xs(modelsJson)}</textarea>
      <div style="font-size:10px; color:#52525b; margin-top:6px;">Format: [{"id":"openrouter/model-id","label":"Nice name"}]. Used by Chat model picker.</div>
    `;
  } else if(tab === 'cv-manager'){
    content = `
      <div style="background:#3B82F615; border:1px solid #3B82F633; border-radius:12px; padding:16px; display:flex; gap:12px; align-items:flex-start; margin-bottom:24px;">
        <i data-lucide="file-text" style="width:20px; height:20px; color:var(--blue); flex-shrink:0; margin-top:2px;"></i>
        <div><div style="font-size:13px; font-weight:600; color:#fff;">CV Manager</div>
        <div style="font-size:11px; color:#94a3b8; margin-top:4px;">Upload your CVs here. They will be available in Studio, Candidature, and Email follow-up flows.</div></div>
      </div>
      <div style="font-size:14px; font-weight:600; color:#fff; margin-bottom:14px;">Master Curriculum Vitae</div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;" id="cv-grid">

          <div style="background:#ffffff05; border:1px solid #ffffff1a; border-radius:12px; padding:14px; display:flex; align-items:center; gap:12px;">
            <i data-lucide="file-text" style="width:20px; height:20px; color:var(--gold);"></i>
            <div style="flex:1;">
              <div style="font-size:13px; font-weight:600; color:#e4e4e7;">English CV</div>
              <div id="cv-slot-general-en" style="font-size:10px; color:#52525b; margin-top:2px;">${(() => { var c = (CV_LIST||[]).find(x => x.job_type==="general" && x.language==="en"); return c ? xs(c.file_name) : "No file"; })()}</div>
            </div>
            <label class="btn" style="font-size:10px; cursor:pointer;">
              Browse
              <input type="file" accept=".pdf" data-cv-type="general" data-cv-lang="en" data-cv-label="English CV" style="display:none;" />
            </label>
          </div>

          <div style="background:#ffffff05; border:1px solid #ffffff1a; border-radius:12px; padding:14px; display:flex; align-items:center; gap:12px;">
            <i data-lucide="file-text" style="width:20px; height:20px; color:var(--gold);"></i>
            <div style="flex:1;">
              <div style="font-size:13px; font-weight:600; color:#e4e4e7;">French CV</div>
              <div id="cv-slot-general-fr" style="font-size:10px; color:#52525b; margin-top:2px;">${(() => { var c = (CV_LIST||[]).find(x => x.job_type==="general" && x.language==="fr"); return c ? xs(c.file_name) : "No file"; })()}</div>
            </div>
            <label class="btn" style="font-size:10px; cursor:pointer;">
              Browse
              <input type="file" accept=".pdf" data-cv-type="general" data-cv-lang="fr" data-cv-label="French CV" style="display:none;" />
            </label>
          </div>

      </div>
      <div id="cv-upload-status" style="font-size:11px; color:var(--t3); padding-top:12px; min-height:16px;"></div>
    `;
  } else if(tab === 'ai-soul'){
    content = `
      <div style="background:#3B82F615; border:1px solid #3B82F633; border-radius:12px; padding:16px; display:flex; gap:12px; align-items:flex-start; margin-bottom:24px;">
        <i data-lucide="sparkles" style="width:20px; height:20px; color:var(--gold); flex-shrink:0; margin-top:2px;"></i>
        <div><div style="font-size:13px; font-weight:600; color:#fff;">Core Directives (soul.md)</div>
        <div style="font-size:11px; color:#94a3b8; margin-top:4px;">Modify the agent's fundamental behavior.</div></div>
      </div>
      <textarea id="s-soul" style="width:100%; min-height:300px; background:#00000033; border:1px solid #ffffff1a; color:var(--gold); border-radius:12px; padding:16px; font-family:'JetBrains Mono'; font-size:12px; line-height:1.6; outline:none; resize:vertical;">${xs(soul.content||'')}</textarea>
    `;
  } else if(tab === 'appearance'){
    const theme = localStorage.getItem('gc_theme') || 'dark';
    content = `
      <div style="font-size:16px; font-weight:700; color:#fff; margin-bottom:16px;">Appearance Settings</div>
      <div style="background:#ffffff05; border:1px solid #ffffff1a; border-radius:12px; padding:20px;">
        <div style="font-size:13px; color:#71717a; margin-bottom:16px;">Choose your preferred theme for the GravityClaw dashboard.</div>
        <div style="display:flex; gap:12px;">
          <button data-theme-pick="dark" style="flex:1; height:44px; border-radius:10px; font-size:13px; font-weight:600; cursor:pointer; ${theme==='dark' ? 'background:#F59E0B15; border:1px solid var(--gold); color:var(--gold);' : 'background:#ffffff0a; border:1px solid #ffffff1a; color:#e4e4e7;'}">🌙 Dark Mode</button>
          <button data-theme-pick="light" style="flex:1; height:44px; border-radius:10px; font-size:13px; font-weight:500; cursor:pointer; ${theme==='light' ? 'background:#F59E0B15; border:1px solid var(--gold); color:var(--gold);' : 'background:#ffffff0a; border:1px solid #ffffff1a; color:#e4e4e7;'}">☀️ Light Mode</button>
        </div>
      </div>
    `;
  }

  mainWrap.innerHTML = `
    <div style="position:fixed; inset:0; background:var(--body-bg,#05060a)CC; z-index:9000; display:flex; justify-content:center; align-items:center;" id="settings-overlay">
      <div style="width:720px; max-height:600px; background:var(--bg,#0f172a); border-radius:16px; border:1px solid var(--border,#ffffff1a); box-shadow:0 32px 64px #00000080; display:flex; flex-direction:column; overflow:hidden;">
        <div style="height:64px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; padding:0 24px; flex-shrink:0;">
          <div style="font-size:15px; font-weight:600; color:#fff;">Settings & Preferences</div>
          <div id="s-close" style="width:28px; height:28px; display:flex; align-items:center; justify-content:center; cursor:pointer; border-radius:6px;" onmouseover="this.style.background='#ffffff10'" onmouseout="this.style.background=''"><i data-lucide="x" style="width:18px; height:18px; color:#71717a;"></i></div>
        </div>
        <div style="flex:1; display:flex; overflow:hidden;">
          <div style="width:200px; border-right:1px solid var(--border); padding:16px; display:flex; flex-direction:column; gap:4px; overflow-y:auto;">
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
              <div style="width:36px; height:36px; border-radius:18px; background:#F59E0B15; display:flex; align-items:center; justify-content:center;"><i data-lucide="user" style="width:18px; height:18px; color:var(--gold);"></i></div>
              <div><div style="font-size:14px; font-weight:600; color:#fff;">David Litvak</div><div style="font-size:11px; font-weight:500; color:var(--gold);">Premium Agent</div></div>
            </div>
            ${tabsHtml}
          </div>
          <div style="flex:1; padding:24px; overflow-y:auto;">
            ${content}
          </div>
        </div>
        ${tab === 'appearance' ? '' : `<div style="height:72px; border-top:1px solid var(--border); display:flex; align-items:center; justify-content:flex-end; gap:12px; padding:0 24px; flex-shrink:0;">
          <button id="s-cancel" style="height:36px; padding:0 16px; border:1px solid #ffffff1a; border-radius:8px; background:transparent; color:#e4e4e7; font-size:13px; font-weight:500; cursor:pointer;">Cancel</button>
          <button id="s-save" style="height:36px; padding:0 16px; background:var(--blue); border:none; border-radius:8px; color:#fff; font-size:13px; font-weight:500; cursor:pointer;">Save Changes</button>
        </div>`}
      </div>
    </div>
  `;
  if(window.lucide) window.lucide.createIcons();

  document.querySelectorAll('[data-stab]').forEach(el => {
    el.onclick = () => { SETTINGS_TAB = el.getAttribute('data-stab'); render(); };
  });

  document.querySelectorAll('[data-theme-pick]').forEach(el => {
    el.onclick = () => {
      const t = el.getAttribute('data-theme-pick');
      localStorage.setItem('gc_theme', t);
      document.documentElement.setAttribute('data-theme', t);
      applyTheme(t);
      render();
    };
  });

  const closeBtn = document.getElementById('s-close');
  if(closeBtn) closeBtn.onclick = () => { CURRENT_PAGE = 'chat'; render(); };
  const cancelBtn = document.getElementById('s-cancel');
  if(cancelBtn) cancelBtn.onclick = () => { CURRENT_PAGE = 'chat'; render(); };

  // CV file upload handlers (real upload to API)
  document.querySelectorAll('[data-cv-type]').forEach(inp => {
    inp.onchange = async (e) => {
      const file = e.target.files[0];
      if(!file) return;
      const jobType = inp.getAttribute('data-cv-type');
      const lang = inp.getAttribute('data-cv-lang');
      const label = inp.getAttribute('data-cv-label');
      var st = document.getElementById('cv-upload-status');
      if(st) st.textContent = 'Uploading ' + file.name + '…';
      var fd = new FormData();
      fd.append('file', file);
      fd.append('job_type', jobType);
      fd.append('language', lang);
      fd.append('label', file.name);
      try {
        var url = new URL('/api/cvs/upload', window.location.origin);
        if(TOKEN) url.searchParams.set('token', TOKEN);
        var r = await fetch(url, { method:'POST', body: fd });
        if(!r.ok) throw new Error('Upload failed');
        var js = await r.json();
        CV_LIST = js.cvs || [];
        if(st) st.textContent = 'Uploaded: ' + file.name;
        var slotEl = document.getElementById('cv-slot-' + jobType + '-' + lang);
        if(slotEl) slotEl.textContent = file.name;
      } catch(err) {
        if(st) st.textContent = 'Error: ' + (err.message || 'upload failed');
      }
    };
  });

  // Auto-refresh status every 10s when on connectivity tab
  if(SETTINGS_TAB === 'connectivity') {
    if(window._statusRefreshInterval) clearInterval(window._statusRefreshInterval);
    window._statusRefreshInterval = setInterval(async () => {
      if(CURRENT_PAGE !== 'settings' || SETTINGS_TAB !== 'connectivity') { clearInterval(window._statusRefreshInterval); return; }
      const fresh = await jf('/api/status', {});
      if(!fresh || !fresh.env) return;
      const upEl = document.getElementById('s-uptime-val');
      if(upEl && fresh.uptime != null) upEl.textContent = fresh.uptime < 3600 ? Math.floor(fresh.uptime/60) + 'm' : Math.floor(fresh.uptime/3600) + 'h ' + Math.floor((fresh.uptime%3600)/60) + 'm';
    }, 10000);
  }

  const copyToken = document.getElementById('s-copy-token');
  if(copyToken) copyToken.onclick = () => { const v = document.getElementById('s-token'); if(v) navigator.clipboard.writeText(v.value).catch(()=>{}); };
  const copyKey = document.getElementById('s-copy-key');
  if(copyKey) copyKey.onclick = () => { const v = document.getElementById('s-apikey'); if(v) navigator.clipboard.writeText(v.value).catch(()=>{}); };

  const saveBtn = document.getElementById('s-save');
  if(saveBtn){
    saveBtn.onclick = async () => {
      const tokenEl = document.getElementById('s-token');
      if(tokenEl){ localStorage.setItem('gc_token', tokenEl.value.trim()); TOKEN = tokenEl.value.trim(); }
      const soulEl = document.getElementById('s-soul');
      if(soulEl){ await fetch(withToken('/api/soul'), { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ content: soulEl.value })}); }
      let models = undefined;
      const modelsEl = document.getElementById('s-models');
      if(modelsEl){
        try{ models = JSON.parse(modelsEl.value); }catch{ return alert('Models JSON is invalid'); }
      }
      const payload = models ? { models } : {};
      const r = await fetch(withToken('/api/settings'), { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
      if(!r.ok) return alert('Save failed');
      MODELS = null;
      saveBtn.textContent = 'Saved ✓';
      setTimeout(() => { saveBtn.textContent = 'Save Changes'; }, 1500);
    };
  }
}


async function rChat(){
  const mainWrap = document.getElementById('main-wrap');
  if(!MODELS) MODELS = await jf('/api/models', []);

  // ensure at least one dialogue exists
  let dialogues = await jf('/api/dialogues', []);
  if(!dialogues || dialogues.length === 0){
    const created = await fetch(withToken('/api/dialogues'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title: 'Main', model: SELECTED_MODEL })});
    const js = await created.json();
    DIALOGUE_ID = js.id;
    localStorage.setItem('gc_dialogue_id', String(DIALOGUE_ID));
    dialogues = await jf('/api/dialogues', []);
  }

  // pick active dialogue
  let active = dialogues.find(d => Number(d.id) === Number(DIALOGUE_ID)) || dialogues[0];
  if(active && Number(active.id) !== Number(DIALOGUE_ID)){
    DIALOGUE_ID = Number(active.id);
    localStorage.setItem('gc_dialogue_id', String(DIALOGUE_ID));
  }
  if(active && active.model){
    SELECTED_MODEL = active.model;
    localStorage.setItem('gc_model', SELECTED_MODEL);
  }

  mainWrap.innerHTML = `
    <div class="split-view">
      <div class="main-panel">
        <div class="chat-container">
          <div class="chat-header">
            <div class="chat-title">CHAT WITH GRAVITYCLAW</div>
            ${getModelSelectorHtml()}
          </div>

          <div id="mobile-activity-bar" class="mobile-activity-bar" style="display:none;"></div>
            <div class="chat-msgs" id="chat-msgs"></div>
          <div class="chat-input-area">
            <div class="input-row">
              <button class="attach-btn"><i data-lucide="paperclip"></i></button>
              <input type="text" id="chat-input" class="input-field" placeholder="Ask anything..." onkeypress="handleEnter(event)" />
              <button class="send-btn" onclick="sendChat()">Send</button>
            </div>
            <div class="quick-tools">
              <div class="qt-item" onclick="sendQuery('🔍 Check for new jobs')">🔍 Jobs</div>
              <div class="qt-item" onclick="sendQuery('📧 Read my latest emails')">📧 Gmail</div>
              <div class="qt-item" onclick="sendQuery('🌅 Give me my morning brief')">🌅 Morning</div>
              <div class="qt-item" onclick="sendQuery('📅 What do I have today?')">📅 Calendar</div>
              <div class="qt-item" onclick="sendQuery('📊 Show my application stats')">📊 Stats</div>
            </div>
          </div>
        </div>
      </div>
      <div class="live-activity-panel" id="agent-brain">
        <div class="la-title">LIVE ACTIVITY</div>
        <div class="la-feed" id="la-feed"></div>
        
        <div style="border-top:1px solid var(--border); margin-top:auto; padding-top:16px;">
          <div class="la-title">DIALOGUES</div>
          <div style="display:flex; gap:8px; margin-top:10px;">
            <button id="dlg-new" class="btn btn-violet" style="flex:1; height:28px; font-size:10px;">+ New Chat</button>
          </div>
          <div class="la-feed" id="dlg-list" style="margin-top:10px; max-height:280px; overflow-y:auto;"></div>
        </div>
      </div>
    </div>
  `;
  
  if (window.lucide) window.lucide.createIcons();
  updateLiveActivity();

  var h = await jf('/api/dialogues/' + DIALOGUE_ID + '/messages?limit=200', []);
  var msgs = document.getElementById('chat-msgs');
  
  const visibleHistory = h.filter(m => (m.role === 'user' || m.role === 'assistant' || m.role === 'agent') && m.content && m.content.trim() !== '');

  if(visibleHistory.length === 0) {
    msgs.innerHTML = `
      <div class="msg-row agent-row">
        <div class="bubble agent">Hey David, how can I help you today?</div>
      </div>
    `;
  } else {
    msgs.innerHTML = visibleHistory.slice(-50).map(m => {
      const isAgent = (m.role === 'assistant' || m.role === 'agent');
      const roleClass = isAgent ? 'agent' : 'user';
      const rowClass = isAgent ? 'agent-row' : 'user-row';
      const formattedContent = xs(m.content).replace(/\n/g, '<br/>');
      return `<div class="msg-row ${rowClass}"><div class="bubble ${roleClass}">${formattedContent}</div></div>`;
    }).join('');
  }
  msgs.scrollTop = msgs.scrollHeight;

  // dialogues list
  const dl = document.getElementById('dlg-list');
  if(dl){
    dl.innerHTML = dialogues.map(d => {
      const isActive = Number(d.id) === Number(DIALOGUE_ID);
      const mlabel = modelLabel(d.model || '');
      return `
        <div class="dlg-item ${isActive ? 'active' : ''}" data-dlg-id="${d.id}">
          <div class="dlg-title">${xs(d.title || ('Dialogue ' + d.id))}</div>
          <div class="dlg-meta"><span class="dlg-pill">${xs(mlabel)}</span></div>
        </div>
      `;
    }).join('');
  }
  document.querySelectorAll('[data-dlg-id]').forEach(el => {
    el.onclick = async () => {
      localStorage.setItem('gc_dialogue_id', el.getAttribute('data-dlg-id'));
      DIALOGUE_ID = Number(el.getAttribute('data-dlg-id'));
      render();
    };
  });
  const newBtn = document.getElementById('dlg-new');
  if(newBtn){
    newBtn.onclick = async () => {
      const title = prompt('Dialogue title:', 'New dialogue') || 'New dialogue';
      const model = SELECTED_MODEL;
      const r = await fetch(withToken('/api/dialogues'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title, model })});
      if(!r.ok) return alert('Failed to create');
      const js = await r.json();
      localStorage.setItem('gc_dialogue_id', String(js.id));
      DIALOGUE_ID = Number(js.id);
      render();
    };
  }
}

async function rConvos(){
  const mainWrap = document.getElementById('main-wrap');
  const q = localStorage.getItem('gc_threads_q') || '';
  const sel = localStorage.getItem('gc_threads_sel') || '';
  const qs = new URLSearchParams();
  if(q) qs.set('q', q);
  qs.set('limit', '200');
  const threads = await jf('/api/threads?' + qs.toString(), []);
  const active = threads.find(t => t.company === sel) || threads[0] || null;
  if(active && active.company !== sel) localStorage.setItem('gc_threads_sel', active.company);

  const detail = active ? await jf('/api/threads/' + encodeURIComponent(active.company), null) : null;

  mainWrap.innerHTML = `
    <div class="split-view">
      <div class="side-panel">
        <div class="panel-header">
          <div class="panel-title">THREADS</div>
          <input id="threads-q" placeholder="search..." value="${xs(q)}"
            style="height:30px; width:140px; background:#151b2b; border:1px solid #ffffff1a; color:#e4e4e7; border-radius:10px; padding:0 10px; font-size:11px; outline:none;" />
        </div>
        <div class="panel-content">
          ${threads.map(t => `
            <div class="list-item ${active && active.company === t.company ? 'active' : ''}" data-thread-company="${xs(t.company)}">
              <div class="li-title">${xs(t.company)}</div>
              <div class="li-meta">
                <span class="li-badge" style="background:#3b82f620; color:var(--blue);">jobs ${t.jobs||0}</span>
                <span class="li-badge" style="background:#8b5cf620; color:var(--violet);">emails ${t.emails||0}</span>
                <span class="li-badge" style="background:#f59e0b20; color:var(--gold);">outreach ${t.outreach||0}</span>
              </div>
            </div>
          `).join('') || '<div style="color:var(--t3);">No threads yet.</div>'}
        </div>
      </div>
      <div class="main-panel">
        <div class="panel-header">
          <div class="panel-title">THREAD TIMELINE</div>
          <div style="color:var(--t3); font-size:11px;">${active ? xs(active.company) : ''}</div>
        </div>
        <div class="panel-content" style="padding:28px; background:#05060a;">
          ${detail ? detail.timeline.map(ev => {
            const at = ev.at ? new Date(ev.at).toLocaleString('en-GB', { hour12:false }) : '';
            if(ev.type === 'email'){
              const e = ev.data;
              return `<div class="list-item" style="background:#0f1420;">
                <div class="li-meta"><span class="li-badge" style="background:#8b5cf620; color:var(--violet);">EMAIL</span><span>${xs(at)}</span></div>
                <div class="li-title">${xs(decodeHtml(e.subject||''))}</div>
                <div class="li-sub">${xs(decodeHtml(e.from_addr||''))}</div>
                <div class="li-sub" style="margin-top:10px; line-height:1.6;">${xs(decodeHtml(e.snippet||''))}</div>
                ${e.id ? `<button onclick="localStorage.setItem('gc_email_sel','${e.id}'); swPage('emails'); render();" style="margin-top:10px; font-size:10px; color:var(--blue); background:transparent; border:1px solid #3b82f633; border-radius:6px; padding:4px 10px; cursor:pointer;">→ View Email</button>` : ''}
              </div>`;
            }
            if(ev.type === 'outreach'){
              const o = ev.data;
              return `<div class="list-item" style="background:#0f1420;">
                <div class="li-meta"><span class="li-badge" style="background:#f59e0b20; color:var(--gold);">OUTREACH</span><span>${xs(at)}</span></div>
                <div class="li-title">${xs(o.hr_email||'')}</div>
                <div class="li-sub">status: ${xs(o.status||'')}</div>
                ${o.email_subject ? `<div class="li-sub" style="margin-top:10px;"><b>${xs(o.email_subject)}</b></div>` : ``}
              </div>`;
            }
            if(ev.type === 'job'){
              const j = ev.data;
              return `<div class="list-item" style="background:#0f1420;">
                <div class="li-meta"><span class="li-badge" style="background:#3b82f620; color:var(--blue);">JOB</span><span>${xs(at)}</span></div>
                <div class="li-title">${xs(j.title||'')}</div>
                <div class="li-sub">${xs(j.location||'')} · ${xs(j.pipeline_status||'')}</div>
              </div>`;
            }
            return `<div class="list-item" style="background:#0f1420;"><div class="li-title">${xs(ev.type)}</div></div>`;
          }).join('') : '<div style="color:var(--t3);">Select a company thread.</div>'}
        </div>
      </div>
    </div>
  `;

  const qEl = document.getElementById('threads-q');
  if(qEl) qEl.onkeydown = (e) => { if(e.key === 'Enter') { localStorage.setItem('gc_threads_q', qEl.value||''); localStorage.removeItem('gc_threads_sel'); render(); } };

  document.querySelectorAll('[data-thread-company]').forEach(el => {
    el.onclick = () => { localStorage.setItem('gc_threads_sel', el.getAttribute('data-thread-company')); render(); };
  });
}

async function rJobs(){
  const mainWrap = document.getElementById('main-wrap');
  const filter = localStorage.getItem('gc_jobs_filter') || 'all';
  const selectedId = localStorage.getItem('gc_job_sel') || '';

  const jobs = await jf('/api/jobs?status=' + encodeURIComponent(filter) + '&limit=300', []);
  const selected = jobs.find(j => String(j.id) === String(selectedId)) || jobs[0] || null;
  if(selected && String(selected.id) !== String(selectedId)) localStorage.setItem('gc_job_sel', String(selected.id));
  const detail = selected ? await jf('/api/jobs/' + encodeURIComponent(selected.id), {}) : {};

  const statusColor = (s) => {
    if(s === 'applied') return '#3b82f6';
    if(s === 'interview') return '#8b5cf6';
    if(s === 'offer') return '#10b981';
    if(s === 'rejected') return '#f43f5e';
    if(s === 'saved') return '#f59e0b';
    return '#64748B';
  };
  const statusLabel = (s) => {
    if(s === 'applied') return 'Applied';
    if(s === 'interview') return 'Phone Screen';
    if(s === 'offer') return 'Offer Received! \u{1F389}';
    if(s === 'saved') return 'Saved';
    if(s === 'rejected') return 'Rejected';
    return (s||'new').charAt(0).toUpperCase() + (s||'new').slice(1);
  };
  const scoreColor = (n) => (n>=85 ? '#10b981' : n>=70 ? '#3B82F6' : n>=50 ? '#f59e0b' : '#f43f5e');
  const score = detail.job_score != null ? Number(detail.job_score) : null;

  mainWrap.innerHTML = `
    <div class="split-view">
      <div style="flex:1; display:flex; flex-direction:column; overflow:hidden;">
        <div class="panel-header">
          <div style="display:flex; align-items:center; gap:12px;">
            <input id="jobs-q" placeholder="Rechercher un poste..." style="height:34px; width:220px; background:#151b2b; border:1px solid #ffffff1a; color:#e4e4e7; border-radius:8px; padding:0 14px; font-size:12px; outline:none;" />
            <select id="jobs-filter" style="height:34px; background:#151b2b; border:1px solid #ffffff1a; color:#e4e4e7; border-radius:8px; padding:0 12px; font-size:11px;">
              <option value="all">Filtrer</option>
              <option value="new">NEW</option>
              <option value="saved">SAVED</option>
              <option value="applied">APPLIED</option>
              <option value="interview">INTERVIEW</option>
              <option value="offer">OFFER</option>
              <option value="rejected">REJECTED</option>
            </select>
          </div>
          <button id="job-add" class="btn btn-primary">+ Ajouter</button>
          </div>
        <!-- Inline add-by-URL bar (hidden by default) -->
        <div id="job-add-bar" style="display:none; padding:0 16px 12px; border-bottom:1px solid var(--border);">
          <div style="display:flex; gap:8px; align-items:center;">
            <input id="job-url-input" type="text" placeholder="Paste job URL (LinkedIn, WTTJ, Indeed…)" style="flex:1; height:36px; background:#151b2b; border:1px solid var(--gold); color:#e4e4e7; border-radius:8px; padding:0 14px; font-size:12px; outline:none;" />
            <button id="job-url-go" class="btn btn-gold">Scrape & Score</button>
            <button id="job-url-cancel" class="btn" style="font-size:10px;">Cancel</button>
          </div>
          <div id="job-url-status" style="font-size:11px; color:var(--t3); font-family:'JetBrains Mono'; padding-top:6px; min-height:16px;"></div>
        </div>
        <div class="panel-content" style="padding:16px;">
          ${jobs.map(j => {
            const sc = j.job_score != null ? Number(j.job_score) : null;
            return `
            <div class="list-item ${selected && selected.id === j.id ? 'active' : ''}" data-job-id="${xs(j.id)}" style="border-left:3px solid ${statusColor(j.pipeline_status)}; display:flex; justify-content:space-between; align-items:flex-start;">
              <div style="flex:1;">
                <div style="font-size:13px; font-weight:600; color:#e4e4e7;">${xs(j.title)}${j.url ? ' <a href="' + xs(j.url) + '" target="_blank" onclick="event.stopPropagation()" style="font-size:10px; color:var(--blue); margin-left:4px; text-decoration:none; opacity:0.7;" title="View offer">↗</a>' : ''}</div>
                <div style="font-size:11px; color:#71717a; margin-top:3px;">${xs(j.company)} · ${xs(j.location||'')}</div>
                <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap; align-items:center;">
                  <span style="font-size:10px; color:${statusColor(j.pipeline_status)}; font-weight:600;">${statusLabel(j.pipeline_status)}</span>
                  <span style="color:#3f3f46; font-size:10px;">${xs((j.found_at||'').slice(5,10))}</span>
                </div>
              </div>
              <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
                ${sc != null ? '<span style="font-size:10px; font-weight:700; color:' + (sc>=85?'var(--gold)':'#71717a') + ';">' + sc + '% match</span>' : ''}
              </div>
            </div>`;
          }).join('') || '<div style="color:var(--t3);">No jobs tracked.</div>'}
        </div>
      </div>
      <div class="right-panel" style="width:400px;">
        <div class="panel-header"><div class="panel-title">MATCH ANALYSIS</div>
          ${selected ? '<div style="display:flex; gap:8px;"><select id="job-status" style="height:28px; background:#151b2b; border:1px solid #ffffff1a; color:#e4e4e7; border-radius:6px; padding:0 8px; font-size:10px;"><option value="new">NEW</option><option value="saved">SAVED</option><option value="applied">APPLIED</option><option value="interview">INTERVIEW</option><option value="offer">OFFER</option><option value="rejected">REJECTED</option></select><button id="job-score" class="btn btn-gold">Score</button></div>' : ''}
        </div>
        <div class="panel-content" style="padding:24px;">
          ${selected ? `
            <div style="text-align:center; margin-bottom:20px;">
              <div style="font-size:20px; font-weight:800; color:var(--gold);">${score != null ? score + '%' : '—'}</div>
              <div style="font-size:16px; font-weight:600; color:#e4e4e7; margin-top:4px;">
                ${score != null ? (score>=85 ? 'High Match Potential' : score>=70 ? 'Good Match' : score>=50 ? 'Moderate Match' : 'Low Match') : 'Not scored yet'}
              </div>
              <div style="font-size:12px; color:#71717a; margin-top:4px;">${xs(detail.title||'')} @ ${xs(detail.company||'')}</div>
            </div>
            ${detail.job_score_reason ? `
              <div style="margin-bottom:20px;">
                <div style="font-size:12px; font-weight:600; color:#a1a1aa; margin-bottom:8px;">TECH STACK ALIGNMENT</div>
                <div style="color:#71717a; font-size:12px; line-height:1.6; white-space:pre-wrap;">${xs(detail.job_score_reason)}</div>
              </div>
            ` : ''}

            ${detail.url ? '<a href="' + xs(detail.url) + '" target="_blank" style="display:block; text-align:center; padding:10px; background:#3B82F615; border:1px solid #3B82F633; border-radius:12px; color:var(--blue); font-size:13px; font-weight:600; text-decoration:none; margin-bottom:10px;">↗ View Offer</a>' : ''}
            ${detail.url ? '<a href="' + xs(detail.url) + '" target="_blank" style="display:block; text-align:center; padding:12px; background:var(--gold); border-radius:12px; color:#000; font-size:14px; font-weight:700; text-decoration:none;">Generate Custom Cover Letter</a>' : ''}
          ` : '<div style="color:var(--t3); text-align:center;">Select a job to see analysis.</div>'}
        </div>
      </div>
    </div>
  `;

  const filt = document.getElementById('jobs-filter');
  if(filt) { filt.value = filter; filt.onchange = () => { localStorage.setItem('gc_jobs_filter', filt.value); localStorage.removeItem('gc_job_sel'); render(); }; }

  document.querySelectorAll('[data-job-id]').forEach(el => {
    el.onclick = () => { localStorage.setItem('gc_job_sel', el.getAttribute('data-job-id')); render(); };
  });

  const st = document.getElementById('job-status');
  if(st && selected){
    st.value = selected.pipeline_status || 'new';
    st.onchange = async () => {
      const r = await fetch(withToken('/api/jobs/' + encodeURIComponent(selected.id)), { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ pipeline_status: st.value })});
      if(!r.ok) alert('Failed to update status');
      render();
    };
  }

  const scoreBtn = document.getElementById('job-score');
  if(scoreBtn && selected){
    scoreBtn.onclick = async () => {
      scoreBtn.disabled = true; scoreBtn.innerHTML = '<span class="gc-spinner sm"></span> Scoring…';
      const r = await fetch(withToken('/api/jobs/' + encodeURIComponent(selected.id) + '/score'), { method:'POST' });
      if(!r.ok){ scoreBtn.disabled=false; scoreBtn.textContent='Score match'; return alert('Failed to start scoring'); }
      const js = await r.json();
      if(js && js.taskId){
        await pollTask(js.taskId, (t) => {
          if(t.lastMessage) scoreBtn.innerHTML = '<span class="gc-spinner sm gold"></span> ' + xs(t.lastMessage);
          if(t.status === 'done') render();
          if(t.status === 'error'){ scoreBtn.disabled=false; scoreBtn.textContent='Score match'; alert('Scoring failed: ' + (t.error||'')); }
        });
      }
    };
  }

  var addBtn = document.getElementById('job-add');
  var addBar = document.getElementById('job-add-bar');
  if(addBtn && addBar){
    addBtn.onclick = () => { addBar.style.display = addBar.style.display === 'none' ? 'block' : 'none'; var inp = document.getElementById('job-url-input'); if(inp) inp.focus(); };
    var cancelBtn = document.getElementById('job-url-cancel');
    if(cancelBtn) cancelBtn.onclick = () => { addBar.style.display = 'none'; };
    var goBtn = document.getElementById('job-url-go');
    if(goBtn){
      goBtn.onclick = async () => {
        var inp = document.getElementById('job-url-input');
        var url = (inp && inp.value || '').trim();
        if(!url) return alert('Paste a job URL');
        var st = document.getElementById('job-url-status');
        goBtn.disabled = true; goBtn.innerHTML = '<span class="gc-spinner sm gold"></span> Working…';
        if(st) st.innerHTML = '<span class="gc-spinner sm" style="vertical-align:middle;margin-right:6px;"></span>Scraping and scoring…';
        var _scrapeStart = Date.now();
        var _scrapeTimer = setInterval(function(){ if(st){ var s=Math.floor((Date.now()-_scrapeStart)/1000); st.innerHTML='<span class="gc-spinner sm" style="vertical-align:middle;margin-right:6px;"></span>Working… '+s+'s'; } }, 1000);
        var r = await fetch(withToken('/api/jobs'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url })});
        if(!r.ok){ clearInterval(_scrapeTimer); goBtn.disabled=false; goBtn.textContent='Scrape & Score'; if(st) st.textContent='Failed'; return; }
        var js = await r.json();
        if(js.message){ clearInterval(_scrapeTimer); if(st) st.textContent = js.message; goBtn.disabled=false; goBtn.textContent='Scrape & Score'; render(); return; }
        if(js.taskId){
          await pollTask(js.taskId, (t) => {
            if(st) st.innerHTML = '<span class="gc-spinner sm" style="vertical-align:middle;margin-right:6px;"></span>' + xs(t.lastMessage || t.status) + ' — ' + Math.floor((Date.now()-_scrapeStart)/1000) + 's';
            if(t.status === 'done'){ clearInterval(_scrapeTimer); addBar.style.display = 'none'; render(); }
            if(t.status === 'error'){ clearInterval(_scrapeTimer); goBtn.disabled=false; goBtn.textContent='Scrape & Score'; }
          });
        }
      };
    }
  }
}

async function rCalendar(){
  const view = localStorage.getItem('gc_cal_view') || 'week';
  const anchor = localStorage.getItem('gc_cal_anchor') || new Date().toISOString();
  const selectedDay = localStorage.getItem('gc_cal_day') || new Date().toISOString().slice(0,10);

  const qs = new URLSearchParams();
  qs.set('view', view);
  qs.set('anchor', anchor);
  const cal = await jf('/api/calendar?' + qs.toString(), { view, anchor, events: [] });
  const events = cal.events || [];

  const days = [];
  if(cal.range && cal.range.start && cal.range.end){
    const s = new Date(cal.range.start);
    const e = new Date(cal.range.end);
    for(let d = new Date(s); d < e; d.setDate(d.getDate()+1)){
      days.push({ key: d.toISOString().slice(0,10), iso: d.toISOString() });
      if(days.length > 60) break;
    }
  }

  const activeDay = selectedDay || (days[0] && days[0].key) || new Date().toISOString().slice(0,10);
  if(activeDay !== selectedDay) localStorage.setItem('gc_cal_day', activeDay);

  const byDay = {};
  events.forEach(ev => { (byDay[ev.date] = byDay[ev.date] || []).push(ev); });
  Object.keys(byDay).forEach(k => byDay[k].sort((a,b) => String(a.startISO||'').localeCompare(String(b.startISO||''))));

  const gym = await jf('/api/gym?date=' + encodeURIComponent(activeDay), { workout_name:'', exercises:[], source:'none' });
  const mainWrap = document.getElementById('main-wrap');

  const today = new Date().toISOString().slice(0,10);
  const anchorDate = new Date(anchor);
  const monthName = anchorDate.toLocaleDateString('en-US', { month:'long', year:'numeric' });

  // Build the events list for a given day
  function eventsListHtml(dayKey){
    var items = byDay[dayKey] || [];
    if(!items.length) return '<div style="color:var(--t3); font-size:12px; padding:16px;">No events for this day.</div>';
    return items.map(function(e, i){
      return '<div class="list-item" style="border-left:4px solid ' + (i%2===0?'var(--blue)':'var(--gold)') + '"><div class="li-title wrap-anywhere">' + xs(e.summary) + '</div><div class="li-meta"><span>' + xs(e.start) + ' — ' + xs(e.end) + '</span>' + (e.location ? '<span> · ' + xs(e.location) + '</span>' : '') + '</div></div>';
    }).join('');
  }

  // Build gym panel HTML
  var gymHtml = '<div class="right-panel" style="width:300px;">'
    + '<div class="panel-header"><div class="panel-title">GYM PANEL</div></div>'
    + '<div class="panel-content">'
    + '<div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:10px;">'
    + '<div style="font-weight:800; font-size:14px;">' + xs(gym.workout_name || 'No workout') + '</div>'
    + '<div class="li-badge" style="background:#ffffff10; color:var(--t3);">' + xs(gym.source||'') + '</div></div>'
    + '<input id="gym-name" value="' + xs(gym.workout_name||'') + '" placeholder="Workout name" style="width:100%; height:32px; background:#151b2b; border:1px solid #ffffff1a; color:#e4e4e7; border-radius:10px; padding:0 10px; font-size:12px; outline:none;" />'
    + '<div style="margin-top:10px; display:flex; flex-direction:column; gap:10px;" id="gym-exs">';
  (gym.exercises||[]).forEach(function(ex, idx){
    gymHtml += '<div style="background:#ffffff05; border:1px solid #ffffff10; border-radius:12px; padding:10px;">'
      + '<input data-ex-name="' + idx + '" value="' + xs(ex.name||'') + '" placeholder="Exercise" style="width:100%; height:30px; background:#0b1020; border:1px solid #ffffff12; color:#e4e4e7; border-radius:10px; padding:0 10px; font-size:12px; outline:none;" />'
      + '<div style="display:flex; gap:8px; margin-top:8px;">'
      + '<input data-ex-sets="' + idx + '" value="' + xs(ex.sets||'') + '" placeholder="sets" style="flex:1; height:30px; background:#0b1020; border:1px solid #ffffff12; color:#e4e4e7; border-radius:10px; padding:0 10px; font-size:12px; outline:none;" />'
      + '<input data-ex-reps="' + idx + '" value="' + xs(ex.reps||'') + '" placeholder="reps" style="flex:1; height:30px; background:#0b1020; border:1px solid #ffffff12; color:#e4e4e7; border-radius:10px; padding:0 10px; font-size:12px; outline:none;" />'
      + '</div></div>';
  });
  if(!(gym.exercises||[]).length) gymHtml += '<div style="color:var(--t3); font-size:12px;">No routine yet.</div>';
  gymHtml += '</div>'
    + '<div style="display:flex; gap:8px; margin-top:12px;"><button class="btn btn-violet" id="gym-add" style="flex:1;">Add</button><button class="btn btn-gold" id="gym-save" style="flex:1;">Save</button></div>'
    + '<div style="display:flex; gap:8px; margin-top:8px;"><input id="gym-move-date" type="date" value="' + xs(activeDay) + '" style="flex:1; height:32px; background:#151b2b; border:1px solid #ffffff1a; color:#e4e4e7; border-radius:10px; padding:0 10px; font-size:12px; outline:none;" /><button class="btn" id="gym-move" style="flex:0;">Move</button></div>'
    + '</div></div>';

  // -- HEADER (shared) --
  var headerHtml = '<div style="display:flex; justify-content:space-between; align-items:center; height:56px; padding:0 24px; border-bottom:1px solid var(--border); flex-shrink:0;">'
    + '<div style="display:flex; align-items:center; gap:12px;">'
    + '<div style="color:#e4e4e7; font-size:18px; font-weight:700; letter-spacing:-0.5px;">' + xs(monthName) + '</div>'
    + '<div style="display:flex; gap:4px;">'
    + '<div id="cal-prev" style="width:28px; height:28px; border-radius:6px; border:1px solid #ffffff1a; display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--t3);"><i data-lucide="chevron-left" style="width:14px; height:14px;"></i></div>'
    + '<div id="cal-next" style="width:28px; height:28px; border-radius:6px; border:1px solid #ffffff1a; display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--t3);"><i data-lucide="chevron-right" style="width:14px; height:14px;"></i></div>'
    + '</div>'
    + '<button id="cal-today" class="btn btn-violet" style="height:28px;">Today</button>'
    + '</div>'
    + '<div style="display:flex; gap:6px;">'
    + '<button id="cal-day" class="btn ' + (view==='day'?'btn-violet':'') + '">Day</button>'
    + '<button id="cal-week" class="btn ' + (view==='week'?'btn-violet':'') + '">Week</button>'
    + '<button id="cal-month" class="btn ' + (view==='month'?'btn-violet':'') + '">Month</button>'
    + '</div></div>';

  var bodyHtml = '';

  if(view === 'month'){
    // -- MONTH GRID --
    var weekHeaders = ['MON','TUE','WED','THU','FRI','SAT','SUN'].map(function(wd){
      return '<div style="text-align:center; font-size:9px; font-weight:700; color:#52525b; letter-spacing:1.5px; padding:8px 0;">' + wd + '</div>';
    }).join('');

    var gridCells = '';
    var am = anchorDate.getMonth();
    // Pad start to align to Monday (0=Mon, 6=Sun)
    if(days.length > 0){
      var firstDt = new Date(days[0].iso);
      var firstWd = firstDt.getDay(); // 0=Sun, 1=Mon, ...
      var padCount = firstWd === 0 ? 6 : firstWd - 1; // Convert to Mon=0 based
      for(var p=0; p<padCount; p++){
        gridCells += '<div style="min-height:72px; padding:4px 6px; border-right:1px solid #ffffff06; border-bottom:1px solid #ffffff06;"></div>';
      }
    }
    days.forEach(function(d){
      var dt = new Date(d.iso);
      var dn = dt.getDate();
      var isA = d.key === activeDay;
      var isT = d.key === today;
      var isCur = dt.getMonth() === am;
      var de = byDay[d.key] || [];
      gridCells += '<div data-cal-day="' + d.key + '" style="min-height:72px; padding:4px 6px; border-right:1px solid #ffffff06; border-bottom:1px solid #ffffff06; cursor:pointer;' + (isA ? 'background:#8B5CF610;' : '') + '">';
      if(isT){
        gridCells += '<div style="width:24px; height:24px; background:var(--violet); color:#fff; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:800;">' + dn + '</div>';
      } else {
        gridCells += '<div style="font-size:12px; font-weight:500; color:' + (isA ? 'var(--violet)' : isCur ? '#a1a1aa' : '#3f3f46') + '; padding:2px;">' + dn + '</div>';
      }
      de.slice(0,2).forEach(function(ev, i){
        gridCells += '<div style="font-size:8px; padding:1px 4px; margin-top:2px; border-radius:3px; background:' + (i===0?'#3b82f620':'#f59e0b20') + '; color:' + (i===0?'var(--blue)':'var(--gold)') + '; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + xs((ev.summary||'').slice(0,18)) + '</div>';
      });
      if(de.length > 2) gridCells += '<div style="font-size:7px; color:#52525b; margin-top:1px;">+' + (de.length-2) + '</div>';
      gridCells += '</div>';
    });

    bodyHtml = '<div style="display:flex; flex-direction:column; flex:1; min-height:0; overflow:hidden;">'
      + '<div style="display:grid; grid-template-columns:repeat(7, 1fr); border-bottom:1px solid var(--border); flex-shrink:0;">' + weekHeaders + '</div>'
      + '<div style="display:grid; grid-template-columns:repeat(7, 1fr); grid-auto-rows:minmax(72px, 1fr); flex:1; overflow-y:auto; border-bottom:1px solid var(--border);">' + gridCells + '</div>'
      + '<div style="display:flex; flex:0 0 auto; max-height:40%; overflow:hidden;">'
      + '<div style="flex:1; padding:16px 24px; overflow-y:auto;">'
      + '<div style="color:#52525b; font-size:10px; font-weight:700; letter-spacing:2px; margin-bottom:10px;">' + xs(activeDay) + '</div>'
      + eventsListHtml(activeDay)
      + '</div>'
      + gymHtml
      + '</div></div>';

  } else if(view === 'day'){
    // -- DAY VIEW --
    var dayLabel = new Date(activeDay + 'T12:00:00').toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });
    bodyHtml = '<div style="display:flex; flex:1; min-height:0; overflow:hidden;">'
      + '<div style="flex:1; padding:24px 32px; overflow-y:auto;">'
      + '<div style="color:#e4e4e7; font-size:16px; font-weight:700; margin-bottom:16px;">' + xs(dayLabel) + '</div>'
      + eventsListHtml(activeDay)
      + '</div>'
      + gymHtml
      + '</div>';

  } else {
    // -- WEEK VIEW --
    var weekDays = days.slice(0, 7);
    var dayStrip = '<div style="display:grid; grid-template-columns:repeat(7, 1fr); height:64px; border-bottom:1px solid var(--border); flex-shrink:0;">';
    weekDays.forEach(function(d){
      var dt = new Date(d.iso);
      var wd = dt.toLocaleDateString('en-GB', { weekday:'short' }).toUpperCase();
      var dn = dt.toLocaleDateString('en-GB', { day:'2-digit' });
      var isA = d.key === activeDay;
      var isT = d.key === today;
      dayStrip += '<div data-cal-day="' + d.key + '" style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; cursor:pointer;">';
      dayStrip += '<div style="color:' + (isA ? 'var(--violet)' : '#52525b') + '; font-size:9px; font-weight:700; letter-spacing:1.5px;">' + wd + '</div>';
      if(isT && isA){
        dayStrip += '<div style="width:32px; height:32px; background:var(--violet); color:#fff; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:16px; font-weight:600;">' + dn + '</div>';
      } else if(isT){
        dayStrip += '<div style="width:32px; height:32px; background:#ffffff10; color:var(--violet); border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:16px; font-weight:600;">' + dn + '</div>';
      } else {
        dayStrip += '<div style="color:' + (isA ? 'var(--violet)' : '#71717a') + '; font-size:16px; font-weight:600;">' + dn + '</div>';
      }
      dayStrip += '</div>';
    });
    dayStrip += '</div>';

    bodyHtml = '<div style="display:flex; flex-direction:column; flex:1; min-height:0; overflow:hidden;">'
      + dayStrip
      + '<div style="display:flex; flex:1; min-height:0; overflow:hidden;">'
      + '<div style="flex:1; padding:24px 32px; overflow-y:auto;">'
      + '<div style="color:#52525b; font-size:10px; font-weight:700; letter-spacing:2px; margin-bottom:16px;">' + xs(activeDay) + '</div>'
      + eventsListHtml(activeDay)
      + '</div>'
      + gymHtml
      + '</div></div>';
  }

  mainWrap.innerHTML = '<div style="display:flex; flex-direction:column; width:100%; height:100%; overflow:hidden;">' + headerHtml + bodyHtml + '</div>';

  if(window.lucide) window.lucide.createIcons();

  // Day click
  document.querySelectorAll('[data-cal-day]').forEach(function(el){
    el.onclick = function(){ localStorage.setItem('gc_cal_day', el.getAttribute('data-cal-day')); render(); };
    el.ondblclick = function(){
      var dk = el.getAttribute('data-cal-day');
      localStorage.setItem('gc_cal_day', dk);
      localStorage.setItem('gc_cal_anchor', new Date(dk + 'T12:00:00').toISOString());
      localStorage.setItem('gc_cal_view', 'day');
      render();
    };
  });

  // View switchers
  var setView = function(v){ localStorage.setItem('gc_cal_view', v); render(); };
  var dBtn = document.getElementById('cal-day'); if(dBtn) dBtn.onclick = function(){ setView('day'); };
  var wk = document.getElementById('cal-week'); if(wk) wk.onclick = function(){ setView('week'); };
  var mo = document.getElementById('cal-month'); if(mo) mo.onclick = function(){ setView('month'); };

  // Today
  var todayBtn = document.getElementById('cal-today');
  if(todayBtn) todayBtn.onclick = function(){ localStorage.setItem('gc_cal_anchor', new Date().toISOString()); localStorage.setItem('gc_cal_day', today); render(); };

  // Navigation arrows
  var shiftAnchor = function(dir){
    var a = new Date(anchor);
    if(view === 'month') a.setMonth(a.getMonth() + dir);
    else if(view === 'day') a.setDate(a.getDate() + dir);
    else a.setDate(a.getDate() + 7 * dir);
    localStorage.setItem('gc_cal_anchor', a.toISOString());
    if(view === 'day') localStorage.setItem('gc_cal_day', a.toISOString().slice(0,10));
    render();
  };
  var prev = document.getElementById('cal-prev'); if(prev) prev.onclick = function(){ shiftAnchor(-1); };
  var next = document.getElementById('cal-next'); if(next) next.onclick = function(){ shiftAnchor(1); };

  // Gym handlers
  var readExercises = function(){
    var exs = [];
    var count = (gym.exercises||[]).length;
    for(var i=0;i<count;i++){
      var n = document.querySelector('[data-ex-name="'+i+'"]');
      var s = document.querySelector('[data-ex-sets="'+i+'"]');
      var r = document.querySelector('[data-ex-reps="'+i+'"]');
      var name = n ? n.value : '';
      var sets = s ? s.value : '';
      var reps = r ? r.value : '';
      if(!name.trim()) continue;
      exs.push({ name: name.trim(), sets: sets ? Number(sets) : undefined, reps: reps.trim() || undefined });
    }
    return exs;
  };

  var addBtn = document.getElementById('gym-add');
  if(addBtn) addBtn.onclick = function(){
    gym.exercises = gym.exercises || [];
    gym.exercises.push({ name:'', sets:'', reps:'' });
    render();
  };

  var saveBtn = document.getElementById('gym-save');
  if(saveBtn) saveBtn.onclick = async function(){
    var name = document.getElementById('gym-name');
    var nm = name ? name.value : '';
    var exs = readExercises();
    var r = await fetch(withToken('/api/gym/override'), { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ date: activeDay, workout_name: nm, exercises: exs })});
    if(!r.ok) return alert('Failed to save');
    render();
  };

  var moveBtn = document.getElementById('gym-move');
  if(moveBtn) moveBtn.onclick = async function(){
    var dateEl = document.getElementById('gym-move-date');
    var to = dateEl ? dateEl.value : '';
    if(!to) return alert('Select a date');
    var name = document.getElementById('gym-name');
    var nm = name ? name.value : '';
    var exs = readExercises();
    var r = await fetch(withToken('/api/gym/override'), { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ date: to, workout_name: nm, exercises: exs })});
    if(!r.ok) return alert('Failed to move');
    await fetch(withToken('/api/gym/override?date=' + encodeURIComponent(activeDay)), { method:'DELETE' }).catch(function(){});
    localStorage.setItem('gc_cal_day', to);
    render();
  };
}


async function rLogs(){
  // Simple client-side controls for logs
  const level = localStorage.getItem('gc_logs_level') || '';
  const q = localStorage.getItem('gc_logs_q') || '';
  const qs = new URLSearchParams();
  if(level) qs.set('level', level);
  if(q) qs.set('q', q);
  qs.set('limit', '120');

  const logs = await jf('/api/logs?' + qs.toString(), []);
  const mainWrap = document.getElementById('main-wrap');
  
  mainWrap.innerHTML = `
    <div class="split-view">
      <div class="main-panel" style="font-family:'JetBrains Mono', monospace; background:#02040a;">
        <div class="panel-header" style="flex-direction:column; height:auto; padding:16px 24px; gap:10px; align-items:stretch;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; align-items:center; gap:12px;">
              <span style="color:#38bdf8; font-weight:700; font-size:12px;">GC_KERNEL_LIVE_STREAM</span>
              <span style="color:#71717a; font-size:10px;">UPTIME: 42h 12m · MEM: 1.2GB</span>
            </div>
            <div style="display:flex; gap:10px; align-items:center;">
              <select id="logs-level" style="height:30px; background:#151b2b; border:1px solid #ffffff1a; color:#e4e4e7; border-radius:8px; padding:0 10px; font-size:11px;">
                <option value="">ALL</option>
                <option value="log">LOG</option>
                <option value="warn">WARN</option>
                <option value="err">ERR</option>
              </select>
              <input id="logs-q" placeholder="filter..." style="height:30px; width:180px; background:#151b2b; border:1px solid #ffffff1a; color:#e4e4e7; border-radius:8px; padding:0 10px; font-size:11px; outline:none;" />
              <button id="logs-refresh" class="btn">Refresh</button>
            </div>
          </div>
          <div style="display:flex; gap:16px;">
            <span style="color:#71717a; font-size:9px;">LLM: <span style="color:#38bdf8;">70%</span></span>
            <span style="color:#71717a; font-size:9px;">MEM: <span style="color:#10b981;">40%</span></span>
          </div>
        </div>
        <div class="panel-content" style="padding:32px 32px 32px 64px; display:flex; flex-direction:column; gap:8px;">
          ${logs.map(l => {
            const msg = l.message || l.l || JSON.stringify(l);
            const ts = l.created_at ? new Date(l.created_at).toLocaleTimeString('en-GB', { hour12: false }) : new Date().toLocaleTimeString('en-GB', { hour12: false });
            let color = '#e4e4e7';
            if(l.level === 'warn') color = '#f59e0b';
            if(l.level === 'err') color = '#f43f5e';
            return `<div style="display:flex; gap:16px;">
              <div style="color:#71717a; font-size:11px;">[${xs(ts)}] [${xs((l.level||'log').toUpperCase())}]</div>
              <div style="color:${color}; font-size:12px;">${xs(msg)}</div>
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>
  `;

  // Wire controls
  const sel = document.getElementById('logs-level');
  const inp = document.getElementById('logs-q');
  const btn = document.getElementById('logs-refresh');
  if(sel) sel.value = level;
  if(inp) inp.value = q;
  if(sel) sel.onchange = () => { localStorage.setItem('gc_logs_level', sel.value); render(); };
  if(inp) inp.onkeydown = (e) => {
    if(e.key === 'Enter') { localStorage.setItem('gc_logs_q', inp.value || ''); render(); }
  };
  if(btn) btn.onclick = () => render();
}

async function rEmails(){
  const mainWrap = document.getElementById('main-wrap');
  const selectedId = localStorage.getItem('gc_email_sel') || '';
  const emailFilter = localStorage.getItem('gc_email_filter') || 'all';
  const allEmails = (await jf('/api/emails?limit=500', []));
  if(allEmails && allEmails.length) _emailCache = allEmails;
  else if(_emailCache.length) { /* use cache if fetch fails */ }
  const inbox = emailFilter === 'all' ? allEmails
    : emailFilter === 'action' ? allEmails.filter(e => (e.action_needed === 'reply' || e.action_needed === 'test'))
    : emailFilter === 'ice' ? allEmails.filter(e => { try { const d = new Date(e.email_date || e.created_at || ''); return String(e.status||'neutral')==='neutral' && !Number.isNaN(d.getTime()) && (Date.now()-d.getTime())/(1000*60*60*24) >= 17; } catch{ return false; } })
    : allEmails.filter(e => (e.status || 'neutral') === emailFilter);
  const selected = inbox.find(e => String(e.id) === String(selectedId)) || inbox[0] || null;
  if(selected && String(selected.id) !== String(selectedId)) localStorage.setItem('gc_email_sel', String(selected.id));

  const detail = selected ? await jf('/api/emails/' + selected.id, {}) : {};

  const badgeColor = (s) => s === 'positive' ? '#10b981' : s === 'negative' ? '#f43f5e' : '#64748B';
  const isIce = (e) => {
    try{
      if(!e) return false;
      if(String(e.status||'neutral') !== 'neutral') return false;
      const d = new Date(e.email_date || e.created_at || '');
      if(Number.isNaN(d.getTime())) return false;
      const days = (Date.now() - d.getTime()) / (1000*60*60*24);
      return days >= 17;
    }catch{ return false; }
  };

  const gmailLink = selected && detail.gmail_message_id
    ? `https://mail.google.com/mail/u/0/#inbox/${detail.gmail_message_id}`
    : (selected && detail.from_addr ? `mailto:${detail.from_addr}?subject=Re: ${encodeURIComponent(detail.subject || '')}` : '');

  // Save scroll position of side-panel before re-render
  const prevScroll = (document.querySelector('.side-panel .panel-content') || {}).scrollTop || 0;

  mainWrap.innerHTML = `
    <div class="split-view">
      <div class="side-panel">
        <div class="panel-header" style="height:auto; min-height:56px; flex-direction:column; align-items:stretch; gap:6px; padding:8px 12px;">
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <div style="display:flex; align-items:center; gap:8px;">
              <div class="panel-title" style="font-size:12px; letter-spacing:0.5px;">INBOX</div>
              <span style="font-size:11px; color:var(--t3); font-weight:500;">${inbox.length}</span>
            </div>
            <button id="btn-scan-emails" style="font-size:10px; padding:3px 10px; border-radius:7px; border:none; background:var(--blue); color:#fff; cursor:pointer; font-weight:600; letter-spacing:0.3px; opacity:0.9; transition:opacity 0.2s;" title="Scan Gmail for job-related emails" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.9'">Scan Gmail</button>
          </div>
          <div style="display:flex; overflow-x:auto; background:rgba(120,120,128,0.12); border-radius:9px; padding:2px; gap:2px; width:100%; scrollbar-width:none; -webkit-overflow-scrolling:touch;">
            ${[
              { id:'all', label:'All', dot:'' },
              { id:'action', label:'Action', dot:'#f59e0b' },
              { id:'positive', label:'Positive', dot:'#10b981' },
              { id:'neutral', label:'Pending', dot:'#64748B' },
              { id:'negative', label:'Rejected', dot:'#f43f5e' },
              { id:'ice', label:'Cold', dot:'#38bdf8' },
            ].map(f => {
              const active = emailFilter === f.id;
              const count = f.id === 'all' ? allEmails.length
                : f.id === 'action' ? allEmails.filter(e => (e.action_needed === 'reply' || e.action_needed === 'test')).length
                : f.id === 'ice' ? allEmails.filter(e => { try { const d = new Date(e.email_date || e.created_at || ''); return String(e.status||'neutral')==='neutral' && !Number.isNaN(d.getTime()) && (Date.now()-d.getTime())/(1000*60*60*24) >= 17; } catch{ return false; } }).length
                : allEmails.filter(e => (e.status||'neutral') === f.id).length;
              return '<button data-email-filter="'+f.id+'" style="flex-shrink:0; white-space:nowrap; font-size:11px; padding:5px 10px; border-radius:7px; border:none; background:'+(active ? 'var(--card)' : 'transparent')+'; color:'+(active ? 'var(--t1)' : 'var(--t3)')+'; cursor:pointer; font-weight:'+(active ? '600' : '400')+'; transition:all 0.2s ease;'+(active ? ' box-shadow:0 1px 3px rgba(0,0,0,0.15);' : '')+'">'+(f.dot ? '<span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:'+f.dot+'; margin-right:4px; vertical-align:middle; opacity:'+(count>0?'1':'0.35')+'"></span>' : '')+f.label+'<span style="margin-left:4px; font-size:10px; opacity:0.5; font-weight:400;">'+count+'</span></button>';
            }).join('')}
          </div>
        </div>
        <div id="scan-progress-bar" style="display:none; padding:8px 12px;">
          <div style="font-size:11px; color:var(--t2); margin-bottom:4px;" id="scan-label">Starting…</div>
          <div style="width:100%; height:6px; background:var(--card); border-radius:3px; overflow:hidden;">
            <div id="scan-fill" style="width:0%; height:100%; background:linear-gradient(90deg, var(--blue), var(--gold)); border-radius:3px; transition: width 0.5s ease;"></div>
          </div>
        </div>
        <div class="panel-content" id="email-list-scroll">
          ${inbox.map(e => {
            const d = e.email_date || e.created_at || '';
            const ice = isIce(e);
            const action = e.action_needed || '';
            const stageLabel = e.stage === 'test' ? '📝 Test' : e.stage === 'interview' ? '🤝 Interview' : e.stage === 'offer' ? '🎉 Offer' : '';
            return `
            <div class="list-item ${selected && selected.id === e.id ? 'active' : ''}" data-email-id="${e.id}" style="border-left:3px solid ${badgeColor(e.status)};">
              <div class="li-title wrap-anywhere">${xs(decodeHtml(e.from_addr || ''))}</div>
              <div class="li-sub wrap-anywhere">${xs(decodeHtml(e.subject || ''))}</div>
              <div class="li-meta">
                <span>${xs(d)}</span>
                <span class="li-badge" style="background:${badgeColor(e.status)}20; color:${badgeColor(e.status)};">${xs((e.status||'neutral').toUpperCase())}</span>
                ${action === 'reply' ? '<span class="li-badge" style="background:#f59e0b20; color:#f59e0b; font-weight:700;">&#9993; Reply</span>' : ''}
                ${action === 'test' ? '<span class="li-badge" style="background:#8b5cf620; color:#8b5cf6; font-weight:700;">&#128221; Test</span>' : ''}
                ${stageLabel && action !== 'test' ? '<span class="li-badge" style="background:#3B82F620; color:var(--blue); font-weight:600;">'+stageLabel+'</span>' : ''}
                ${ice ? '<span class="li-badge" style="background:#38bdf820; color:#38bdf8; font-weight:800;">&#10052; Cold</span>' : ''}
              </div>
            </div>`;
          }).join('') || '<div style="color:var(--t3);">Inbox is empty.</div>'}
        </div>
      </div>
      <div class="main-panel" style="background:#080c16;">
        <div class="panel-header" style="flex-wrap:wrap; gap:6px;">
          <div class="panel-title">EMAIL DETAIL</div>
          ${selected ? `
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              <button class="btn" data-set-status="positive">&#x1F7E2; Positive</button>
              <button class="btn" data-set-status="neutral">&#x26AA; Neutral</button>
              <button class="btn btn-danger" data-set-status="negative">&#x1F534; Negative</button>
              <button class="btn btn-gold" id="email-followup">Generate follow-up</button>
              ${gmailLink ? `<a href="${gmailLink}" target="_blank" rel="noopener" class="btn" style="text-decoration:none; display:flex; align-items:center; gap:4px;"><i data-lucide="external-link" style="width:12px;height:12px;"></i>Open in Mail</a>` : ''}
              <button class="btn" style="color:#f43f5e; border-color:#f43f5e33;" id="email-delete-btn"><i data-lucide="trash-2" style="width:12px;height:12px;"></i></button>
            </div>
          ` : ``}
        </div>
        <div class="panel-content" style="padding:40px;">
          ${selected ? `
            <div style="margin-bottom:16px;">
              <div style="color:#71717a; font-size:10px; font-weight:700; letter-spacing:1px; margin-bottom:8px;">FROM</div>
              <div class="wrap-anywhere" style="color:#e4e4e7; font-size:13px; font-weight:700;">${xs(decodeHtml(detail.from_addr || ''))}</div>
            </div>
            <div style="margin-bottom:24px;">
              <div style="color:#71717a; font-size:10px; font-weight:700; letter-spacing:1px; margin-bottom:8px;">SUBJECT</div>
              <div class="wrap-anywhere" style="color:#ffffff; font-size:20px; font-weight:800; line-height:1.2;">${xs(decodeHtml(detail.subject || ''))}</div>
            </div>
            <div id="email-body-box" class="scroll-box" style="background:#ffffff05; border-radius:16px; padding:24px; border:1px solid var(--border); margin-bottom:16px; max-height:50vh; overflow-y:auto;">
              <div id="email-body-content" class="wrap-anywhere" style="color:#cbd5e1; font-size:13px; line-height:1.7; white-space:pre-wrap;">
                ${xs(decodeHtml(detail.snippet || '')).replace(/\n/g, '<br/>')}
              </div>
              <div id="email-body-loading" style="display:none; text-align:center; padding:12px;">
                <span class="gc-spinner sm"></span>
                <span style="font-size:11px; color:#71717a; margin-left:8px;">Loading full message…</span>
              </div>
            </div>
            ${(detail.followup_body || detail.followup_subject) ? `
              <div style="margin-top:18px; margin-bottom:8px; color:#71717a; font-size:10px; font-weight:800; letter-spacing:1.5px;">FOLLOW-UP DRAFT</div>
              <div style="background:#0b1020; border-radius:16px; padding:18px; border:1px solid var(--border);">
                <div style="margin-bottom:8px;">
                  <div style="font-size:10px; color:#52525b; margin-bottom:4px;">SUBJECT</div>
                  <input id="fu-subject" value="${xs(detail.followup_subject || '')}" style="width:100%; height:34px; background:#00000033; border:1px solid #ffffff1a; color:#e4e4e7; border-radius:8px; padding:0 12px; font-size:13px; font-weight:700; outline:none;" />
                </div>
                <div style="margin-bottom:10px;">
                  <div style="font-size:10px; color:#52525b; margin-bottom:4px;">BODY</div>
                  <textarea id="fu-body" style="width:100%; min-height:120px; background:#00000033; border:1px solid #ffffff1a; color:#cbd5e1; border-radius:8px; padding:12px; font-size:12px; line-height:1.7; outline:none; resize:vertical;">${xs(detail.followup_body || '')}</textarea>
                </div>
                <div style="display:flex; gap:8px; align-items:center;">
                  <div style="font-size:10px; color:#52525b; margin-right:4px;">ATTACH CV</div>
                  ${cvPickerHtml('fu-cv', true)}
                  <button id="fu-save" class="btn btn-primary" style="margin-left:auto;">Save draft</button>
                </div>
              </div>
            ` : ``}
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:16px;">
              <div style="color:var(--t3); font-size:11px;">
                status: <b style="color:${badgeColor(detail.status)}">${xs((detail.status||'neutral').toUpperCase())}</b> &middot; id: ${xs(String(detail.id||''))}
              </div>
              <span style="color:#71717a; font-size:13px; cursor:pointer;" data-set-status="negative">Not a Job Search Email</span>
            </div>
          ` : `<div style="color:var(--t3);">No emails found.</div>`}
        </div>
      </div>
    </div>
  `;

  // Restore scroll position of email list
  const listEl = document.getElementById('email-list-scroll');
  if(listEl) listEl.scrollTop = prevScroll;

  // Filter buttons
  document.querySelectorAll('[data-email-filter]').forEach(el => {
    el.onclick = () => {
      localStorage.setItem('gc_email_filter', el.getAttribute('data-email-filter'));
      localStorage.removeItem('gc_email_sel');
      render();
    };
  });

  // Email selection — preserve scroll
  document.querySelectorAll('[data-email-id]').forEach(el => {
    el.onclick = () => {
      const scrollEl = document.getElementById('email-list-scroll');
      if(scrollEl) localStorage.setItem('gc_email_scroll', String(scrollEl.scrollTop));
      localStorage.setItem('gc_email_sel', el.getAttribute('data-email-id'));
      render();
    };
  });

  // After render, restore saved scroll from click
  const savedScroll = localStorage.getItem('gc_email_scroll');
  if(savedScroll && listEl) {
    listEl.scrollTop = parseInt(savedScroll, 10) || 0;
    localStorage.removeItem('gc_email_scroll');
  }

  // Fetch full email body on demand
  if(selected) {
    const bodyContent = document.getElementById('email-body-content');
    const bodyLoading = document.getElementById('email-body-loading');
    if(bodyContent && bodyLoading) {
      bodyLoading.style.display = 'flex';
      bodyLoading.style.alignItems = 'center';
      bodyLoading.style.justifyContent = 'center';
      jf('/api/emails/' + selected.id + '/body', null).then(function(data) {
        bodyLoading.style.display = 'none';
        if(data && data.body && data.body.length > (detail.snippet || '').length) {
          bodyContent.innerHTML = xs(decodeHtml(data.body)).replace(/\n/g, '<br/>');
        }
      }).catch(function(){ bodyLoading.style.display = 'none'; });
    }
  }

  // Status buttons
  document.querySelectorAll('[data-set-status]').forEach(el => {
    el.onclick = async () => {
      if(!selected) return;
      const status = el.getAttribute('data-set-status');
      const r = await fetch(withToken('/api/emails/' + selected.id), { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ status })});
      if(!r.ok) alert('Failed to update status');
      render();
    };
  });

  // Delete button
  const delBtn = document.getElementById('email-delete-btn');
  if(delBtn && selected) {
    delBtn.onclick = async () => {
      if(!confirm('Delete this email from dashboard? (This does not delete from Gmail)')) return;
      const r = await fetch(withToken('/api/emails/' + selected.id), { method:'DELETE' });
      if(r.ok) {
        // Remove from cache without full re-fetch to avoid scroll jump
        const idx = _emailCache.findIndex(e => String(e.id) === String(selected.id));
        if(idx !== -1) _emailCache.splice(idx, 1);
        // Select next or previous email
        const next = _emailCache[idx] || _emailCache[idx - 1] || null;
        if(next) localStorage.setItem('gc_email_sel', String(next.id));
        else localStorage.removeItem('gc_email_sel');
        render();
      } else {
        alert('Failed to delete email');
      }
    };
  }

  // Follow-up button
  const fbtn = document.getElementById('email-followup');
  if(fbtn){
    fbtn.onclick = async () => {
      if(!selected) return;
      fbtn.disabled = true; fbtn.innerHTML = '<span class="gc-spinner sm"></span> Generating…';
      var detailPanel = fbtn.closest('.main-panel');
      var detailContent = detailPanel ? detailPanel.querySelector('.panel-content') : null;
      if(detailContent) detailContent.innerHTML = gcLoaderHtml('fu-loader', 'gold', 'Generating follow-up…');
      gcStartTimer('fu-loader');
      const r = await fetch(withToken('/api/emails/' + selected.id + '/followup'), { method:'POST' });
      if(!r.ok){ gcStopTimer('fu-loader'); fbtn.disabled=false; fbtn.textContent='Generate follow-up'; render(); return alert('Failed to start follow-up'); }
      const js = await r.json();
      if(js && js.taskId){
        await pollTask(js.taskId, (t) => {
          gcUpdateMsg('fu-loader', t.lastMessage || t.status || 'Working…');
          if(t.status === 'done'){ gcStopTimer('fu-loader'); render(); }
          if(t.status === 'error'){ gcStopTimer('fu-loader'); fbtn.disabled=false; fbtn.textContent='Generate follow-up'; alert('Follow-up failed: ' + (t.error||'')); render(); }
        });
      }
    };
  }
  var fuSave = document.getElementById('fu-save');
  if(fuSave && selected){
    fuSave.onclick = async () => {
      var subj = (document.getElementById('fu-subject') || {}).value || '';
      var body = (document.getElementById('fu-body') || {}).value || '';
      var r = await fetch(withToken('/api/emails/' + selected.id), { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ followup_subject: subj, followup_body: body })});
      if(r.ok) alert('Follow-up draft saved'); else alert('Save failed');
    };
  }

  // Scan Gmail button + progress
  var scanBtn = document.getElementById('btn-scan-emails');
  var scanBar = document.getElementById('scan-progress-bar');
  if(scanBtn){
    // On load, check if a scan is already running
    jf('/api/emails/scan/progress', {}).then(function(p){
      if(p && p.running) {
        var btn = document.getElementById('btn-scan-emails');
        if(btn) { btn.disabled = true; btn.textContent = 'Scanning…'; }
        var bar = document.getElementById('scan-progress-bar');
        if(bar) bar.style.display = 'block';
        startScanPolling();
      }
    });
    scanBtn.onclick = async () => {
      var days = prompt('Scan how many days back?', '45');
      if(!days) return;
      scanBtn.disabled = true; scanBtn.textContent = 'Starting…';
      try {
        var r = await fetch(withToken('/api/emails/scan'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ days: parseInt(days,10) || 45 }) });
        var js = await r.json();
        if(js.started) {
          startScanPolling();
        } else if(js.reason === 'already running') {
          startScanPolling();
        } else {
          scanBtn.disabled = false; scanBtn.textContent = 'Scan Gmail';
        }
      } catch(e) { scanBtn.disabled = false; scanBtn.textContent = 'Scan Gmail'; alert('Scan failed: ' + e); }
    };
  }
  function startScanPolling(){
    if(window.scanPollInterval) clearInterval(window.scanPollInterval);
    window.scanPollInterval = setInterval(async function(){
      try {
        var p = await jf('/api/emails/scan/progress', {});
        var pct = p.processed || 0;
        // Update UI elements if they exist (may not if on different tab)
        var btn = document.getElementById('btn-scan-emails');
        var bar = document.getElementById('scan-progress-bar');
        var fill = document.getElementById('scan-fill');
        var label = document.getElementById('scan-label');
        if(btn) { btn.disabled = true; btn.textContent = 'Scanning…'; }
        if(bar) bar.style.display = 'block';
        if(fill) fill.style.width = pct + '%';
        if(label) {
          var phaseText = p.phase === 'fetching' ? 'Fetching emails…' :
            p.phase === 'metadata' ? 'Reading headers… (' + p.totalEmails + ' emails)' :
            p.phase === 'classifying' ? 'AI classifying… ' + p.matched + ' matches' :
            p.phase === 'done' ? 'Done! ' + p.matched + ' job emails found' :
            p.phase === 'error' ? 'Error: ' + (p.error||'unknown') : 'Starting…';
          label.textContent = phaseText + ' — ' + pct + '%';
        }
        // Update sidebar scan badge
        var scanBadge = document.getElementById('scan-bg-badge');
        if(scanBadge) scanBadge.style.display = p.running ? 'inline-block' : 'none';
        if(!p.running) {
          clearInterval(window.scanPollInterval);
          window.scanPollInterval = null;
          if(btn) { btn.disabled = false; btn.textContent = 'Scan Gmail'; }
          setTimeout(function(){ if(bar) bar.style.display = 'none'; if(CURRENT_PAGE==='emails') render(); }, 2000);
        }
      } catch(e) {
        clearInterval(window.scanPollInterval);
        window.scanPollInterval = null;
      }
    }, 2000);
  }
}

async function rApps(){
  const filter = localStorage.getItem('gc_app_filter') || '';
  const selId = localStorage.getItem('gc_app_sel') || '';

  const qs = new URLSearchParams();
  if(filter) qs.set('status', filter);
  qs.set('limit', '300');
  const apps = await jf('/api/applications?' + qs.toString(), []);
  const mainWrap = document.getElementById('main-wrap');
  const selected = apps.find(a => String(a.id) === String(selId)) || null;
  const detail = selected ? await jf('/api/applications/' + encodeURIComponent(selected.id), {}) : {};

  const columns = [
    { key: 'new', label: 'DRAFT', color: '#71717a' },
    { key: 'applied', label: 'APPLIED', color: '#3b82f6' },
    { key: 'interview', label: 'INTERVIEW', color: '#f59e0b' },
    { key: 'offer', label: 'OFFER', color: '#10b981' },
    { key: 'rejected', label: 'REJECTED', color: '#f43f5e' }
  ];

  const grouped = {};
  columns.forEach(c => grouped[c.key] = []);
  apps.forEach(a => {
    const s = (a.status || a.pipeline_status || 'new').toLowerCase();
    if(grouped[s]) grouped[s].push(a);
    else grouped['new'].push(a);
  });

  mainWrap.innerHTML = `
    <div style="display:flex; height:100%; overflow:hidden;">
      <div style="flex:1; display:flex; overflow-x:auto; gap:0;">
        ${columns.map(col => `
          <div style="flex:1; min-width:220px; display:flex; flex-direction:column; border-right:1px solid var(--border);">
            <div style="padding:16px 16px 8px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:11px; font-weight:${col.key==='interview'||col.key==='offer' ? '700' : '600'}; color:${col.color}; letter-spacing:0.5px;">${col.label} (${grouped[col.key].length})</span>
            </div>
            <div style="flex:1; overflow-y:auto; padding:0 12px 12px;">
              ${grouped[col.key].map(a => `
                <div data-app-id="${a.id}" style="background:#0f1420; border:1px solid ${selected && selected.id === a.id ? '#3B82F640' : '#ffffff10'}; border-radius:12px; padding:14px; margin-bottom:10px; cursor:pointer; transition:all 0.1s;">
                  <div style="font-size:14px; font-weight:600; color:${selected && selected.id === a.id ? 'var(--blue)' : '#e4e4e7'};">${xs(a.position||a.company||'')}</div>
                  <div style="font-size:12px; color:#71717a; margin-top:4px;">${xs(a.company||'')}${a.location ? ' · ' + xs(a.location) : ''}</div>
                  ${a.last_update ? '<div style="font-size:10px; color:#3f3f46; margin-top:8px;">' + xs(a.last_update) + '</div>' : ''}
                </div>
              `).join('') || '<div style="color:#3f3f46; font-size:11px; padding:8px;">No items</div>'}
            </div>
          </div>
        `).join('')}
      </div>
      <div style="width:320px; background:#080a12; border-left:1px solid var(--border); display:flex; flex-direction:column; flex-shrink:0;">
        <div class="panel-header">
          <div class="panel-title" style="color:var(--gold);">Intelligence</div>
          ${selected ? '<button id="app-save" class="btn btn-violet">Save</button>' : ''}
        </div>
        <div class="panel-content" style="padding:24px;">
          ${selected ? `
            <div style="font-size:20px; font-weight:700; color:#fff;">${xs(detail.position||detail.title||'')}</div>
            <div style="font-size:13px; color:#a1a1aa; margin-top:4px;">${xs(detail.company||'')} · ${xs((detail.status||'new').charAt(0).toUpperCase() + (detail.status||'new').slice(1))}</div>
            <div style="margin-top:20px;">
              <select id="app-status" style="width:100%; height:36px; background:#151b2b; border:1px solid #ffffff1a; color:#e4e4e7; border-radius:8px; padding:0 12px; font-size:12px;">
                <option value="new">Draft</option>
                <option value="applied">Applied</option>
                <option value="interview">Interview</option>
                <option value="offer">Offer</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div style="margin-top:20px;">
              <div style="color:#71717a; font-size:10px; font-weight:800; letter-spacing:1.5px; margin-bottom:8px;">OUTCOME / NOTES</div>
              <textarea id="app-outcome" style="width:100%; min-height:80px; background:#00000033; border:1px solid #ffffff1a; color:#e4e4e7; border-radius:8px; padding:12px; font-size:12px; line-height:1.5; outline:none; resize:vertical;">${xs(detail.outcome||'')}</textarea>
            </div>
            <div style="display:flex; flex-direction:column; gap:8px; margin-top:16px;">
              ${detail.url ? '<a class="btn btn-primary" href="' + xs(detail.url) + '" target="_blank" style="width:100%; text-align:center; height:36px;">Open posting</a>' : ''}
              ${detail.application_folder ? '<button class="btn" data-copy="' + xs(detail.application_folder) + '" style="width:100%;">Copy folder path</button>' : ''}
            </div>

          ` : '<div style="color:var(--t3); text-align:center;">Select an application to see details.</div>'}
        </div>
      </div>
    </div>
  `;

  document.querySelectorAll('[data-app-id]').forEach(el => {
    el.onclick = () => { localStorage.setItem('gc_app_sel', el.getAttribute('data-app-id')); render(); };
  });

  document.querySelectorAll('[data-copy]').forEach(el => {
    el.onclick = async () => {
      try{ await navigator.clipboard.writeText(el.getAttribute('data-copy')); }catch{ alert('Copy failed'); }
    };
  });

  const st = document.getElementById('app-status');
  if(st && selected) st.value = detail.pipeline_status || selected.status || 'new';

  const saveBtn = document.getElementById('app-save');
  if(saveBtn && selected){
    saveBtn.onclick = async () => {
      const status = document.getElementById('app-status')?.value || 'new';
      const outcome = document.getElementById('app-outcome')?.value || '';
      const r = await fetch(withToken('/api/applications/' + encodeURIComponent(selected.id)), { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ pipeline_status: status, outcome })});
      if(!r.ok) return alert('Save failed');
      render();
    };
  }
}

async function rMemories(){
  const mainWrap = document.getElementById('main-wrap');
  const q = localStorage.getItem('gc_mem_q') || '';
  const selectedId = localStorage.getItem('gc_mem_sel') || '';

  const qs = new URLSearchParams();
  if(q) qs.set('q', q);
  qs.set('limit', '500');
  const mems = q ? await jf('/api/memories/search?' + qs.toString(), []) : await jf('/api/memories?limit=500', []);

  const selected = mems.find(m => String(m.id) === String(selectedId)) || null;

  mainWrap.innerHTML = `
    <div style="display:flex; flex-direction:column; width:100%; height:100%; overflow:hidden;">
      <!-- Graph Visualization -->
      <div style="height:240px; background:#080a12; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:center; position:relative; flex-shrink:0;">
        <div style="position:relative; width:600px; height:200px;">
          <!-- Central node -->
          <div style="position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:100px; height:100px; border-radius:50%; background:#F59E0B20; border:2px solid var(--gold); box-shadow:0 0 40px #F59E0B40; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px;">
            <i data-lucide="brain" style="width:28px; height:28px; color:var(--gold);"></i>
            <span style="font-size:11px; font-weight:700; color:#fff;">David</span>
          </div>
          <!-- Satellite nodes — dynamic from real memories -->
          ${(function(){
            var _nodePos = [
              'position:absolute; left:10px; top:30px;',
              'position:absolute; right:10px; top:20px;',
              'position:absolute; left:30px; bottom:10px;',
              'position:absolute; right:30px; bottom:20px;'
            ];
            var _sample = mems.slice(0, 4);
            while(_sample.length < 4) _sample.push(null);
            return _sample.map(function(m, i){
              var label = m ? xs((m.content || '').slice(0, 32)) + (_sample[i].content && _sample[i].content.length > 32 ? '…' : '') : '—';
              return '<div style="' + _nodePos[i] + ' padding:8px 16px; background:#ffffff0a; border:1px solid #ffffff20; border-radius:20px; font-size:11px; color:#a1a1aa; max-width:160px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + label + '</div>';
            }).join('');
          })()}
          <!-- Connecting lines via SVG -->
          <svg style="position:absolute; inset:0; width:100%; height:100%; pointer-events:none;">
            <line x1="250" y1="80" x2="130" y2="45" stroke="#F59E0B20" stroke-width="1"/>
            <line x1="350" y1="80" x2="480" y2="35" stroke="#F59E0B20" stroke-width="1"/>
            <line x1="280" y1="130" x2="140" y2="170" stroke="#F59E0B20" stroke-width="1"/>
            <line x1="320" y1="130" x2="460" y2="155" stroke="#F59E0B20" stroke-width="1"/>
          </svg>
        </div>
      </div>
      <!-- Bottom KPI strip for memories -->
      <div style="height:56px; display:flex; border-bottom:1px solid var(--border); flex-shrink:0;">
        ${(function(){
          var _tagSet = new Set(mems.flatMap(function(m){ return (m.tags||'').split(',').map(function(t){ return t.trim(); }).filter(Boolean); }));
          var _cats = new Set(mems.map(function(m){ return m.category || ''; }).filter(Boolean));
          return '<div style="flex:1; display:flex; align-items:center; padding:0 32px; gap:8px; border-right:1px solid var(--border);">'
            + '<span style="font-size:24px; font-weight:700; color:var(--blue);">' + mems.length + '</span>'
            + '<span style="font-size:9px; font-weight:500; color:#71717a; letter-spacing:1.5px;">STORED FACTS</span>'
            + '</div>'
            + '<div style="flex:1; display:flex; align-items:center; padding:0 32px; gap:8px; border-right:1px solid var(--border);">'
            + '<span style="font-size:24px; font-weight:700; color:var(--gold);">' + _tagSet.size + '</span>'
            + '<span style="font-size:9px; font-weight:500; color:#71717a; letter-spacing:1.5px;">UNIQUE TAGS</span>'
            + '</div>'
            + '<div style="flex:1; display:flex; align-items:center; padding:0 32px; gap:8px;">'
            + '<span style="font-size:24px; font-weight:700; color:var(--t2);">' + _cats.size + '</span>'
            + '<span style="font-size:9px; font-weight:500; color:#71717a; letter-spacing:1.5px;">CATEGORIES</span>'
            + '</div>';
        })()}
      </div>
      <!-- Search + action bar -->
      <div style="height:56px; display:flex; align-items:center; padding:0 24px; gap:12px; border-bottom:1px solid var(--border); flex-shrink:0;">
        <input id="mem-q" placeholder="Search memories..." value="${xs(q)}"
          style="flex:1; height:34px; background:#151b2b; border:1px solid #ffffff1a; color:#e4e4e7; border-radius:10px; padding:0 14px; font-size:12px; outline:none;" />
        <button id="mem-new" class="btn btn-violet">New</button>
        ${selected ? '<button id="mem-save" class="btn btn-primary">Save</button><button id="mem-del" class="btn btn-danger">Delete</button>' : ''}
      </div>
      <!-- Memory cards grid + optional editor -->
      <div style="flex:1; overflow-y:auto; padding:20px 24px;">
        ${selected ? `
          <div style="background:#0f1420; border:1px solid #3B82F640; border-radius:12px; padding:16px; margin-bottom:20px;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
              <span style="font-family:'JetBrains Mono'; font-size:12px; color:var(--gold);">#${selected.id}</span>
              <span style="font-size:10px; color:#52525b;">Editing</span>
            </div>
            <textarea id="mem-content" style="width:100%; min-height:80px; background:#00000033; border:1px solid #ffffff1a; color:#e4e4e7; border-radius:8px; padding:12px; font-size:13px; line-height:1.5; outline:none; resize:vertical;">${xs(selected.content)}</textarea>
            <input id="mem-tags" value="${xs(selected.tags||'')}" placeholder="tags..."
              style="margin-top:8px; width:100%; height:34px; background:#00000033; border:1px solid #ffffff1a; color:#e4e4e7; border-radius:8px; padding:0 12px; font-size:12px; outline:none;" />
            <div style="color:#52525b; font-size:10px; margin-top:6px;">created: ${xs(selected.created_at||'')} · accessed: ${xs(selected.accessed_at||'')}</div>
          </div>
        ` : ''}
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:12px;">
          ${mems.map(m => `
            <div data-mem-id="${m.id}" style="background:#ffffff05; border:1px solid ${selected && selected.id === m.id ? '#3B82F640' : '#ffffff1a'}; border-radius:12px; padding:16px; cursor:pointer; transition:all 0.1s;">
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                <span style="font-family:'JetBrains Mono'; font-size:12px; color:var(--gold);">#${m.id}</span>
                ${m.tags ? '<span style="font-size:10px; color:#52525b;">' + xs(m.tags) + '</span>' : ''}
              </div>
              <div style="font-size:13px; color:#e4e4e7; line-height:1.5; overflow:hidden; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical;">${xs(m.content)}</div>
            </div>
          `).join('') || '<div style="color:var(--t3); grid-column:1/-1;">No memories found.</div>'}
        </div>
      </div>
    </div>
  `;

  document.querySelectorAll('[data-mem-id]').forEach(el => {
    el.onclick = () => { localStorage.setItem('gc_mem_sel', el.getAttribute('data-mem-id')); render(); };
  });

  const qEl = document.getElementById('mem-q');
  if(qEl) qEl.onkeydown = (e) => {
    if(e.key === 'Enter') { localStorage.setItem('gc_mem_q', qEl.value || ''); localStorage.removeItem('gc_mem_sel'); render(); }
  };

  const newBtn = document.getElementById('mem-new');
  if(newBtn) newBtn.onclick = async () => {
    const content = prompt('New memory (content):');
    if(!content || !content.trim()) return;
    const tags = prompt('Tags (optional):') || '';
    await fetch(withToken('/api/memories'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ content: content.trim(), tags: tags.trim() })});
    localStorage.setItem('gc_mem_q','');
    localStorage.removeItem('gc_mem_sel');
    render();
  };

  const saveBtn = document.getElementById('mem-save');
  if(saveBtn && selected){
    saveBtn.onclick = async () => {
      const contentEl = document.getElementById('mem-content');
      const tagsEl = document.getElementById('mem-tags');
      const c = (contentEl && contentEl.value || '').trim();
      const tags = (tagsEl && tagsEl.value || '').trim();
      if(!c) return alert('Content is required');
      const r = await fetch(withToken('/api/memories/' + selected.id), { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ content: c, tags })});
      if(!r.ok) alert('Save failed');
      render();
    };
  }

  const delBtn = document.getElementById('mem-del');
  if(delBtn && selected){
    delBtn.onclick = async () => {
      if(!confirm('Delete this memory?')) return;
      const r = await fetch(withToken('/api/memories/' + selected.id), { method:'DELETE' });
      if(!r.ok) alert('Delete failed');
      localStorage.removeItem('gc_mem_sel');
      render();
    };
  }
}

async function rSpontanee(){
  const mainWrap = document.getElementById('main-wrap');
  const filter = localStorage.getItem('gc_spon_filter') || 'all';
  const selectedId = localStorage.getItem('gc_spon_sel') || '';

  const stats = await jf('/api/spontanee/stats', { byStatus: {}, sent: 0, replied: 0, sentToday: 0 });
  const targets = await jf('/api/spontanee/targets?status=' + encodeURIComponent(filter === 'all' ? '' : filter) + '&limit=300', []);
  const selected = targets.find(t => String(t.id) === String(selectedId)) || null;
  const detail = selected ? await jf('/api/spontanee/targets/' + selected.id, {}) : {};

  const statusBadge = (s) => {
    if(s === 'sent') return '<span style="color:#3b82f6; font-size:10px; font-weight:500;">Envoyé ✓</span>';
    if(s === 'replied') return '<span style="color:#10b981; font-size:10px; font-weight:500;">Répondu 💬</span>';
    if(s === 'draft') return '<span style="color:#8b5cf6; font-size:10px; font-weight:500;">À contacter</span>';
    if(s === 'skipped') return '<span style="color:#f59e0b; font-size:10px; font-weight:500;">Relancé</span>';
    return '<span style="color:#52525b; font-size:10px; font-weight:500;">Non contacté</span>';
  };

  const filterTabs = [
    { key: 'all', label: 'Tous (' + targets.length + ')' },
    { key: 'pending', label: 'Non contactés' },
    { key: 'sent', label: 'Envoyés' },
    { key: 'replied', label: 'Répondus' }
  ];

  mainWrap.innerHTML = `
    <div style="display:flex; flex:1; min-height:0; overflow:hidden;">
      <div style="flex:1; display:flex; flex-direction:column; overflow:hidden; min-height:0;">
        <!-- Campaign action bar -->
        <div style="height:56px; display:flex; align-items:center; justify-content:space-between; padding:0 24px; border-bottom:1px solid var(--border); flex-shrink:0;">
          <div style="display:flex; align-items:center; gap:12px;">
            <span style="font-size:11px; font-weight:600; color:#a1a1aa; letter-spacing:0.5px;">CAMPAGNE SPONTANÉE</span>
            <span style="font-size:11px; font-weight:500; color:#10b981;">Active — Vague 3</span>
          </div>
          <div style="display:flex; gap:8px;">
            <button id="spon-batch" style="height:32px; padding:0 14px; background:#151b2b; border:1px solid #ffffff1a; border-radius:8px; color:var(--gold); font-size:11px; font-weight:500; cursor:pointer;">Relancer la campagne</button>
            <button id="spon-start" style="height:32px; padding:0 14px; background:var(--violet); border:none; border-radius:8px; color:#fff; font-size:11px; font-weight:600; cursor:pointer;">Démarrer la campagne</button>
          </div>
        </div>
        <!-- Filter tabs -->
        <div style="display:flex; align-items:center; gap:16px; padding:12px 24px; border-bottom:1px solid var(--border); flex-shrink:0;">
          <input placeholder="Chercher un recruteur..." style="height:32px; width:200px; background:#151b2b; border:1px solid #ffffff1a; color:#e4e4e7; border-radius:8px; padding:0 12px; font-size:11px; outline:none;" />
          ${filterTabs.map(ft => `<span data-spon-filter="${ft.key}" style="font-size:11px; font-weight:600; color:${filter === ft.key ? '#8b5cf6' : '#71717a'}; cursor:pointer;">${ft.label}</span>`).join('')}
        </div>
        <!-- Table -->
        <div style="flex:1; overflow-y:auto;">
          <table style="width:100%; border-collapse:collapse;">
            <thead>
              <tr style="border-bottom:1px solid var(--border);">
                <th style="text-align:left; padding:10px 16px; font-size:9px; font-weight:600; color:#52525b; letter-spacing:1px;">RECRUTEUR</th>
                <th style="text-align:left; padding:10px 16px; font-size:9px; font-weight:600; color:#52525b; letter-spacing:1px;">ENTREPRISE</th>
                <th style="text-align:left; padding:10px 16px; font-size:9px; font-weight:600; color:#52525b; letter-spacing:1px;">EMAIL</th>
                <th style="text-align:left; padding:10px 16px; font-size:9px; font-weight:600; color:#52525b; letter-spacing:1px;">SECTEUR</th>
                <th style="text-align:left; padding:10px 16px; font-size:9px; font-weight:600; color:#52525b; letter-spacing:1px;">STATUT</th>
              </tr>
            </thead>
            <tbody>
              ${targets.map(t => `
                <tr data-spon-id="${t.id}" style="border-bottom:1px solid #ffffff08; cursor:pointer; ${selected && selected.id === t.id ? 'background:#3B82F610;' : ''}" onmouseover="this.style.background='#ffffff05'" onmouseout="this.style.background='${selected && selected.id === t.id ? '#3B82F610' : ''}'">
                  <td style="padding:10px 16px; font-size:12px; color:#e4e4e7; font-weight:500;">${xs(t.hr_name || t.hr_email?.split('@')[0] || 'Contact')}</td>
                  <td style="padding:10px 16px; font-size:12px; color:#e4e4e7;">${xs(t.company)}</td>
                  <td style="padding:10px 16px; font-size:11px; color:#71717a;">${xs(t.hr_email||'')}</td>
                  <td style="padding:10px 16px; font-size:11px; color:#71717a;">${xs(t.industry||'')}</td>
                  <td style="padding:10px 16px;">${statusBadge(t.status)}</td>
                </tr>
              `).join('') || '<tr><td colspan="5" style="padding:24px; color:#71717a; text-align:center;">No targets found.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
      <!-- Config panel (right) -->
      <div style="width:320px; background:#080c16; border-left:1px solid var(--border); display:flex; flex-direction:column; flex-shrink:0;">
        <div class="panel-header">
          <div class="panel-title" style="color:#a1a1aa;">CONFIGURATION</div>
        </div>
        <div class="panel-content" style="padding:20px;">
          ${selected ? `
            <div style="margin-bottom:20px;">
              <div style="font-size:14px; font-weight:700; color:#fff;">${xs(detail.company||'')}</div>
              <div style="font-size:12px; color:#71717a; margin-top:4px;">${xs(detail.hr_email||'')} · ${xs(detail.industry||'')}</div>
            </div>
            <div style="margin-bottom:16px;">
              <div style="font-size:10px; font-weight:700; color:#a1a1aa; letter-spacing:1px; margin-bottom:8px;">STATUS</div>
              <select id="spon-status" style="width:100%; height:36px; background:#00000033; border:1px solid #ffffff1a; color:#e4e4e7; border-radius:8px; padding:0 12px; font-size:12px;">
                <option value="pending">pending</option>
                <option value="draft">draft</option>
                <option value="sent">sent</option>
                <option value="replied">replied</option>
                <option value="skipped">skipped</option>
              </select>
            </div>
            <div style="margin-bottom:16px;">
              <div style="font-size:10px; font-weight:700; color:#a1a1aa; letter-spacing:1px; margin-bottom:8px;">NOTES</div>
              <textarea id="spon-notes" style="width:100%; min-height:80px; background:#00000033; border:1px solid #ffffff1a; color:#e4e4e7; border-radius:8px; padding:10px; font-size:12px; line-height:1.5; outline:none; resize:vertical;">${xs(detail.notes||'')}</textarea>
            </div>
            <div style="display:flex; gap:8px; margin-bottom:16px;">
              <button id="spon-generate" class="btn btn-gold" style="flex:1;">Generate draft</button>
              <button id="spon-save" class="btn btn-violet" style="flex:1;">Save</button>
            </div>
            ${(detail.sent_letter || detail.email_subject) ? `
              <div style="background:#ffffff05; border:1px solid var(--border); border-radius:12px; padding:14px; margin-top:12px;">
                <div style="font-size:10px; font-weight:700; color:#a1a1aa; letter-spacing:1px; margin-bottom:6px;">DRAFT</div>
                <div style="margin-bottom:6px;">
                  <input id="spon-subject" value="${xs(detail.email_subject||'')}" style="width:100%; height:30px; background:#00000033; border:1px solid #ffffff1a; color:#e4e4e7; border-radius:6px; padding:0 10px; font-size:12px; font-weight:600; outline:none;" />
                </div>
                <textarea id="spon-letter" style="width:100%; min-height:100px; background:#00000033; border:1px solid #ffffff1a; color:#a1a1aa; border-radius:6px; padding:8px 10px; font-size:11px; line-height:1.5; outline:none; resize:vertical;">${xs(detail.sent_letter||'')}</textarea>
                <div style="display:flex; gap:8px; align-items:center; margin-top:8px;">
                  <div style="font-size:10px; color:#52525b;">CV:</div>
                  ${cvPickerHtml('spon-cv', true)}
                  <button id="spon-save-draft" class="btn btn-primary" style="margin-left:auto; font-size:9px;">Save</button>
                </div>
              </div>
            ` : ''}
            <div id="spon-task" style="margin-top:12px; color:var(--t3); font-size:11px;"></div>
          ` : `
            <div style="font-size:10px; font-weight:700; color:#a1a1aa; letter-spacing:1px; margin-bottom:12px;">YOUR CVs</div>
            <div style="display:flex; flex-direction:column; gap:8px;">
              ${(CV_LIST || []).length > 0 ? CV_LIST.map((c,i) => `
                <div style="background:#ffffff05; border:1px solid ${i===0?'#3B82F640':'#ffffff1a'}; border-radius:8px; padding:10px 12px;">
                  <div style="font-size:12px; font-weight:500; color:${i===0?'#e4e4e7':'#71717a'};">${xs(c.file_name)}</div>
                  <div style="font-size:10px; color:#52525b; margin-top:2px;">${xs(c.job_type)} / ${xs(c.language)}</div>
                </div>
              `).join('') : '<div style="font-size:11px; color:#52525b; padding:8px;">No CVs uploaded. Go to Settings → CV Manager.</div>'}
            </div>
            <div style="margin-top:24px;">
              <div style="font-size:10px; font-weight:700; color:#a1a1aa; letter-spacing:1px; margin-bottom:8px;">MÉTRIQUES CAMPAGNE</div>
              <div style="display:flex; gap:16px;">
                <div><div style="font-size:18px; font-weight:700; color:#38bdf8;">68%</div><div style="font-size:9px; color:#52525b;">Taux d'ouverture</div></div>
                <div><div style="font-size:18px; font-weight:700; color:#10b981;">24%</div><div style="font-size:9px; color:#52525b;">Taux de réponse</div></div>
              </div>
            </div>
          `}
        </div>
      </div>
    </div>
  `;

  document.querySelectorAll('[data-spon-id]').forEach(el => {
    el.onclick = () => { localStorage.setItem('gc_spon_sel', el.getAttribute('data-spon-id')); render(); };
  });

  document.querySelectorAll('[data-spon-filter]').forEach(el => {
    el.onclick = () => { localStorage.setItem('gc_spon_filter', el.getAttribute('data-spon-filter')); localStorage.removeItem('gc_spon_sel'); render(); };
  });

  const saveBtn = document.getElementById('spon-save');
  if(saveBtn && selected){
    const statusSel = document.getElementById('spon-status');
    if(statusSel) statusSel.value = detail.status || 'pending';
    saveBtn.onclick = async () => {
      const notesEl = document.getElementById('spon-notes');
      const notes = (notesEl && notesEl.value) || '';
      const status = (statusSel && statusSel.value) || (detail.status || 'pending');
      const r = await fetch(withToken('/api/spontanee/targets/' + selected.id), { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ status, notes })});
      if(!r.ok) alert('Save failed');
      render();
    };
  }

  const genBtn = document.getElementById('spon-generate');
  if(genBtn && selected){
    genBtn.onclick = async () => {
      genBtn.disabled = true; genBtn.innerHTML = '<span class="gc-spinner sm violet"></span> Generating…';
      const r = await fetch(withToken('/api/spontanee/targets/' + selected.id + '/generate'), { method:'POST' });
      if(!r.ok){ genBtn.disabled=false; genBtn.textContent='Generate draft'; return alert('Generate failed'); }
      const js = await r.json();
      localStorage.setItem('gc_spon_task', js.taskId || '');
      sponPoll();
    };
  }

  var saveDraftBtn = document.getElementById('spon-save-draft');
  if(saveDraftBtn && selected){
    saveDraftBtn.onclick = async () => {
      var subj = (document.getElementById('spon-subject') || {}).value || '';
      var letter = (document.getElementById('spon-letter') || {}).value || '';
      var r = await fetch(withToken('/api/spontanee/targets/' + selected.id), { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email_subject: subj, sent_letter: letter })});
      if(r.ok) alert('Draft saved'); else alert('Save failed');
    };
  }

  const batchBtn = document.getElementById('spon-batch');
  if(batchBtn){
    batchBtn.onclick = async () => {
      if(!confirm('Generate drafts for pending targets? (No emails are sent)')) return;
      batchBtn.disabled = true; batchBtn.innerHTML = '<span class="gc-spinner sm gold"></span> Running…';
      const r = await fetch(withToken('/api/spontanee/batch/start'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ limit: 5 })});
      if(!r.ok){ batchBtn.disabled=false; batchBtn.textContent='Relancer la campagne'; return alert('Batch start failed'); }
      const js = await r.json();
      localStorage.setItem('gc_spon_task', js.taskId || '');
      sponPoll();
    };
  }

  const startBtn = document.getElementById('spon-start');
  if(startBtn){
    startBtn.onclick = async () => {
      if(!confirm('Start outreach campaign for pending targets?')) return;
      startBtn.disabled = true; startBtn.innerHTML = '<span class="gc-spinner sm"></span> Starting…';
      const r = await fetch(withToken('/api/spontanee/batch/start'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ limit: 10 })});
      if(!r.ok){ startBtn.disabled=false; startBtn.textContent='Démarrer la campagne'; return alert('Campaign start failed'); }
      const js = await r.json();
      localStorage.setItem('gc_spon_task', js.taskId || '');
      sponPoll();
    };
  }

  async function sponPoll(){
    const box = document.getElementById('spon-task');
    const taskId = localStorage.getItem('gc_spon_task') || '';
    if(!box || !taskId) return;
    const t = await jf('/api/tasks/' + taskId, null);
    if(!t) { box.textContent = ''; return; }
    if(t.status === 'running' || t.status === 'queued') {
      box.innerHTML = '<span class="gc-spinner sm violet" style="vertical-align:middle; margin-right:6px;"></span>' + xs(t.lastMessage || t.status) + (t.error ? ' — ' + xs(t.error) : '');
    } else {
      box.textContent = t.status + (t.lastMessage ? ' — ' + t.lastMessage : '') + (t.error ? ' — ' + t.error : '');
    }
    if(t.status === 'running' || t.status === 'queued') setTimeout(sponPoll, 1200);
    else setTimeout(() => render(), 500);
  }

  sponPoll();
}


async function rStudio(){
  const mainWrap = document.getElementById('main-wrap');
  const lastUrl = localStorage.getItem('gc_studio_url') || '';
  const savedLetter = localStorage.getItem('gc_studio_letter') || '';
  const last = await jf('/api/studio/last', null);
  const lastPdf = last && last.files && last.files.find(f => f.kind === 'pdf') ? last.files.find(f => f.kind === 'pdf').name : '';

  mainWrap.innerHTML = `
    <div style="display:flex; flex-direction:column; flex:1; min-height:0;">
      <div style="height:88px; background:#080a12; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:16px; padding:0 32px; flex-shrink:0;">
        <i data-lucide="link" style="width:20px; height:20px; color:#94A3B8; flex-shrink:0;"></i>
        <input id="studio-url" type="text" value="${xs(lastUrl)}" placeholder="Paste job offer link here..."
          style="flex:1; height:42px; background:#151b2b; border:1px solid var(--gold); border-radius:12px; padding:0 16px; color:#fff; font-size:14px; outline:none;" />
        <div style="display:flex; align-items:center; gap:8px;">
          <div style="font-size:10px; color:#52525b;">CV:</div>
          ${cvPickerHtml('studio-cv', true)}
        </div>
        <button id="studio-generate" style="width:160px; height:42px; background:var(--gold); border:none; border-radius:12px; color:#000; font-size:13px; font-weight:700; cursor:pointer; flex-shrink:0;">Generate Letter</button>
      </div>
      <div id="studio-status" style="padding:4px 32px; font-size:11px; color:var(--t3); font-family:'JetBrains Mono'; min-height:18px;"></div>
      <div style="flex:1; display:flex; padding:16px 24px; gap:16px; overflow:hidden; min-height:0;">
        <div style="flex:1; background:#ffffff05; border-radius:16px; border:1px solid #ffffff15; padding:48px; overflow-y:auto;">
          <textarea id="studio-editor" placeholder="Your cover letter will appear here. You can edit it freely…"
            style="width:100%; min-height:400px; background:transparent; border:none; outline:none; color:#e4e4e7; font-family:'Inter'; font-size:16px; line-height:1.8; resize:vertical;">${xs(savedLetter)}</textarea>
        </div>
        <div style="width:380px; flex-shrink:0; background:#080a12; border-radius:16px; border:1px solid var(--border); padding:24px; display:flex; flex-direction:column; gap:16px; overflow-y:auto;">
          <div style="display:flex; align-items:center; gap:8px;">
            <i data-lucide="sparkles" style="width:16px; height:16px; color:var(--gold);"></i>
            <div style="font-size:14px; font-weight:700; color:var(--gold);">Gravity Claw Suggestions</div>
          </div>
          <div style="display:flex; flex-direction:column; gap:12px;">
            <div style="background:#1a1f2e; border-radius:8px; border:1px solid #F59E0B40; padding:16px;">
              <div style="font-size:13px; font-weight:600; color:#e4e4e7;">Tailor for scale.</div>
              <div style="font-size:12px; color:#94a3b8; margin-top:6px; max-width:300px;">Consider adding specific company terminology from the job description.</div>
            </div>
          </div>
          <div style="margin-top:auto;">
            <div style="font-size:10px; font-weight:700; letter-spacing:1px; color:#71717a; margin-bottom:12px;">EXPORT & SYNC</div>
            <div style="display:flex; flex-direction:column; gap:10px;">
              <button id="studio-sync" style="width:100%; height:44px; background:#3B82F620; border:1px solid #3B82F660; border-radius:12px; color:var(--blue); font-size:13px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
                <i data-lucide="monitor" style="width:16px; height:16px;"></i> Sync to Desktop
              </button>
              <div style="font-size:9px; color:#52525b; text-align:center;">~/Desktop/GravityClaw-Exports/cover-letters</div>
              ${lastPdf ? `
              <a href="${withToken('/api/studio/files/' + encodeURIComponent(lastPdf))}" target="_blank" rel="noreferrer"
                style="width:100%; height:44px; background:#ffffff0a; border:1px solid #ffffff1a; border-radius:12px; color:#e4e4e7; font-size:13px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; text-decoration:none;">
                <i data-lucide="download" style="width:16px; height:16px;"></i> Download as PDF
              </a>` : `
              <button disabled style="width:100%; height:44px; background:#ffffff0a; border:1px solid #ffffff1a; border-radius:12px; color:#52525b; font-size:13px; font-weight:600; cursor:not-allowed; display:flex; align-items:center; justify-content:center; gap:8px;">
                <i data-lucide="download" style="width:16px; height:16px;"></i> Download as PDF
              </button>`}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  if(window.lucide) window.lucide.createIcons();

  const editor = document.getElementById('studio-editor');
  if(editor) editor.oninput = () => localStorage.setItem('gc_studio_letter', editor.value);

  const syncBtn = document.getElementById('studio-sync');
  if(syncBtn) syncBtn.onclick = async () => {
    const text = editor ? editor.value : '';
    if(!text.trim()) return alert('Nothing to sync');
    syncBtn.innerHTML = '<span class="gc-spinner sm"></span> Syncing…'; syncBtn.disabled = true;
    const r = await fetch(withToken('/api/studio/coverletter'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url: lastUrl || 'manual', text })});
    syncBtn.disabled = false; syncBtn.innerHTML = '<i data-lucide="monitor" style="width:16px; height:16px;"></i> Sync to Desktop';
    if(window.lucide) window.lucide.createIcons();
    if(r.ok) alert('Synced to Desktop folder'); else alert('Sync failed');
  };

  const genBtn = document.getElementById('studio-generate');
  if(genBtn){
    genBtn.onclick = async () => {
      const url = (document.getElementById('studio-url') || {}).value || '';
      if(!url.trim()) return alert('Paste a URL');
      localStorage.setItem('gc_studio_url', url.trim());
      const st = document.getElementById('studio-status');
      genBtn.disabled = true; genBtn.innerHTML = '<span class="gc-spinner sm"></span> Generating…';
      var editorEl = document.getElementById('studio-editor');
      if(editorEl) editorEl.parentElement.innerHTML = gcLoaderHtml('studio-loader', 'gold', 'Generating cover letter…');
      gcStartTimer('studio-loader');
      const r = await fetch(withToken('/api/studio/coverletter'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url: url.trim() })});
      if(!r.ok){ gcStopTimer('studio-loader'); genBtn.disabled=false; genBtn.textContent='Generate Letter'; render(); return alert('Failed'); }
      const js = await r.json();
      if(!js.taskId){ gcStopTimer('studio-loader'); genBtn.disabled=false; genBtn.textContent='Generate Letter'; render(); return; }
      await pollTask(js.taskId, async (t) => {
        gcUpdateMsg('studio-loader', t.lastMessage || t.status || 'Working…');
        if(t.status === 'done'){
          gcStopTimer('studio-loader');
          const fresh = await jf('/api/studio/last', null);
          if(fresh && fresh.files){
            const txt = fresh.files.find(f => f.kind === 'txt');
            if(txt){
              const resp = await fetch(withToken('/api/studio/files/' + encodeURIComponent(txt.name)));
              if(resp.ok){ const body = await resp.text(); localStorage.setItem('gc_studio_letter', body); }
            }
          }
          render();
        }
        if(t.status === 'error'){ gcStopTimer('studio-loader'); genBtn.disabled=false; genBtn.textContent='Generate Letter'; alert(t.error||'Error'); render(); }
      });
    };
  }
}


window.handleEnter = function(e) {
  if(e.key === 'Enter') sendChat();
}

window.sendQuery = function(q){ 
  var i = document.getElementById('chat-input'); 
  if(i) { i.value = q; sendChat(); } 
}

var PENDING_CHATS = {};

window.sendChat = async function(){ 
  var i = document.getElementById('chat-input'); 
  if(!i || !i.value.trim()) return; 
  var val = i.value.trim(); 
  i.value = ''; 
  var dlgId = DIALOGUE_ID;
  
  var msgs = document.getElementById('chat-msgs'); 
  const formattedUserContent = xs(val).replace(/\n/g, '<br/>');
  msgs.innerHTML += `<div class="msg-row user-row"><div class="bubble user">${formattedUserContent}</div></div>`; 
  
  const typingId = 'typing-' + Date.now();
  msgs.innerHTML += `<div class="msg-row agent-row" id="${typingId}"><div class="typing-row"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div></div>`;
  msgs.scrollTop = msgs.scrollHeight; 

  PENDING_CHATS[dlgId] = true;
  updateDialogueBadges();
  
  (async () => {
    try {
      let url = '/api/dialogues/' + dlgId + '/messages';
      if(TOKEN) url += '?token=' + TOKEN;
      
      var r = await fetch(url, { 
        method: 'POST', 
        headers: {'Content-Type': 'application/json'}, 
        body: JSON.stringify({message: val}) 
      }); 
      
      delete PENDING_CHATS[dlgId];
      updateDialogueBadges();

      if(Number(DIALOGUE_ID) === Number(dlgId)){
        const typingEl = document.getElementById(typingId);
        if(typingEl) typingEl.remove();
        
        if(r.ok) {
          var res = await r.json(); 
          var cmsgs = document.getElementById('chat-msgs');
          if(cmsgs){
            const formattedAgentContent = xs(res.text).replace(/\n/g, '<br/>');
            cmsgs.innerHTML += `<div class="msg-row agent-row"><div class="bubble agent">${formattedAgentContent}</div></div>`; 
            cmsgs.scrollTop = cmsgs.scrollHeight;
          }
          updateKPIs();
          updateLiveActivity();
        } else {
          var cmsgs = document.getElementById('chat-msgs');
          if(cmsgs) cmsgs.innerHTML += `<div class="msg-row agent-row"><div class="bubble agent" style="color: var(--rose);">Error: model failed to respond.</div></div>`; 
        }
      } else {
        if(r.ok) updateLiveActivity();
      }
    } catch (e) {
      delete PENDING_CHATS[dlgId];
      updateDialogueBadges();
      if(Number(DIALOGUE_ID) === Number(dlgId)){
        const typingEl = document.getElementById(typingId);
        if(typingEl) typingEl.remove();
        var cmsgs = document.getElementById('chat-msgs');
        if(cmsgs) cmsgs.innerHTML += `<div class="msg-row agent-row"><div class="bubble agent" style="color: var(--rose);">Network Error.</div></div>`;
      }
    }
    if(window.lucide) window.lucide.createIcons(); 
  })();

  msgs.scrollTop = msgs.scrollHeight; 
}

function updateDialogueBadges(){
  document.querySelectorAll('[data-dlg-id]').forEach(el => {
    const id = el.getAttribute('data-dlg-id');
    const badge = el.querySelector('.dlg-loading');
    if(PENDING_CHATS[id]){
      if(!badge){
        const b = document.createElement('div');
        b.className = 'dlg-loading';
        b.style.cssText = 'width:6px;height:6px;border-radius:50%;background:var(--gold);animation:pulse 1s infinite;margin-left:auto;';
        el.querySelector('.dlg-meta')?.appendChild(b);
      }
    } else {
      if(badge) badge.remove();
    }
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    toggleSpotlight();
  }
  if (e.key === 'Escape') {
    const overlay = document.getElementById('spotlight-overlay');
    if(overlay) overlay.classList.add('hidden');
    const d = document.getElementById('model-dropdown');
    if(d) d.classList.add('hidden');
    const so = document.getElementById('settings-overlay');
    if(so){ CURRENT_PAGE = 'chat'; render(); }
  }
});

document.addEventListener('DOMContentLoaded', async () => { 
  applyTheme(localStorage.getItem('gc_theme') || 'dark');
  MODELS = await jf('/api/models', []);
  await loadCvs();
  render(); 
  setInterval(updateLiveActivity, 5000);
});
