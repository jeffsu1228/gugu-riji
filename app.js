/* 咕咕日迹 · 真日清单（rqd→daily）+ 真清收 + 工作日记全文（AES-GCM 加密，口令解锁）；勾选 → GitHub Contents → Actions → webhook */
(() => {
const KEY = 'gugu-riji.v1';
const DAILY_CACHE_KEY = 'gugu-riji.daily.cache.v1';
const EXTRAS_CACHE_KEY = 'gugu-riji.extras.cache.v1';
const OVERLAY_KEY = 'gugu-riji.daily.overlay.v1';
const LOCAL_TODOS_KEY = 'gugu-riji.daily.local.v1';
const PENDING_KEY = 'gugu-riji.daily.pending.v1';
const SYNC_CFG_KEY = 'gugu-riji.sync.v2'; // v2: GitHub token 中转，不再存 webhook
const DEFAULT_SYNC = {
  owner: 'jeffsu1228',
  repo: 'gugu-riji',
  path: 'data/sync-queue.json',
  token: '',
};
let syncCfg = { ...DEFAULT_SYNC };
try {
  const raw = localStorage.getItem(SYNC_CFG_KEY);
  if (raw) {
    const sc = JSON.parse(raw);
    if (sc && typeof sc === 'object') {
      syncCfg = {
        owner: String(sc.owner || DEFAULT_SYNC.owner).trim() || DEFAULT_SYNC.owner,
        repo: String(sc.repo || DEFAULT_SYNC.repo).trim() || DEFAULT_SYNC.repo,
        path: String(sc.path || DEFAULT_SYNC.path).trim() || DEFAULT_SYNC.path,
        token: String(sc.token != null ? sc.token : ''),
      };
    }
  }
} catch { /* keep defaults */ }
const saveOverlay = () => localStorage.setItem(OVERLAY_KEY, JSON.stringify(overlay));
const saveLocalTodos = () => localStorage.setItem(LOCAL_TODOS_KEY, JSON.stringify(localTodos));
const savePending = () => localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
const saveSyncCfg = () => localStorage.setItem(SYNC_CFG_KEY, JSON.stringify({
  owner: syncCfg.owner, repo: syncCfg.repo, path: syncCfg.path, token: syncCfg.token,
}));
function hasSyncToken() { return !!(syncCfg.token && syncCfg.token.trim().length >= 8); }
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
function pushPending(entry) {
  pending.push({ ...entry, at: new Date().toISOString() });
  if (pending.length > 200) pending = pending.slice(-200);
  savePending();
  renderSyncBar();
}
function pendingSummary() {
  if (!pending.length) return '（无待同步勾选）';
  const date = (daily && daily.date) || TODAY;
  const lines = [`【咕咕日迹 · 勾选反馈】日清单 ${date} · ${pending.length} 条（本机队列；未配 GitHub token 时请发给咕咕）`];
  pending.forEach((p, i) => {
    const mark = p.done ? '☑' : '☐';
    lines.push(`${i + 1}. ${mark} [${p.section || ''}] ${p.title || p.id}${p.act && p.act !== 'toggle' ? ' · ' + p.act : ''}`);
  });
  lines.push('— 配好 token 后 App 会写入仓库 sync-queue，Actions 再转 webhook；失败才进此队列。');
  return lines.join('\n');
}
function buildWebhookBody(items, date) {
  return {
    source: 'gugu-riji',
    date: date || (daily && daily.date) || TODAY,
    items: items.map(p => ({
      id: p.id,
      title: p.title || p.id,
      section: p.section || '',
      done: !!p.done,
      action: p.act || p.action || 'toggle',
    })),
    ts: new Date().toISOString(),
  };
}
function b64utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin);
}
function ghContentsUrl() {
  const o = encodeURIComponent(syncCfg.owner);
  const r = encodeURIComponent(syncCfg.repo);
  const p = String(syncCfg.path || DEFAULT_SYNC.path).split('/').map(encodeURIComponent).join('/');
  return `https://api.github.com/repos/${o}/${r}/contents/${p}`;
}
async function postViaGitHub(body) {
  if (!hasSyncToken()) throw new Error('no-token');
  const token = syncCfg.token.trim();
  const api = ghContentsUrl();
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: 'Bearer ' + token,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
  let sha;
  const getRes = await fetch(api, { headers, mode: 'cors', credentials: 'omit', cache: 'no-store' });
  if (getRes.ok) {
    const meta = await getRes.json();
    sha = meta.sha;
  } else if (getRes.status !== 404) {
    throw new Error('GET ' + getRes.status);
  }
  const payload = {
    message: 'chore(sync): gugu-riji checkins ' + (body.ts || new Date().toISOString()),
    content: b64utf8(JSON.stringify(body, null, 2) + '\n'),
    branch: 'main',
  };
  if (sha) payload.sha = sha;
  const putRes = await fetch(api, {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload),
    mode: 'cors',
    credentials: 'omit',
    cache: 'no-store',
  });
  if (!putRes.ok) {
    let detail = '';
    try { detail = (await putRes.json()).message || ''; } catch {}
    throw new Error('PUT ' + putRes.status + (detail ? ' ' + detail : ''));
  }
  return putRes;
}
async function syncEntries(entries, { silent } = {}) {
  if (!entries || !entries.length) return true;
  if (!hasSyncToken()) {
    renderSyncBar();
    return false;
  }
  const date = entries[0].date || (daily && daily.date) || TODAY;
  const body = buildWebhookBody(entries, date);
  try {
    await postViaGitHub(body);
    const ids = new Set(entries.map(e => (e.at || '') + '|' + e.id + '|' + (e.act || '')));
    pending = pending.filter(p => !ids.has((p.at || '') + '|' + p.id + '|' + (p.act || '')));
    const sent = new Set(entries.map(e => e.id + '|' + (e.act || '') + '|' + String(!!e.done)));
    pending = pending.filter(p => !sent.has(p.id + '|' + (p.act || '') + '|' + String(!!p.done)));
    savePending();
    renderSyncBar();
    if (!silent) toast('已同步');
    return true;
  } catch (err) {
    console.warn('gugu-riji sync', err);
    renderSyncBar();
    if (!silent) toast('同步失败，已记在本地');
    return false;
  }
}
function queueAndSync(entry) {
  const e = { ...entry, at: new Date().toISOString() };
  pending.push(e);
  if (pending.length > 200) pending = pending.slice(-200);
  savePending();
  renderSyncBar();
  if (hasSyncToken()) {
    syncEntries([e]);
  } else {
    toast(entry.act === 'toggle'
      ? (entry.done ? '已勾（本机；请先在 ⚙ 填 GitHub token）' : '已恢复未完成（本机）')
      : (entry.act === 'tmr' ? '已推明天（本机；未配置同步）' : '已转咕咕（本机；未配置同步）'));
  }
}
function renderSyncBar() {
  const bar = $('#sync-bar'); const panel = $('#sync-panel');
  if (!bar) return;
  const copyBtn = $('#sync-copy');
  const retryBtn = $('#sync-retry');
  if (!pending.length) {
    bar.classList.add('hidden');
    if (panel) panel.classList.add('hidden');
    return;
  }
  bar.classList.remove('hidden');
  const configured = hasSyncToken();
  $('#sync-count').textContent = configured
    ? `有 ${pending.length} 条同步失败 / 待重试`
    : `有 ${pending.length} 条未同步（未配置地址，可复制给咕咕）`;
  if (retryBtn) retryBtn.classList.toggle('hidden', !configured);
  if (copyBtn) {
    // 有 URL 时复制仍作兜底，但不强调
    copyBtn.classList.toggle('bold', !configured);
  }
  if (panel && !panel.classList.contains('hidden')) {
    $('#sync-text').textContent = pendingSummary();
  }
  const st = $('#sync-status');
  if (st && !st.dataset.locked) {
    st.textContent = configured ? '已配置自动同步' : '未配置 · 勾选仅本机';
  }
}

