/* 咕咕日迹 · MVP 样板（数据全部存 localStorage） */
(() => {
const KEY = 'gugu-riji.v1';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (n, base = new Date()) => { const d = new Date(base); d.setDate(d.getDate() + n); return d; };
const TODAY = ymd(new Date());
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const at = (dayOffset, h, m) => { const d = addDays(dayOffset); d.setHours(h, m, 0, 0); return d.getTime(); };

/* ---------- 假数据 ---------- */
function seed() {
  return {
    morning: [
      { id: 'm1', title: '人员资质表：本周内由罗婷牵头汇总', detail: '咕咕已比对 3 张证书到期，建议周三前出表', decision: null, note: '' },
      { id: 'm2', title: '揭东 27.75 万：发第二次商请支付函', detail: '上次函件 10/12 发出，对方未回复；函稿已备', decision: null, note: '' },
      { id: 'm3', title: '杭峰续聘：按原条件续签一年', detail: '合同 11/9 到期，人事已确认无异议', decision: null, note: '' },
    ],
    todos: [
      { id: uid(), title: '人员资质表盯办——叫罗婷周三前交初稿', due: ymd(addDays(-1)), done: false, tag: '' },
      { id: uid(), title: '杭峰续聘合同（约 11/9 到期）走审批', due: ymd(addDays(-2)), done: false, tag: '' },
      { id: uid(), title: '湛江挂证情况跟进，问清注销进度', due: TODAY, done: false, tag: '' },
      { id: uid(), title: 'S340 图纸审核意见汇总回复设计所', due: TODAY, done: false, tag: '' },
      { id: uid(), title: '10 月经营数据月报口径核对', due: TODAY, done: false, tag: '' },
      { id: uid(), title: '惠来项目付款承诺函归档', due: ymd(addDays(-3)), done: true, tag: '' },
    ],
    diary: [
      { id: uid(), ts: at(0, 9, 12), text: '早上和罗婷对了一下资质表，缺两人的社保证明，她说周一补齐。' },
      { id: uid(), ts: at(0, 11, 40), text: 'S340 图纸审核，第三册结构部分还有疑问，先标注，周一问设计所。' },
      { id: uid(), ts: at(-1, 10, 5), text: '惠来那边口头确认 2027-02 前付清，要求对方出书面承诺函。' },
      { id: uid(), ts: at(-1, 15, 30), text: '湛江挂证：对方说已在走注销流程，大约两周，下周再追。' },
      { id: uid(), ts: at(-1, 17, 48), text: '揭东两笔合计 27.75 万，财政口径说要等年底化债批次。' },
    ],
    follow: {
      clean: [
        { name: '揭东 · 道路勘察设计费（两笔）', amount: '27.75 万', due: '2026-11-15', status: 'red', state: '逾期 · 已发一次函', note: '等年底化债批次，拟发二次商请函' },
        { name: '惠来 · 公路养护咨询', amount: '18.40 万', due: '2027-02-28', status: 'orange', state: '已承诺', note: '对方承诺 2027-02 前付清，书面函待收' },
        { name: '湛江 · 桥梁定检', amount: '9.60 万', due: '2026-12-20', status: 'blue', state: '分期中', note: '第 1 期已到账 4.8 万' },
        { name: '普宁 · 农村公路设计', amount: '6.20 万', due: '2026-12-31', status: 'green', state: '正常', note: '审计结算中' },
      ],
      node: [
        { name: '电子证使用有效期（安许/资质电子证）', amount: '', due: '2026-11-20', status: 'red', state: '20 天内', note: '需在平台提交延续，咕咕已列材料清单' },
        { name: '杭峰续聘合同到期', amount: '', due: '2026-11-09', status: 'orange', state: '审批中', note: '晨报已提请拍板' },
        { name: 'S340 设计合同 · 施工图阶段交付', amount: '合同 126 万', due: '2026-12-10', status: 'blue', state: '进行中', note: '图纸审核意见待回复' },
        { name: '公路养护作业资质延续', amount: '', due: '2027-03-31', status: 'green', state: '正常', note: '提前 3 个月准备材料' },
      ],
      gugu: [
        { name: '起草揭东第二次商请支付函', amount: '', due: '今天 20:00', status: 'blue', state: '起草中', note: '套用清收函件模板，财政资金口径' },
        { name: '人员资质表比对（证书到期）', amount: '', due: '明天', status: 'blue', state: '比对中', note: '已比对 42/57 人' },
        { name: '10 月经营数据汇总表', amount: '', due: '11-03', status: 'gray', state: '排队', note: '等财务导出回款明细' },
      ],
    },
  };
}
let db;
try { db = JSON.parse(localStorage.getItem(KEY)) || seed(); } catch { db = seed(); }
const save = () => localStorage.setItem(KEY, JSON.stringify(db));
save();

/* ---------- 通用 ---------- */
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1600); }
function haptic() { navigator.vibrate && navigator.vibrate(8); }
function dueLabel(d) {
  if (!d) return '';
  if (d === TODAY) return '今天';
  if (d === ymd(addDays(1))) return '明天';
  if (d === ymd(addDays(-1))) return '昨天';
  return d.slice(5).replace('-', '/');
}
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

