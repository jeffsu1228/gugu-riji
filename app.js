/* 咕咕日迹 · 真日清单（rqd→daily）+ 真清收/日记摘录；勾选仅本机 overlay */
(() => {
const KEY = 'gugu-riji.v1';
const DAILY_CACHE_KEY = 'gugu-riji.daily.cache.v1';
const EXTRAS_CACHE_KEY = 'gugu-riji.extras.cache.v1';
const OVERLAY_KEY = 'gugu-riji.daily.overlay.v1';
const LOCAL_TODOS_KEY = 'gugu-riji.daily.local.v1';
const PENDING_KEY = 'gugu-riji.daily.pending.v1';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (n, base = new Date()) => { const d = new Date(base); d.setDate(d.getDate() + n); return d; };
const TODAY = ymd(new Date());
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function emptyDb() {
  return {
    morning: [],
    morningNote: '周末无晨报待拍板；工作日由咕咕生成后同步。',
    diary: [],
    follow: {
      clean: [], cleanNote: '',
      node: [], nodeNote: '硬节点走提醒事项·粤路·硬节点，待授权后接入。',
      gugu: [], guguNote: '',
    },
  };
}
let db;
try {
  db = JSON.parse(localStorage.getItem(KEY));
  if (!db || typeof db !== 'object') db = emptyDb();
  if (db.todos) delete db.todos; // 旧假待办不再使用
  if (!db.follow) db.follow = emptyDb().follow;
  if (!Array.isArray(db.morning)) db.morning = [];
  if (!Array.isArray(db.diary)) db.diary = [];
} catch { db = emptyDb(); }
const save = () => localStorage.setItem(KEY, JSON.stringify(db));

let daily = null;
let overlay = {};
let localTodos = {};
try { overlay = JSON.parse(localStorage.getItem(OVERLAY_KEY)) || {}; } catch { overlay = {}; }
try { localTodos = JSON.parse(localStorage.getItem(LOCAL_TODOS_KEY)) || {}; } catch { localTodos = {}; }
let pending = [];
try { pending = JSON.parse(localStorage.getItem(PENDING_KEY)) || []; } catch { pending = []; }
if (!Array.isArray(pending)) pending = [];
const saveOverlay = () => localStorage.setItem(OVERLAY_KEY, JSON.stringify(overlay));
const saveLocalTodos = () => localStorage.setItem(LOCAL_TODOS_KEY, JSON.stringify(localTodos));
const savePending = () => localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
function pushPending(entry) {
  pending.push({ ...entry, at: new Date().toISOString() });
  // keep last 200
  if (pending.length > 200) pending = pending.slice(-200);
  savePending();
  renderSyncBar();
}
function pendingSummary() {
  if (!pending.length) return '（无待同步勾选）';
  const date = (daily && daily.date) || TODAY;
  const lines = [`【咕咕日迹 · 勾选反馈】日清单 ${date} · ${pending.length} 条（仅本机，请咕咕改 JSON 后推 Pages）`];
  pending.forEach((p, i) => {
    const mark = p.done ? '☑' : '☐';
    lines.push(`${i + 1}. ${mark} [${p.section || ''}] ${p.title || p.id}${p.act && p.act !== 'toggle' ? ' · ' + p.act : ''}`);
  });
  lines.push('— 静态 Pages 无法直写仓库；咕咕收到后请更新 daily-latest.json 并随时推送（不限早晨）。');
  return lines.join('\n');
}
function renderSyncBar() {
  const bar = $('#sync-bar'); const panel = $('#sync-panel');
  if (!bar) return;
  if (!pending.length) {
    bar.classList.add('hidden');
    if (panel) panel.classList.add('hidden');
    return;
  }
  bar.classList.remove('hidden');
  $('#sync-count').textContent = `有 ${pending.length} 条未同步给咕咕`;
  if (panel && !panel.classList.contains('hidden')) {
    $('#sync-text').textContent = pendingSummary();
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

$$('.tabbar button').forEach(b => b.addEventListener('click', () => {
  $$('.tabbar button').forEach(x => x.classList.toggle('on', x === b));
  $$('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + b.dataset.tab));
  window.scrollTo(0, 0);
  const tab = b.dataset.tab;
  if (tab === 'search') setTimeout(() => $('#search-input').focus(), 50);
  // 随时同步：进今天/跟办/日记都重新拉 JSON（cache-bust）
  if (tab === 'today') { loadDaily(); loadExtras(); }
  else if (tab === 'follow' || tab === 'diary') { loadExtras(); }
}));

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
    pushPending({
      act: 'toggle', id, date, done: !cur,
      title: it ? it.title : id,
      section: it ? (it.sectionName || '') : '',
      src,
    });
    toast(!cur ? '已勾（本机；可点「复制给咕咕」同步）' : '已恢复未完成');
    setTimeout(renderTodos, 200);
    return;
  }
  if (b.dataset.act === 'tmr') {
    setOv(date, id, { hide: true, tag: 'tmr' });
    pushPending({ act: 'tmr', id, date, title: it ? it.title : id, section: '', src, done: false });
    toast('已推明天（本机暂隐）');
  }
  if (b.dataset.act === 'gugu') {
    setOv(date, id, { tag: 'gugu', hide: true });
    const title = it ? it.title : id;
    if (!db.follow.gugu) db.follow.gugu = [];
    db.follow.gugu.unshift({ name: title, amount: '', due: '待排', status: 'gray', state: '刚转入', note: '来自日清单（本机）' });
    save();
    pushPending({ act: 'gugu', id, date, title, section: '', src, done: false });
    toast('已转咕咕，进「跟办 · 咕咕在办」');
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

function renderDiary() {
  const q = $('#diary-filter').value.trim();
  const list = (db.diary || []).filter(d => !q || d.text.toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.ts - a.ts);
  if (!list.length) {
    $('#diary-timeline').innerHTML = `<p class="empty">${q ? '没有匹配的日记' : (db.diaryNote || '还没有日记')}</p>`;
    return;
  }
  let html = '', cur = '';
  list.forEach(d => {
    const lab = dayLabel(d.ts);
    if (lab !== cur) { if (cur) html += '</div>'; html += `<div class="day">${lab}</div><div class="tl">`; cur = lab; }
    html += `<div class="entry"><div class="time">${hm(d.ts)}${d.src ? `<span class="src">· ${esc(d.src)}</span>` : ''}</div><div>${hl(d.text, q)}</div></div>`;
  });
  $('#diary-timeline').innerHTML = html + '</div>';
}
function addDiary(text, src) {
  if (!db.diary) db.diary = [];
  db.diary.push({ id: uid(), ts: Date.now(), text, src });
  save(); renderDiary();
}
$('#diary-filter').addEventListener('input', renderDiary);
$('#diary-save').addEventListener('click', () => {
  const v = $('#diary-input').value.trim(); if (!v) return toast('先写点什么');
  addDiary(v); $('#diary-input').value = ''; toast('已记入日记');
});

function renderSearch() {
  const q = $('#search-input').value.trim().toLowerCase();
  const box = $('#search-results');
  if (!q) { box.innerHTML = '<p class="empty">输入关键词，同时搜三处。</p>'; return; }
  const has = s => s && s.toLowerCase().includes(q);
  const dailyItems = flattenDailyItems().filter(t => !t.hide && (has(t.title) || has(t.note) || has(t.sectionName)));
  const diary = (db.diary || []).filter(d => has(d.text)).sort((a, b) => b.ts - a.ts);
  const segName = { clean: '清收', node: '合同节点', gugu: '咕咕在办' };
  const follow = Object.entries(db.follow).filter(([k]) => !k.endsWith('Note')).flatMap(([k, arr]) =>
    (Array.isArray(arr) ? arr : []).filter(i => has(i.name) || has(i.note)).map(i => ({ ...i, seg: k }))
  );
  const Q = $('#search-input').value.trim();
  let html = '';
  if (dailyItems.length) html += `<div class="res-head">日清单 · ${dailyItems.length}</div><div class="group">` +
    dailyItems.map(t => `<div class="res"><div>${hl(t.title, Q)}</div><div class="s">${esc(t.sectionName)} · ${t.done ? '已勾' : '未完成'}</div></div>`).join('') + '</div>';
  if (diary.length) html += `<div class="res-head">日记 · ${diary.length}</div><div class="group">` +
    diary.map(d => `<div class="res"><div>${hl(d.text, Q)}</div><div class="s">${dayLabel(d.ts)} ${hm(d.ts)}</div></div>`).join('') + '</div>';
  if (follow.length) html += `<div class="res-head">跟办 · ${follow.length}</div><div class="group">` +
    follow.map(i => `<div class="res"><div><span class="dot ${i.status || 'gray'}" style="display:inline-block;margin-right:6px"></span>${hl(i.name, Q)}</div><div class="s">${segName[i.seg] || i.seg} · ${esc(i.amount || i.state || '')}</div></div>`).join('') + '</div>';
  box.innerHTML = html || '<p class="empty">没有找到</p>';
}
$('#search-input').addEventListener('input', renderSearch);

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
  if (Array.isArray(data.diary) && data.diary.length) {
    // prefer bundled diary over empty; keep user-added (no src 工作日记 or 记一笔)
    const user = (db.diary || []).filter(d => d.src === '记一笔' || (!d.src && d.id && String(d.id).length < 20));
    db.diary = data.diary.concat(user);
    db.diaryNote = data.diaryNote || '';
  }
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

function wireSyncUI() {
  const copyBtn = $('#sync-copy');
  const showBtn = $('#sync-show');
  const clearBtn = $('#sync-copied');
  if (copyBtn) copyBtn.addEventListener('click', async () => {
    const text = pendingSummary();
    try {
      await navigator.clipboard.writeText(text);
      toast('已复制，发给咕咕即可改 JSON 推 Pages');
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
}

renderMorning(); renderFollow(); renderDiary(); renderTodos(); renderSyncBar();
wireSyncUI();
Promise.all([loadDaily(), loadExtras()]).then(() => renderSyncBar());
// 回到前台时再拉一次
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    loadDaily(); loadExtras();
  }
});
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
window.guguReset = () => {
  [KEY, DAILY_CACHE_KEY, EXTRAS_CACHE_KEY, OVERLAY_KEY, LOCAL_TODOS_KEY, PENDING_KEY].forEach(k => localStorage.removeItem(k));
  location.reload();
};
})();