const OPEN_SECTIONS = [
  { id: 'today', name: '今日待办' },
  { id: 'open_work', name: '近期未完成·工作' },
  { id: 'calendar', name: '今日日历／私人行程' },
  { id: 'life', name: '近期未完成·生活' },
];

function ov(date, id) { return (overlay[date] && overlay[date][id]) || {}; }
function setOv(date, id, patch) {
  if (!overlay[date]) overlay[date] = {};
  overlay[date][id] = { ...(overlay[date][id] || {}), ...patch };
  saveOverlay();
}
function itemDone(it, date) {
  const o = ov(date, it.id);
  if (typeof o.done === 'boolean') return o.done;
  return !!it.done;
}
function itemHidden(it, date) {
  const o = ov(date, it.id);
  return !!(o.hide || o.tag === 'tmr');
}
function itemTag(it, date) { return ov(date, it.id).tag || it.tag || ''; }
function flattenDailyItems() {
  if (!daily) return [];
  const date = daily.date;
  const out = [];
  (daily.sections || []).forEach(sec => {
    (sec.items || []).forEach(it => {
      out.push({
        ...it, sectionId: sec.id, sectionName: sec.name,
        done: itemDone(it, date), tag: itemTag(it, date), hide: itemHidden(it, date),
        _date: date, _src: 'daily',
      });
    });
  });
  (localTodos[date] || []).forEach(it => {
    out.push({
      ...it, sectionId: 'local', sectionName: '本机待办',
      done: itemDone(it, date), tag: itemTag(it, date), hide: itemHidden(it, date),
      _date: date, _src: 'local',
    });
  });
  return out;
}

let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1600);
}
function haptic() { navigator.vibrate && navigator.vibrate(8); }
function dayLabel(ts) {
  const d = ymd(new Date(ts));
  if (d === TODAY) return '今天';
  if (d === ymd(addDays(-1))) return '昨天';
  const w = '日一二三四五六'[new Date(ts).getDay()];
  return `${d.slice(5).replace('-', '月')}日 周${w}`;
}
const hm = ts => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
function hl(text, q) {
  const s = esc(text); if (!q) return s;
  const re = new RegExp(esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return s.replace(re, m => `<mark>${m}</mark>`);
}
function shortDate(iso) {
  if (!iso || iso.length < 10) return '';
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}

function switchTab(tab, { focus } = {}) {
  $$('.tabbar button').forEach(x => x.classList.toggle('on', x.dataset.tab === tab));
  $$('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + tab));
  window.scrollTo(0, 0);
  if (tab === 'search' && focus && diaryEntries) setTimeout(() => $('#search-input').focus(), 50);
  // 随时同步：进今天/跟办/日记都重新拉 JSON（cache-bust）
  if (tab === 'today') { loadDaily(); loadExtras(); }
  else if (tab === 'follow' || tab === 'diary') { loadExtras(); }
  if (tab === 'diary' || tab === 'search') ensureDiary();
}
$$('.tabbar button').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab, { focus: true })));

const now = new Date();
const isWeekend = now.getDay() === 0 || now.getDay() === 6;
let weekendPeek = false;
$('#today-date').textContent = `${now.getMonth() + 1}月${now.getDate()}日 星期${'日一二三四五六'[now.getDay()]}`;

function renderMorning() {
  const list = $('#morning-list');
  $('#weekend-bar').classList.toggle('hidden', !isWeekend);
  list.classList.toggle('muted-off', isWeekend && !weekendPeek);
  const pending = (db.morning || []).filter(m => !m.decision).length;
  if (!(db.morning || []).length) {
    $('#morning-count').textContent = isWeekend ? '已静默' : '暂无';
    list.innerHTML = `<p class="empty">${esc(db.morningNote || '暂无晨报待拍板')}</p>`;
    return;
  }
  $('#morning-count').textContent = isWeekend && !weekendPeek ? '已静默' : (pending ? `${pending} 条待定` : '已全部拍板');
  const BADGE = { ok: '✓ 已同意', edit: '✎ 要改', later: '⏸ 缓办' };
  list.innerHTML = db.morning.map(m => `
    <div class="mcard ${m.decision ? 'decided' : ''}" data-id="${m.id}" data-badge="${m.decision ? BADGE[m.decision] : ''}">
      <div class="t">${esc(m.title)}</div>
      <div class="d">${esc(m.detail || '')}</div>
      <div class="acts">
        <button class="a-ok ${m.decision === 'ok' ? 'sel' : ''}" data-act="ok">同意</button>
        <button class="a-edit ${m.decision === 'edit' ? 'sel' : ''}" data-act="edit">改</button>
        <button class="a-later ${m.decision === 'later' ? 'sel' : ''}" data-act="later">缓</button>
      </div>
      ${m.decision === 'edit' ? `<div class="note"><input placeholder="改成…（发给咕咕）" value="${esc(m.note || '')}"><button class="link bold" data-act="send">发送</button></div>` : ''}
    </div>`).join('');
}
$('#morning-list').addEventListener('click', e => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const card = b.closest('.mcard'); const m = db.morning.find(x => x.id === card.dataset.id); if (!m) return;
  const act = b.dataset.act;
  if (act === 'send') {
    m.note = $('input', card).value.trim(); save();
    toast(m.note ? '修改意见已转咕咕' : '请先写修改意见'); return;
  }
  m.decision = m.decision === act ? null : act; save(); haptic();
  renderMorning();
  if (m.decision) toast({ ok: '已同意，咕咕去办', edit: '写下要改的地方', later: '已缓，下周一再提' }[m.decision]);
  if (m.decision === 'edit') $(`.mcard[data-id="${m.id}"] input`)?.focus();
});
$('#weekend-peek').addEventListener('click', () => {
  weekendPeek = !weekendPeek; $('#weekend-peek').textContent = weekendPeek ? '收起' : '临时查看'; renderMorning();
});