/* ---------- Tab ---------- */
$$('.tabbar button').forEach(b => b.addEventListener('click', () => {
  $$('.tabbar button').forEach(x => x.classList.toggle('on', x === b));
  $$('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + b.dataset.tab));
  window.scrollTo(0, 0);
  if (b.dataset.tab === 'search') setTimeout(() => $('#search-input').focus(), 50);
}));

/* ---------- 今天 ---------- */
const now = new Date();
const isWeekend = now.getDay() === 0 || now.getDay() === 6;
let weekendPeek = false;
$('#today-date').textContent = `${now.getMonth() + 1}月${now.getDate()}日 星期${'日一二三四五六'[now.getDay()]}`;

function renderMorning() {
  const list = $('#morning-list');
  $('#weekend-bar').classList.toggle('hidden', !isWeekend);
  list.classList.toggle('muted-off', isWeekend && !weekendPeek);
  const pending = db.morning.filter(m => !m.decision).length;
  $('#morning-count').textContent = isWeekend && !weekendPeek ? '已静默' : (pending ? `${pending} 条待定` : '已全部拍板');
  const BADGE = { ok: '✓ 已同意', edit: '✎ 要改', later: '⏸ 缓办' };
  list.innerHTML = db.morning.map(m => `
    <div class="mcard ${m.decision ? 'decided' : ''}" data-id="${m.id}" data-badge="${m.decision ? BADGE[m.decision] : ''}">
      <div class="t">${esc(m.title)}</div>
      <div class="d">${esc(m.detail)}</div>
      <div class="acts">
        <button class="a-ok ${m.decision === 'ok' ? 'sel' : ''}" data-act="ok">同意</button>
        <button class="a-edit ${m.decision === 'edit' ? 'sel' : ''}" data-act="edit">改</button>
        <button class="a-later ${m.decision === 'later' ? 'sel' : ''}" data-act="later">缓</button>
      </div>
      ${m.decision === 'edit' ? `<div class="note"><input placeholder="改成…（发给咕咕）" value="${esc(m.note)}"><button class="link bold" data-act="send">发送</button></div>` : ''}
    </div>`).join('');
}
$('#morning-list').addEventListener('click', e => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const card = b.closest('.mcard'); const m = db.morning.find(x => x.id === card.dataset.id);
  const act = b.dataset.act;
  if (act === 'send') {
    m.note = $('input', card).value.trim(); save();
    toast(m.note ? '修改意见已转咕咕' : '请先写修改意见'); return;
  }
  m.decision = m.decision === act ? null : act; save(); haptic();
  renderMorning();
  if (m.decision) toast({ ok: '已同意，咕咕去办', edit: '写下要改的地方', later: '已缓，下周一再提' }[m.decision]);
  if (m.decision === 'edit') $(`.mcard[data-id="${m.id}"] input`).focus();
});
$('#weekend-peek').addEventListener('click', () => {
  weekendPeek = !weekendPeek; $('#weekend-peek').textContent = weekendPeek ? '收起' : '临时查看'; renderMorning();
});