function todoRow(t) {
  const note = t.note ? `<div class="meta"><span class="note-line">${esc(t.note)}</span></div>` : '';
  const tag = t.tag === 'gugu' ? '<span class="tag-gugu">● 咕咕在办</span>' : (t.tag === 'tmr' ? '<span>已推明天</span>' : '');
  return `
  <div class="row-wrap" data-id="${esc(t.id)}" data-src="${t._src || 'daily'}">
    <div class="row-acts"><button class="b-tmr" data-act="tmr">推明天</button><button class="b-gugu" data-act="gugu">转咕咕</button></div>
    <div class="row ${t.done ? 'done' : ''}">
      <button class="check ${t.done ? 'on' : ''}" data-act="toggle" aria-label="完成"></button>
      <div class="body">
        <div class="title">${esc(t.title)}</div>
        ${note}
        ${tag ? `<div class="meta">${tag}</div>` : ''}
      </div>
      ${t.done ? '' : '<button class="more" data-act="reveal" aria-label="更多">⋯</button>'}
    </div>
  </div>`;
}

function renderTodos() {
  const root = $('#daily-root');
  const srcEl = $('#daily-source');
  if (!daily) {
    srcEl.textContent = '';
    root.innerHTML = '<p class="empty">日清单同步中，请稍后再开；离线会用上次成功缓存。不会显示旧假待办。</p>';
    $('#todo-count').textContent = '';
    return;
  }
  const date = daily.date;
  srcEl.textContent = `日清单 · ${shortDate(date)}`;
  const byId = Object.fromEntries((daily.sections || []).map(s => [s.id, s]));
  let openCount = 0;
  let html = '';
  OPEN_SECTIONS.forEach(({ id, name }) => {
    const sec = byId[id] || { id, name, items: [] };
    let items = (sec.items || []).map(it => ({
      ...it, done: itemDone(it, date), tag: itemTag(it, date), hide: itemHidden(it, date), _src: 'daily',
    })).filter(it => !it.hide && !it.done);
    if (id === 'today') {
      const locals = (localTodos[date] || []).map(it => ({
        ...it, done: itemDone(it, date), tag: itemTag(it, date), hide: itemHidden(it, date), _src: 'local',
      })).filter(it => !it.hide && !it.done);
      items = items.concat(locals);
    }
    openCount += items.length;
    html += `<div class="sub-head"><h3>${esc(name)}</h3><span>${items.length}</span></div>`;
    html += items.length
      ? `<div class="group" data-sec="${id}">${items.map(todoRow).join('')}</div>`
      : `<p class="empty-sm">暂无</p>`;
  });

  const doneSec = byId.done || { items: [] };
  const fromDone = (doneSec.items || []).map(it => ({
    ...it, done: itemDone(it, date), tag: itemTag(it, date), _src: 'daily',
  }));
  const toggledDone = [];
  (daily.sections || []).forEach(sec => {
    if (sec.id === 'done') return;
    (sec.items || []).forEach(it => {
      if (itemDone(it, date) && !itemHidden(it, date) && !it.done) {
        toggledDone.push({ ...it, done: true, tag: itemTag(it, date), _src: 'daily' });
      }
    });
  });
  (localTodos[date] || []).forEach(it => {
    if (itemDone(it, date) && !itemHidden(it, date)) {
      toggledDone.push({ ...it, done: true, tag: itemTag(it, date), _src: 'local' });
    }
  });
  const doneItems = [...toggledDone, ...fromDone.filter(it => it.done)];
  const doneOpen = !!(overlay._ui && overlay._ui.doneOpen);
  html += `<button type="button" class="done-toggle" id="done-toggle" aria-expanded="${doneOpen}">
    <span>已勾（备查）</span><span class="count">${doneItems.length}${doneOpen ? ' · 收起' : ' · 展开'}</span>
  </button>`;
  if (doneOpen) {
    html += doneItems.length
      ? `<div class="group" id="done-list">${doneItems.map(todoRow).join('')}</div>`
      : `<p class="empty-sm">暂无</p>`;
  }
  root.innerHTML = html;
  $('#todo-count').textContent = `${openCount} 项未完成`;
}

function findItem(id, src) {
  if (!daily) return null;
  const date = daily.date;
  if (src === 'local') return (localTodos[date] || []).find(x => x.id === id) || null;
  for (const sec of daily.sections || []) {
    const it = (sec.items || []).find(x => x.id === id);
    if (it) return it;
  }
  return null;
}
function findSectionName(id, src) {
  if (src === 'local') return '本机待办';
  if (!daily) return '';
  for (const sec of daily.sections || []) {
    if ((sec.items || []).some(x => x.id === id)) return sec.name || sec.id || '';
  }
  return '';
}

function onTodoAction(e) {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const wrap = b.closest('.row-wrap'); if (!wrap) return;
  const id = wrap.dataset.id;
  const src = wrap.dataset.src || 'daily';
  if (!daily) return;
  const date = daily.date;
  const it = findItem(id, src);
  const row = $('.row', wrap);
  haptic();
  if (b.dataset.act === 'reveal') { setOpen(row, !row.dataset.open); return; }
  if (b.dataset.act === 'toggle') {
    const cur = it ? itemDone(it, date) : !!ov(date, id).done;
    setOv(date, id, { done: !cur });
    if (src === 'local' && it) { it.done = !cur; saveLocalTodos(); }
    const section = it
      ? (it.sectionName || (findSectionName(id, src) || ''))
      : '';
    queueAndSync({
      act: 'toggle', id, date, done: !cur,
      title: it ? it.title : id,
      section,
      src,
    });
    if (hasSyncToken()) {
      // toast comes from syncEntries
    }
    setTimeout(renderTodos, 200);
    return;
  }
  if (b.dataset.act === 'tmr') {
    setOv(date, id, { hide: true, tag: 'tmr' });
    queueAndSync({
      act: 'tmr', id, date, title: it ? it.title : id,
      section: findSectionName(id, src) || '', src, done: false,
    });
  }
  if (b.dataset.act === 'gugu') {
    setOv(date, id, { tag: 'gugu', hide: true });
    const title = it ? it.title : id;
    if (!db.follow.gugu) db.follow.gugu = [];
    db.follow.gugu.unshift({ name: title, amount: '', due: '待排', status: 'gray', state: '刚转入', note: '来自日清单（本机）' });
    save();
    queueAndSync({
      act: 'gugu', id, date, title,
      section: findSectionName(id, src) || '', src, done: false,
    });
  }
  row.classList.add('leaving');
  setTimeout(() => { renderTodos(); renderFollow(); }, 330);
}
$('#daily-root').addEventListener('click', e => {
  if (e.target.closest('#done-toggle')) {
    if (!overlay._ui) overlay._ui = {};
    overlay._ui.doneOpen = !overlay._ui.doneOpen;
    saveOverlay();
    renderTodos();
    return;
  }
  onTodoAction(e);
});

const OPEN_X = -152;
function setOpen(row, open) {
  $$('.row[data-open]').forEach(r => { if (r !== row) { r.style.transform = ''; delete r.dataset.open; } });
  row.style.transform = open ? `translateX(${OPEN_X}px)` : '';
  if (open) row.dataset.open = '1'; else delete row.dataset.open;
}
let drag = null;
document.addEventListener('pointerdown', e => {
  const row = e.target.closest('#daily-root .row');
  if (!row) { if (!e.target.closest('.row-acts')) $$('.row[data-open]').forEach(r => setOpen(r, false)); return; }
  drag = { row, x0: e.clientX, y0: e.clientY, base: row.dataset.open ? OPEN_X : 0, moved: false, locked: null };
});
document.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
  if (drag.locked === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) drag.locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
  if (drag.locked !== 'x') return;
  drag.moved = true; drag.row.classList.add('dragging');
  const x = Math.min(0, Math.max(OPEN_X - 30, drag.base + dx));
  drag.row.style.transform = `translateX(${x}px)`;
});
const endDrag = e => {
  if (!drag) return;
  const { row, moved, base, x0 } = drag; drag = null;
  row.classList.remove('dragging');
  if (!moved) return;
  setOpen(row, base + (e.clientX - x0) < OPEN_X / 2);
};
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);

let seg = 'clean';
$$('#follow-seg button').forEach(b => b.addEventListener('click', () => {
  seg = b.dataset.seg; $$('#follow-seg button').forEach(x => x.classList.toggle('on', x === b)); renderFollow();
}));
function renderFollow() {
  const items = db.follow[seg] || [];
  const noteKey = seg + 'Note';
  const note = db.follow[noteKey] || '';
  const n = c => items.filter(i => i.status === c).length;
  let sums;
  if (seg === 'clean') {
    const totalWan = items.reduce((s, i) => {
      const m = String(i.amount || '').match(/([\d.]+)\s*万/);
      return s + (m ? parseFloat(m[1]) : 0);
    }, 0);
    sums = [[totalWan ? totalWan.toFixed(1) + ' 万' : '—', '摘录未结算'], [n('red'), '进度0'], [items.length, '摘录条数']];
  } else if (seg === 'node') {
    sums = [[items.length, '硬节点'], [n('red'), '临近'], ['提醒事项', '待授权']];
  } else {
    sums = [[items.length, '在办'], [n('gray'), '排队'], ['本机', '转入']];
  }
  $('#follow-summary').innerHTML = sums.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
  let html = '';
  if (note) html += `<p class="follow-note">${esc(note)}</p>`;
  if (!items.length) {
    html += `<p class="empty">${esc(note || '暂无')}</p>`;
  } else {
    html += items.map(i => `
      <div class="fcard">
        <div class="top"><span class="dot ${i.status || 'gray'}"></span><span class="name">${esc(i.name)}</span>${i.amount ? `<span class="amt">${esc(i.amount)}</span>` : ''}</div>
        <div class="info"><span>${seg === 'gugu' ? '预计' : '节点'} ${esc(i.due || '—')}</span><span class="pill">${esc(i.state || '')}</span></div>
        ${i.note ? `<div class="note">${esc(i.note)}</div>` : ''}
      </div>`).join('');
  }
  $('#follow-list').innerHTML = html;
}