function todoRow(t) {
  const overdue = !t.done && t.due && t.due < TODAY;
  return `
  <div class="row-wrap" data-id="${t.id}">
    <div class="row-acts"><button class="b-tmr" data-act="tmr">推明天</button><button class="b-gugu" data-act="gugu">转咕咕</button></div>
    <div class="row ${t.done ? 'done' : ''}">
      <button class="check ${t.done ? 'on' : ''}" data-act="toggle" aria-label="完成"></button>
      <div class="body">
        <div class="title">${esc(t.title)}</div>
        <div class="meta">
          ${t.due ? `<span class="${overdue ? 'overdue' : ''}">${overdue ? '逾期 · ' : ''}${dueLabel(t.due)}</span>` : ''}
          ${t.tag === 'gugu' ? '<span class="tag-gugu">● 咕咕在办</span>' : ''}
        </div>
      </div>
      ${t.done ? '' : '<button class="more" data-act="reveal" aria-label="更多">⋯</button>'}
    </div>
  </div>`;
}
function renderTodos() {
  const open = db.todos.filter(t => !t.done && (!t.due || t.due <= TODAY))
    .sort((a, b) => (a.due || '').localeCompare(b.due || ''));
  const later = db.todos.filter(t => !t.done && t.due > TODAY);
  const done = db.todos.filter(t => t.done).slice(-5);
  $('#todo-list').innerHTML = open.length ? open.map(todoRow).join('') : '<p class="empty">今天清了 👍</p>';
  $('#todo-count').textContent = `${open.length} 项${later.length ? ` · 往后 ${later.length}` : ''}`;
  $('#done-list').innerHTML = done.map(todoRow).join('');
  $('#done-head').classList.toggle('hidden', !done.length);
  $('#done-count').textContent = done.length;
}
function onTodoAction(e) {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const wrap = b.closest('.row-wrap'); const t = db.todos.find(x => x.id === wrap.dataset.id); if (!t) return;
  const row = $('.row', wrap);
  haptic();
  if (b.dataset.act === 'reveal') { setOpen(row, !row.dataset.open); return; }
  if (b.dataset.act === 'toggle') {
    t.done = !t.done; save();
    $('.check', row).classList.toggle('on', t.done); row.classList.toggle('done', t.done);
    if (t.done) toast('已完成');
    setTimeout(renderTodos, 350); return;
  }
  if (b.dataset.act === 'tmr') { t.due = ymd(addDays(1)); toast('已推到明天'); }
  if (b.dataset.act === 'gugu') {
    t.tag = 'gugu'; t.due = ''; toast('已转咕咕，进「跟办 · 咕咕在办」');
    db.follow.gugu.unshift({ name: t.title, amount: '', due: '待排', status: 'gray', state: '刚转入', note: '来自日清单' });
  }
  save(); row.classList.add('leaving'); setTimeout(() => { renderTodos(); renderFollow(); }, 330);
}
$('#todo-list').addEventListener('click', onTodoAction);
$('#done-list').addEventListener('click', onTodoAction);

/* 左滑 */
const OPEN_X = -152;
function setOpen(row, open) {
  $$('.row[data-open]').forEach(r => { if (r !== row) { r.style.transform = ''; delete r.dataset.open; } });
  row.style.transform = open ? `translateX(${OPEN_X}px)` : '';
  if (open) row.dataset.open = '1'; else delete row.dataset.open;
}
let drag = null;
document.addEventListener('pointerdown', e => {
  const row = e.target.closest('#todo-list .row');
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
  const x = base + (e.clientX - x0);
  setOpen(row, x < OPEN_X / 2);
};
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);
document.addEventListener('click', e => { if (e.target.closest('.row') && e.target.closest('.row').classList.contains('dragging')) e.stopPropagation(); }, true);

/* ---------- 跟办 ---------- */
let seg = 'clean';
$$('#follow-seg button').forEach(b => b.addEventListener('click', () => {
  seg = b.dataset.seg; $$('#follow-seg button').forEach(x => x.classList.toggle('on', x === b)); renderFollow();
}));
function renderFollow() {
  const items = db.follow[seg];
  const n = c => items.filter(i => i.status === c).length;
  const sums = {
    clean: [['61.95 万', '应收未收'], [n('red'), '逾期'], [n('orange') + n('blue'), '承诺/分期']],
    node: [[n('red'), '30 天内'], [n('orange'), '审批中'], [items.length, '节点总数']],
    gugu: [[items.length, '在办'], [n('gray'), '排队'], ['今晚', '下次回报']],
  }[seg];
  $('#follow-summary').innerHTML = sums.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
  $('#follow-list').innerHTML = items.map(i => `
    <div class="fcard">
      <div class="top"><span class="dot ${i.status}"></span><span class="name">${esc(i.name)}</span>${i.amount ? `<span class="amt">${esc(i.amount)}</span>` : ''}</div>
      <div class="info"><span>${seg === 'gugu' ? '预计' : '到期'} ${esc(i.due)}</span><span class="pill">${esc(i.state)}</span></div>
      ${i.note ? `<div class="note">${esc(i.note)}</div>` : ''}
    </div>`).join('');
}