/* ===== 工作日记全文（加密）+ 模糊搜索 ===== */
const DIARY_KEY_KEY = 'gugu-riji.diary.key.v1';
const KIND_LABEL = { day: '日记', week: '周记', month: '月记' };
let diaryEnc = null, diaryEntries = null, diarySig = '', diaryLoading = null, diaryOpen = new Set(), diaryFocus = null, pendingScroll = null;
const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64e = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const cryptoOk = () => !!(window.crypto && crypto.subtle && window.isSecureContext !== false);
const SKIP_RE = /[\s\p{P}\p{S}]/u;
function normMap(s) {
  let n = ''; const map = [];
  s = String(s || '');
  for (let i = 0; i < s.length; i++) {
    let ch = s[i];
    if (SKIP_RE.test(ch)) continue;
    const c = ch.charCodeAt(0);
    if (c >= 0xFF01 && c <= 0xFF5E) ch = String.fromCharCode(c - 0xFEE0); // 全角→半角
    n += ch.toLowerCase(); map.push(i);
  }
  return { n, map };
}
function queryTerms(q) { return String(q || '').trim().split(/\s+/).map(t => normMap(t).n).filter(Boolean); }
// 在原文中找所有词的命中区间 [start,end)
function findRanges(text, terms, nm) {
  nm = nm || normMap(text); const out = [];
  terms.forEach(t => {
    let i = nm.n.indexOf(t);
    while (i !== -1 && out.length < 400) { out.push([nm.map[i], nm.map[i + t.length - 1] + 1, t]); i = nm.n.indexOf(t, i + t.length); }
  });
  return out.sort((a, b) => a[0] - b[0]);
}
// 近似：字按顺序出现在一小段内（短词兜底）
function looseRanges(text, term, nm) {
  nm = nm || normMap(text); const out = []; const win = term.length * 4; const n = nm.n;
  for (let s = n.indexOf(term[0]); s !== -1 && out.length < 50; s = n.indexOf(term[0], s + 1)) {
    let j = s, ok = true; const pos = [s];
    for (let k = 1; k < term.length; k++) { j = n.indexOf(term[k], j + 1); if (j === -1 || j - s > win) { ok = false; break; } pos.push(j); }
    if (ok) pos.forEach(p => out.push([nm.map[p], nm.map[p] + 1, term]));
  }
  return out.sort((a, b) => a[0] - b[0]);
}
function renderMarked(text, ranges, from = 0, to = text.length) {
  const rs = ranges.filter(r => r[1] > from && r[0] < to).map(r => [Math.max(r[0], from), Math.min(r[1], to)]).sort((a, b) => a[0] - b[0]);
  let out = '', pos = from;
  rs.forEach(([a, b]) => { if (b <= pos) return; a = Math.max(a, pos); out += esc(text.slice(pos, a)) + '<mark>' + esc(text.slice(a, b)) + '</mark>'; pos = b; });
  return out + esc(text.slice(pos, to));
}
function hlTerms(text, terms) { text = String(text || ''); return terms.length ? renderMarked(text, findRanges(text, terms)) : esc(text); }
function matchText(text, terms) { const n = normMap(text).n; return terms.every(t => n.includes(t)); }
function prepEntry(e) {
  const blocks = [];
  if (e.summary) blocks.push({ h: '', top: '', text: e.summary });
  (e.sections || []).forEach(s => blocks.push({ h: s.h || '', top: s.top || '', text: s.t || '' }));
  blocks.forEach(b => { b.full = (b.h ? b.h + '\n' : '') + b.text; b.nm = normMap(b.full); });
  e.blocks = blocks;
  e.allN = normMap(e.title).n + '\u0001' + blocks.map(b => b.nm.n).join('\u0001');
  return e;
}
function setDiary(data) { diaryEntries = (data.entries || []).map(prepEntry); }
function entryMatch(e, terms) { return terms.every(t => e.allN.includes(t)); }
// 每天最多 n 段命中片段
function entrySnippets(e, terms, loose, n = 3) {
  const snips = [];
  e.blocks.forEach((b, bi) => {
    const rs = loose ? looseRanges(b.full, terms[0], b.nm) : findRanges(b.full, terms, b.nm);
    if (!rs.length) return;
    const distinct = new Set(rs.map(r => r[2])).size;
    let last = -1;
    rs.forEach(r => {
      if (r[0] < last) return;
      const from = Math.max(0, r[0] - 28), to = Math.min(b.full.length, r[1] + 56);
      snips.push({ bi, distinct, html: (from > 0 ? '…' : '') + renderMarked(b.full, rs, from, to).replace(/\n/g, ' ') + (to < b.full.length ? '…' : '') });
      last = to;
    });
  });
  snips.sort((a, b) => b.distinct - a.distinct || a.bi - b.bi);
  return snips.slice(0, n);
}
function diaryDateLabel(e) {
  const [y, m, d] = e.date.split('-').map(Number);
  const w = '日一二三四五六'[new Date(y, m - 1, d).getDay()];
  return e.kind === 'day' ? `${m}月${d}日 周${w}` : esc(String(e.title || '').replace(/^\d{4}年/, '')) || `${m}月${d}日`;
}
async function fetchDiaryEnc() {
  try {
    const r = await fetch('./data/diary.enc.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    diaryEnc = await r.json();
  } catch { /* 离线：SW 会回退到缓存；仍失败则保持上次 */ }
  return diaryEnc;
}
async function deriveKey(pass, enc) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64d(enc.salt), iterations: enc.iter, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, true, ['decrypt']);
}
async function decryptWith(key, enc) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(enc.iv) }, key, b64d(enc.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}
async function tryCachedKey() {
  let c = null; try { c = JSON.parse(localStorage.getItem(DIARY_KEY_KEY)); } catch {}
  if (!c || !diaryEnc || c.salt !== diaryEnc.salt || c.iter !== diaryEnc.iter) return false;
  try {
    const key = await crypto.subtle.importKey('raw', b64d(c.k), { name: 'AES-GCM' }, false, ['decrypt']);
    setDiary(await decryptWith(key, diaryEnc)); diarySig = diaryEnc.iv; return true;
  } catch { localStorage.removeItem(DIARY_KEY_KEY); return false; }
}
async function unlockWith(pass) {
  if (!diaryEnc) await fetchDiaryEnc();
  if (!diaryEnc) throw new Error('nodata');
  const key = await deriveKey(pass, diaryEnc);
  let data; try { data = await decryptWith(key, diaryEnc); } catch { return false; }
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  localStorage.setItem(DIARY_KEY_KEY, JSON.stringify({ salt: diaryEnc.salt, iter: diaryEnc.iter, k: b64e(raw) }));
  setDiary(data); diarySig = diaryEnc.iv; return true;
}
function lockDiary() {
  localStorage.removeItem(DIARY_KEY_KEY); diaryEntries = null; diarySig = ''; diaryOpen.clear(); diaryFocus = null;
  renderDiary(); renderSearch(); renderDiaryKeyStatus();
}
function ensureDiary() {
  if (diaryLoading) return diaryLoading;
  diaryLoading = (async () => {
    await fetchDiaryEnc();
    if (diaryEnc && cryptoOk() && diaryEnc.iv !== diarySig) {
      const ok = await tryCachedKey();
      if (!ok && diaryEntries) { diaryEntries = null; diarySig = ''; }
    }
    renderDiary(); renderSearch(); renderDiaryKeyStatus();
  })().finally(() => { diaryLoading = null; });
  return diaryLoading;
}
function lockCardHtml(where) {
  if (!cryptoOk()) return `<div class="lockcard"><div class="lockicon">🔒</div><div class="locktitle">工作日记已加密</div><div class="locksub">这个浏览器不支持解密，请用 Safari 打开 https 站点。</div></div>`;
  const compact = where === 'search';
  return `<div class="lockcard${compact ? ' compact' : ''}">
    ${compact ? '' : '<div class="lockicon">🔒</div>'}
    <div class="locktitle">${compact ? '🔒 日记全文未解锁' : '工作日记已加密'}</div>
    <div class="locksub">${compact ? '输入口令后，搜索会包含全部工作日记。' : '输入口令后可看全文、可搜索。本机输一次就记住。'}</div>
    <form class="lockform" autocomplete="on">
      <input type="password" name="password" autocomplete="current-password" placeholder="口令" enterkeyhint="go" aria-label="日记口令">
      <button class="btn-primary" type="submit">解锁</button>
    </form>
    <div class="lockerr" aria-live="polite"></div>
  </div>`;
}
document.addEventListener('submit', async ev => {
  const form = ev.target.closest && ev.target.closest('.lockform'); if (!form) return;
  ev.preventDefault();
  const inp = form.querySelector('input'), btn = form.querySelector('button'), err = form.parentElement.querySelector('.lockerr');
  const v = inp.value; if (!v) { err.textContent = '先输口令'; return; }
  btn.disabled = true; btn.textContent = '解锁中…'; err.textContent = '';
  let ok = false;
  try { ok = await unlockWith(v); } catch { err.textContent = '日记数据没加载到，联网后再试'; btn.disabled = false; btn.textContent = '解锁'; return; }
  if (!ok) { err.textContent = '口令不对'; inp.select(); btn.disabled = false; btn.textContent = '解锁'; haptic(); return; }
  inp.value = ''; inp.blur(); toast('已解锁'); haptic();
  renderDiary(); renderSearch(); renderDiaryKeyStatus();
});
function renderDiaryKeyStatus() {
  const st = $('#diary-key-status'); if (!st) return;
  st.textContent = diaryEntries ? `已解锁 · ${diaryEntries.length} 篇` : (localStorage.getItem(DIARY_KEY_KEY) ? '已记住口令' : '未解锁');
}

function blockHtml(e, b, bi, terms) {
  const rs = terms.length ? findRanges(b.full, terms, b.nm) : [];
  const head = b.h ? b.h : '';
  const bodyStart = head ? head.length + 1 : 0;
  const top = b.top && (bi === 0 || e.blocks[bi - 1].top !== b.top) ? `<div class="dtop">${esc(b.top)}</div>` : '';
  return `${top}<div class="dsec" data-sec="${bi}">${head ? `<div class="dh">${renderMarked(b.full, rs, 0, head.length)}</div>` : ''}<div class="dt">${renderMarked(b.full, rs, bodyStart, b.full.length)}</div></div>`;
}
function entryBodyHtml(e, terms) {
  return `<div class="dfull-title">${esc(e.title)}</div>` + e.blocks.map((b, bi) => blockHtml(e, b, bi, terms)).join('');
}
function renderDiary() {
  const tl = $('#diary-timeline'); if (!tl) return;
  const lock = $('#diary-lock');
  const terms = queryTerms($('#diary-filter').value);
  if (lock) lock.innerHTML = diaryEntries ? `<div class="unlocked-bar"><span>🔓 工作日记 ${diaryEntries.length} 篇（${diaryEntries.filter(e => e.kind === 'day').length} 天）</span><button type="button" class="link" data-act="relock">锁定</button></div>` : lockCardHtml('diary');
  const items = [];
  (diaryEntries || []).forEach(e => { if (!terms.length || entryMatch(e, terms)) items.push({ w: e, date: e.date, ts: 0 }); });
  (db.diary || []).forEach(d => {
    if (d.src === '工作日记') return;
    if (!terms.length || matchText(d.text, terms)) items.push({ u: d, date: ymd(new Date(d.ts)), ts: d.ts });
  });
  items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.ts - a.ts)));
  if (!items.length) {
    tl.innerHTML = `<p class="empty">${terms.length ? '没有匹配的日记' : (diaryEntries ? '还没有日记' : (db.diaryNote || '还没有日记'))}</p>`;
    return;
  }
  let html = '', curM = '';
  items.forEach(it => {
    const [y, m] = it.date.split('-').map(Number); const mk = `${y}年${m}月`;
    if (mk !== curM) { if (curM) html += '</div>'; html += `<div class="day month">${mk}</div><div class="dlist">`; curM = mk; }
    if (it.u) {
      const d = it.u;
      html += `<div class="dcard note"><div class="dmeta">${dayLabel(d.ts)} ${hm(d.ts)} <span class="kind k-note">${esc(d.src || '随手记')}</span></div><div class="dnote">${hlTerms(d.text, terms)}</div></div>`;
      return;
    }
    const e = it.w; const open = diaryOpen.has(e.id);
    const fterms = diaryFocus && diaryFocus.id === e.id ? diaryFocus.terms : terms;
    const sum = e.kind === 'day' ? (e.summary || (e.blocks[0] && e.blocks[0].text) || '') : e.title;
    const snips = terms.length && !open ? entrySnippets(e, terms, false, 2) : [];
    html += `<div class="dcard${open ? ' open' : ''}" data-id="${esc(e.id)}">
      <button type="button" class="dhead"><div class="dmeta">${diaryDateLabel(e)} <span class="kind k-${e.kind}">${KIND_LABEL[e.kind] || ''}</span></div>
        <div class="dsum">${hlTerms(sum, terms)}</div><span class="chev">›</span></button>
      ${snips.map(s => `<div class="snip" data-sec="${s.bi}">${s.html}</div>`).join('')}
      <div class="dbody">${open ? entryBodyHtml(e, fterms) : ''}</div></div>`;
  });
  tl.innerHTML = html + '</div>';
  if (pendingScroll && Date.now() < pendingScroll.until) {
    const card = $(`#diary-timeline .dcard[data-id="${CSS.escape(pendingScroll.id)}"]`);
    if (card) scrollToSec(card, pendingScroll.sec, pendingScroll.flashed);
    pendingScroll.flashed = true;
  }
}
function toggleEntry(card, open, sec) {
  const id = card.dataset.id; const e = (diaryEntries || []).find(x => x.id === id); if (!e) return;
  if (open === undefined) open = !card.classList.contains('open');
  if (open) {
    diaryOpen.add(id);
    const terms = diaryFocus && diaryFocus.id === id ? diaryFocus.terms : queryTerms($('#diary-filter').value);
    card.querySelector('.dbody').innerHTML = entryBodyHtml(e, terms);
    card.classList.add('open'); $$('.snip', card).forEach(s => s.remove());
    if (sec !== undefined) scrollToSec(card, sec);
  } else {
    diaryOpen.delete(id); card.classList.remove('open'); card.querySelector('.dbody').innerHTML = '';
    if (diaryFocus && diaryFocus.id === id) diaryFocus = null;
  }
}
function scrollToSec(card, sec, noFlash) {
  const id = card.dataset.id;
  setTimeout(() => {
    const c = $(`#diary-timeline .dcard[data-id="${CSS.escape(id)}"]`) || card;
    const el = c.querySelector(`.dsec[data-sec="${sec}"]`);
    const target = (el && el.querySelector('mark')) || el || c;
    const y = target.getBoundingClientRect().top + window.scrollY - window.innerHeight / 3;
    window.scrollTo(0, Math.max(0, y));
    if (el && !noFlash) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1800); }
  }, 60);
}
$('#diary-timeline').addEventListener('click', ev => {
  const snip = ev.target.closest('.snip');
  if (snip) { const card = snip.closest('.dcard'); toggleEntry(card, true, Number(snip.dataset.sec)); return; }
  const head = ev.target.closest('.dhead'); if (head) toggleEntry(head.closest('.dcard'));
});
$('#diary-lock').addEventListener('click', ev => { if (ev.target.closest('[data-act="relock"]')) { lockDiary(); toast('已锁定，本机需重新输口令'); } });
function openDiary(id, sec, terms) {
  diaryFocus = { id, terms }; diaryOpen.clear(); diaryOpen.add(id);
  $('#diary-filter').value = '';
  pendingScroll = { id, sec, until: Date.now() + 2500 };
  switchTab('diary');
  renderDiary();
}
function addDiary(text, src) {
  if (!db.diary) db.diary = [];
  db.diary.push({ id: uid(), ts: Date.now(), text, src });
  save(); renderDiary();
}
$('#diary-filter').addEventListener('input', () => { diaryFocus = null; renderDiary(); });
$('#diary-save').addEventListener('click', () => {
  const v = $('#diary-input').value.trim(); if (!v) return toast('先写点什么');
  addDiary(v); $('#diary-input').value = ''; toast('已记入日记');
});