/* ---------- 日记 ---------- */
function renderDiary() {
  const q = $('#diary-filter').value.trim();
  const list = db.diary.filter(d => !q || d.text.toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.ts - a.ts);
  if (!list.length) { $('#diary-timeline').innerHTML = `<p class="empty">${q ? '没有匹配的日记' : '还没有日记'}</p>`; return; }
  let html = '', cur = '';
  list.forEach(d => {
    const lab = dayLabel(d.ts);
    if (lab !== cur) { if (cur) html += '</div>'; html += `<div class="day">${lab}</div><div class="tl">`; cur = lab; }
    html += `<div class="entry"><div class="time">${hm(d.ts)}${d.src ? `<span class="src">· ${esc(d.src)}</span>` : ''}</div><div>${hl(d.text, q)}</div></div>`;
  });
  $('#diary-timeline').innerHTML = html + '</div>';
}
function addDiary(text, src) { db.diary.push({ id: uid(), ts: Date.now(), text, src }); save(); renderDiary(); }
$('#diary-filter').addEventListener('input', renderDiary);
$('#diary-save').addEventListener('click', () => {
  const v = $('#diary-input').value.trim(); if (!v) return toast('先写点什么');
  addDiary(v); $('#diary-input').value = ''; toast('已记入日记');
});

/* ---------- 搜索 ---------- */
function renderSearch() {
  const q = $('#search-input').value.trim().toLowerCase();
  const box = $('#search-results');
  if (!q) { box.innerHTML = '<p class="empty">输入关键词，同时搜三处。</p>'; return; }
  const has = s => s && s.toLowerCase().includes(q);
  const todos = db.todos.filter(t => has(t.title));
  const diary = db.diary.filter(d => has(d.text)).sort((a, b) => b.ts - a.ts);
  const segName = { clean: '清收', node: '合同节点', gugu: '咕咕在办' };
  const follow = Object.entries(db.follow).flatMap(([k, arr]) => arr.filter(i => has(i.name) || has(i.note)).map(i => ({ ...i, seg: k })));
  const Q = $('#search-input').value.trim();
  let html = '';
  if (todos.length) html += `<div class="res-head">待办 · ${todos.length}</div><div class="group">` +
    todos.map(t => `<div class="res"><div>${hl(t.title, Q)}</div><div class="s">${t.done ? '已完成' : (t.tag === 'gugu' ? '咕咕在办' : dueLabel(t.due) || '无日期')}</div></div>`).join('') + '</div>';
  if (diary.length) html += `<div class="res-head">日记 · ${diary.length}</div><div class="group">` +
    diary.map(d => `<div class="res"><div>${hl(d.text, Q)}</div><div class="s">${dayLabel(d.ts)} ${hm(d.ts)}</div></div>`).join('') + '</div>';
  if (follow.length) html += `<div class="res-head">跟办 · ${follow.length}</div><div class="group">` +
    follow.map(i => `<div class="res"><div><span class="dot ${i.status}" style="display:inline-block;margin-right:6px"></span>${hl(i.name, Q)}</div><div class="s">${segName[i.seg]} · ${esc(i.amount || i.state)} · ${esc(i.due)}</div></div>`).join('') + '</div>';
  box.innerHTML = html || '<p class="empty">没有找到</p>';
}
$('#search-input').addEventListener('input', renderSearch);

/* ---------- + 弹层 ---------- */
const TODO_RE = /^\s*待办[：:]\s*/;
function openSheet() { $('#sheet').classList.add('show'); $('#sheet-mask').classList.add('show'); setTimeout(() => $('#sheet-input').focus(), 250); updateHint(); }
function closeSheet() { $('#sheet').classList.remove('show'); $('#sheet-mask').classList.remove('show'); $('#sheet-input').blur(); }
function updateHint() { $('#route-hint').innerHTML = TODO_RE.test($('#sheet-input').value) ? '→ 将存入 <b>日清单（今天）</b>' : '→ 将存入 <b>日记</b>'; }
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
    db.todos.push({ id: uid(), title, due: TODAY, done: false, tag: '' }); save(); renderTodos(); toast('已加入日清单');
  } else { addDiary(v, '记一笔'); toast('已记入日记'); }
  $('#sheet-input').value = ''; closeSheet(); haptic();
});

/* ---------- 启动 ---------- */
renderMorning(); renderTodos(); renderFollow(); renderDiary();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
window.guguReset = () => { localStorage.removeItem(KEY); location.reload(); };
})();