function renderSearch() {
  const box = $('#search-results'); if (!box) return;
  const lock = $('#search-lock');
  if (lock) lock.innerHTML = diaryEntries ? '' : lockCardHtml('search');
  const terms = queryTerms($('#search-input').value);
  if (!terms.length) { box.innerHTML = '<p class="empty">输入关键词；空格分开＝同时包含。<br>搜日清单、日记全文、跟办。</p>'; return; }
  const dailyItems = flattenDailyItems().filter(t => !t.hide && matchText([t.title, t.note, t.sectionName].join(' '), terms));
  const notes = (db.diary || []).filter(d => d.src !== '工作日记' && matchText(d.text, terms)).sort((a, b) => b.ts - a.ts);
  let loose = false;
  let hits = (diaryEntries || []).filter(e => entryMatch(e, terms));
  if (!hits.length && diaryEntries && terms.length === 1 && terms[0].length >= 2 && terms[0].length <= 6) {
    hits = diaryEntries.filter(e => e.blocks.some(b => looseRanges(b.full, terms[0], b.nm).length)); loose = hits.length > 0;
  }
  const segName = { clean: '清收', node: '合同节点', gugu: '咕咕在办' };
  const follow = Object.entries(db.follow).filter(([k]) => !k.endsWith('Note')).flatMap(([k, arr]) =>
    (Array.isArray(arr) ? arr : []).filter(i => matchText([i.name, i.note, i.amount, i.state].join(' '), terms)).map(i => ({ ...i, seg: k }))
  );
  let html = '';
  if (hits.length) html += `<div class="res-head">工作日记 · ${hits.length} 篇${loose ? '（近似匹配）' : ''}</div><div class="group">` +
    hits.map(e => `<div class="res dres" data-id="${esc(e.id)}"><div class="dmeta"><b>${diaryDateLabel(e)}</b> <span class="kind k-${e.kind}">${KIND_LABEL[e.kind] || ''}</span></div>` +
      entrySnippets(e, terms, loose, 3).map(s => `<div class="snip" data-sec="${s.bi}">${s.html}</div>`).join('') + '</div>').join('') + '</div>';
  if (notes.length) html += `<div class="res-head">随手记 · ${notes.length}</div><div class="group">` +
    notes.map(d => `<div class="res"><div>${hlTerms(d.text, terms)}</div><div class="s">${dayLabel(d.ts)} ${hm(d.ts)}</div></div>`).join('') + '</div>';
  if (dailyItems.length) html += `<div class="res-head">日清单 · ${dailyItems.length}</div><div class="group">` +
    dailyItems.map(t => `<div class="res"><div>${hlTerms(t.title, terms)}</div><div class="s">${esc(t.sectionName)} · ${t.done ? '已勾' : '未完成'}</div></div>`).join('') + '</div>';
  if (follow.length) html += `<div class="res-head">跟办 · ${follow.length}</div><div class="group">` +
    follow.map(i => `<div class="res"><div><span class="dot ${i.status || 'gray'}" style="display:inline-block;margin-right:6px"></span>${hlTerms(i.name, terms)}</div><div class="s">${segName[i.seg] || i.seg} · ${esc(i.amount || i.state || '')}</div></div>`).join('') + '</div>';
  box.innerHTML = html || `<p class="empty">没有找到${diaryEntries ? '' : '（日记全文未解锁）'}</p>`;
}
$('#search-input').addEventListener('input', renderSearch);
$('#search-results').addEventListener('click', ev => {
  const r = ev.target.closest('.dres'); if (!r) return;
  const snip = ev.target.closest('.snip');
  const sec = snip ? Number(snip.dataset.sec) : Number((r.querySelector('.snip') || { dataset: { sec: 0 } }).dataset.sec);
  openDiary(r.dataset.id, sec, queryTerms($('#search-input').value));
});

const TODO_RE = /^\s*待办[：:]\s*/;
function openSheet() { $('#sheet').classList.add('show'); $('#sheet-mask').classList.add('show'); setTimeout(() => $('#sheet-input').focus(), 250); updateHint(); }
function closeSheet() { $('#sheet').classList.remove('show'); $('#sheet-mask').classList.remove('show'); $('#sheet-input').blur(); }
function updateHint() { $('#route-hint').innerHTML = TODO_RE.test($('#sheet-input').value) ? '→ 将存入 <b>日清单（本机）</b>' : '→ 将存入 <b>日记</b>'; }
$('#fab').addEventListener('click', openSheet);
$('#sheet-mask').addEventListener('click', closeSheet);
$('#sheet-cancel').addEventListener('click', closeSheet);
$('#sheet-input').addEventListener('input', updateHint);
$$('.quick button').forEach(b => b.addEventListener('click', () => {
  const ta = $('#sheet-input'); const body = ta.value.replace(TODO_RE, '');
  ta.value = b.dataset.prefix + body; ta.focus(); updateHint();
}));
$('#sheet-save').addEventListener('click', () => {
  const v = $('#sheet-input').value.trim(); if (!v) return toast('先写点什么');
  if (TODO_RE.test(v)) {
    const title = v.replace(TODO_RE, '').trim(); if (!title) return toast('待办内容为空');
    const date = (daily && daily.date) || TODAY;
    if (!localTodos[date]) localTodos[date] = [];
    localTodos[date].push({ id: 'local-' + uid(), title, note: '', done: false, tag: '' });
    saveLocalTodos(); renderTodos(); toast('已加入日清单（本机，未回写）');
  } else { addDiary(v, '记一笔'); toast('已记入日记'); }
  $('#sheet-input').value = ''; closeSheet(); haptic();
});

function applyExtras(data) {
  if (!data) return;
  db.morning = Array.isArray(data.morning) ? data.morning : [];
  db.morningNote = data.morningNote || db.morningNote;
  if (data.follow) {
    db.follow.clean = data.follow.clean || [];
    db.follow.cleanNote = data.follow.cleanNote || '';
    db.follow.node = data.follow.node || [];
    db.follow.nodeNote = data.follow.nodeNote || db.follow.nodeNote;
    // keep locally transferred gugu items; merge server empty with local
    const localGugu = (db.follow.gugu || []).filter(x => x.state === '刚转入' || (x.note || '').includes('本机'));
    db.follow.gugu = (data.follow.gugu || []).concat(localGugu);
    db.follow.guguNote = data.follow.guguNote || '';
  }
  // 工作日记全文改走加密的 data/diary.enc.json；这里只保留本机随手记（去掉旧版明文摘录）
  db.diary = (db.diary || []).filter(d => d.src !== '工作日记');
  if (data.diaryNote) db.diaryNote = data.diaryNote;
  save();
}

async function loadJSON(url) {
  const res = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function loadDaily() {
  try {
    const data = await loadJSON('./data/daily-latest.json');
    if (!data || !Array.isArray(data.sections)) throw new Error('bad shape');
    daily = data;
    localStorage.setItem(DAILY_CACHE_KEY, JSON.stringify(data));
  } catch {
    try {
      const cached = JSON.parse(localStorage.getItem(DAILY_CACHE_KEY));
      if (cached && Array.isArray(cached.sections)) { daily = cached; toast('离线：用上次日清单缓存'); }
      else daily = null;
    } catch { daily = null; }
  }
  renderTodos();
}

async function loadExtras() {
  try {
    const data = await loadJSON('./data/extras.json');
    applyExtras(data);
    localStorage.setItem(EXTRAS_CACHE_KEY, JSON.stringify(data));
  } catch {
    try {
      const cached = JSON.parse(localStorage.getItem(EXTRAS_CACHE_KEY));
      if (cached) applyExtras(cached);
    } catch { /* keep empty */ }
  }
  renderMorning(); renderFollow(); renderDiary();
}

function fillSyncForm() {
  const t = $('#sync-token');
  if (t) t.value = syncCfg.token || '';
  const st = $('#sync-status');
  if (st) {
    st.dataset.locked = '';
    st.textContent = hasSyncToken() ? '已配置 GitHub 同步' : '未配置 · 勾选仅本机';
  }
}
function wireSyncUI() {
  const gear = $('#sync-gear');
  const settings = $('#sync-settings');
  if (gear && settings) {
    const openSync = (forceOpen) => {
      const opening = forceOpen || settings.classList.contains('hidden');
      if (forceOpen) settings.classList.remove('hidden');
      else settings.classList.toggle('hidden');
      if (!settings.classList.contains('hidden')) {
        fillSyncForm();
        toast('同步设置');
        try { settings.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch {}
      }
    };
    gear.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openSync(false); });
    // 深链：?sync=1 或 #sync 直接打开（绕过点不动）
    try {
      const u = new URL(location.href);
      if (u.searchParams.get('sync') === '1' || location.hash === '#sync') openSync(true);
    } catch {}
  }
  const saveBtn = $('#sync-save');
  if (saveBtn) saveBtn.addEventListener('click', () => {
    syncCfg = {
      owner: DEFAULT_SYNC.owner,
      repo: DEFAULT_SYNC.repo,
      path: DEFAULT_SYNC.path,
      token: ($('#sync-token')?.value || '').trim(),
    };
    saveSyncCfg();
    const st = $('#sync-status');
    if (st) { st.dataset.locked = ''; st.textContent = hasSyncToken() ? '已保存 · 勾选即同步' : '已保存 · 仍无 token'; }
    toast(hasSyncToken() ? 'GitHub token 已保存（仅本机）' : '已保存（未填 token）');
    renderSyncBar();
    if (hasSyncToken() && pending.length) syncEntries([...pending], { silent: false });
  });
  const testBtn = $('#sync-test');
  if (testBtn) testBtn.addEventListener('click', async () => {
    syncCfg = {
      owner: DEFAULT_SYNC.owner,
      repo: DEFAULT_SYNC.repo,
      path: DEFAULT_SYNC.path,
      token: ($('#sync-token')?.value || '').trim() || syncCfg.token,
    };
    if (!hasSyncToken()) return toast('请先填写 GitHub token');
    const st = $('#sync-status');
    if (st) { st.dataset.locked = '1'; st.textContent = '试发中…'; }
    try {
      await postViaGitHub(buildWebhookBody([{
        id: 'ping', title: '咕咕日迹 · 连通性试发', section: '', done: false, act: 'ping',
      }], (daily && daily.date) || TODAY));
      if (st) { st.dataset.locked = ''; st.textContent = '试发成功（已写入仓库，Actions 将转 webhook）'; }
      toast('已同步');
    } catch (err) {
      if (st) { st.dataset.locked = ''; st.textContent = '试发失败'; }
      console.warn('gugu-riji sync test', err);
      toast('同步失败，已记在本地');
    }
  });
  const retryBtn = $('#sync-retry');
  if (retryBtn) retryBtn.addEventListener('click', () => {
    if (!pending.length) return toast('没有待同步条目');
    if (!hasSyncToken()) return toast('请先在 ⚙ 填写 GitHub token');
    syncEntries([...pending]);
  });
  const copyBtn = $('#sync-copy');
  const showBtn = $('#sync-show');
  const clearBtn = $('#sync-copied');
  if (copyBtn) copyBtn.addEventListener('click', async () => {
    const text = pendingSummary();
    try {
      await navigator.clipboard.writeText(text);
      toast(hasSyncToken() ? '已复制（兜底；优先用自动同步）' : '已复制，发给咕咕即可改清单');
    } catch {
      $('#sync-panel').classList.remove('hidden');
      $('#sync-text').textContent = text;
      toast('请手动复制下方摘要');
    }
  });
  if (showBtn) showBtn.addEventListener('click', () => {
    const panel = $('#sync-panel');
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) $('#sync-text').textContent = pendingSummary();
  });
  if (clearBtn) clearBtn.addEventListener('click', () => {
    pending = [];
    savePending();
    renderSyncBar();
    toast('已清空本机同步队列（overlay 仍保留）');
  });
  fillSyncForm();
}

renderMorning(); renderFollow(); renderDiary(); renderTodos(); renderSyncBar();
wireSyncUI();
renderDiaryKeyStatus();
{ const rl = $('#diary-relock'); if (rl) rl.addEventListener('click', () => { lockDiary(); toast('已锁定，本机需重新输口令'); }); }
ensureDiary();
Promise.all([loadDaily(), loadExtras()]).then(() => renderSyncBar());
// 回到前台时再拉一次
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    loadDaily(); loadExtras();
  }
});
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
window.guguReset = () => {
  [KEY, DAILY_CACHE_KEY, EXTRAS_CACHE_KEY, OVERLAY_KEY, LOCAL_TODOS_KEY, PENDING_KEY, SYNC_CFG_KEY, DIARY_KEY_KEY].forEach(k => localStorage.removeItem(k));
  location.reload();
};
})();
