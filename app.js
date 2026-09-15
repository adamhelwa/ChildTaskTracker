/* ChildTaskTracker — static front-end demo. All state lives in localStorage. */

const STORAGE_KEY = 'ctt_state_v1';
const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const EMOJI_CHOICES = ['🪥','🛏️','🎒','📚','🧸','🐕','🧹','📖','🥪','🍽️','🎹','🗑️','🧺','🚿','🐟','⭐'];
const REWARD_EMOJI_CHOICES = ['🍦','🎬','🧸','🏕️','💰','🌙','🎮','🛌','🍕','🎨','📱','🚲'];

let STATE = null;
let notifOpen = false;
let modalCtx = {};
const aiCache = {};

/* ---------- utils ---------- */
function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 7)}`;
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function isoDate(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}
function todayStr() { return STATE.clock.simulatedDate; }
function nowMs() { return STATE.clock.simulatedNowMs; }
function recurrenceLabel(rec) {
  if (rec.type === 'daily') return 'Every day';
  if (rec.type === 'weekdays') return 'Weekdays';
  if (rec.type === 'weekly') return `Every ${WEEKDAYS[rec.weekday]}`;
  if (rec.type === 'oneoff') return `Once · ${rec.date}`;
  return '';
}
function isTaskDueOn(task, dateStr) {
  const dow = new Date(`${dateStr}T00:00:00`).getDay();
  switch (task.recurrence.type) {
    case 'daily': return true;
    case 'weekdays': return dow >= 1 && dow <= 5;
    case 'weekly': return dow === task.recurrence.weekday;
    case 'oneoff': return task.recurrence.date === dateStr;
    default: return false;
  }
}
function fmtAgo(ms) {
  const diff = Math.max(0, nowMs() - ms);
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}
function fmtRemaining(ms) {
  const diff = ms - nowMs();
  if (diff <= 0) return 'approving now';
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins}m left`;
  return `${Math.round(mins / 60)}h left`;
}

/* ---------- storage ---------- */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(STATE)); } catch {}
}

function buildSeedState() {
  const now = Date.now();
  const today = isoDate(new Date(now));
  const state = {
    clock: { simulatedNowMs: now, simulatedDate: today },
    children: [], tasks: [], completions: [], rewards: [], redemptions: [], pointsLedger: [], notifications: [],
  };

  const emma = { id: 'c_emma', name: 'Emma', age: 8, avatar: '🦊', points: 0 };
  const jayden = { id: 'c_jayden', name: 'Jayden', age: 14, avatar: '🐺', points: 0 };
  state.children.push(emma, jayden);

  const mkTask = (id, childId, title, emoji, recurrence, pointValue) =>
    ({ id, childId, title, emoji, recurrence, pointValue, active: true });
  state.tasks.push(
    mkTask('t_teeth', 'c_emma', 'Brush teeth', '🪥', { type: 'daily' }, 10),
    mkTask('t_bed', 'c_emma', 'Make the bed', '🛏️', { type: 'daily' }, 10),
    mkTask('t_bag', 'c_emma', 'Pack school bag', '🎒', { type: 'weekdays' }, 10),
    mkTask('t_hw_e', 'c_emma', 'Homework block', '📚', { type: 'weekdays' }, 20),
    mkTask('t_toys', 'c_emma', 'Tidy toys', '🧸', { type: 'weekly', weekday: 0 }, 15),
    mkTask('t_study', 'c_jayden', 'Study block', '📖', { type: 'weekdays' }, 25),
    mkTask('t_dog', 'c_jayden', 'Walk the dog', '🐕', { type: 'daily' }, 15),
    mkTask('t_laundry', 'c_jayden', 'Manage own laundry', '🧺', { type: 'weekly', weekday: 6 }, 20),
    mkTask('t_room', 'c_jayden', 'Tidy room', '🧹', { type: 'weekly', weekday: 0 }, 15),
  );

  const mkReward = (id, childId, title, emoji, pointCost) => ({ id, childId, title, emoji, pointCost, active: true });
  state.rewards.push(
    mkReward('r_icecream', 'c_emma', 'Ice cream trip', '🍦', 60),
    mkReward('r_movie', 'c_emma', 'Pick movie night', '🎬', 80),
    mkReward('r_toy', 'c_emma', 'New toy', '🧸', 150),
    mkReward('r_adventure', 'c_emma', 'Weekend adventure', '🏕️', 250),
    mkReward('r_allowance', 'c_jayden', 'Allowance bump', '💰', 150),
    mkReward('r_curfew', 'c_jayden', 'Later curfew (1hr)', '🌙', 120),
    mkReward('r_game', 'c_jayden', 'New game', '🎮', 220),
    mkReward('r_sleepover', 'c_jayden', 'Friend sleepover', '🛌', 180),
  );

  function seedApprove(taskId, childId, dateStr, minutesAgo) {
    const atMs = now - minutesAgo * 60000;
    state.completions.push({ id: uid('cm'), taskId, childId, date: dateStr, markedAtMs: atMs, status: 'approved', validatedBy: 'parent_a' });
    const task = state.tasks.find(x => x.id === taskId);
    state.pointsLedger.push({ id: uid('pl'), childId, delta: task.pointValue, reason: `Task: ${task.title}`, atMs });
  }

  for (let back = 4; back >= 1; back--) {
    const d = addDays(today, -back);
    state.tasks.filter(x => x.childId === 'c_emma').forEach(task => { if (isTaskDueOn(task, d)) seedApprove(task.id, 'c_emma', d, back * 1440); });
    state.tasks.filter(x => x.childId === 'c_jayden' && (x.recurrence.type === 'daily' || x.recurrence.type === 'weekdays')).forEach(task => { if (isTaskDueOn(task, d)) seedApprove(task.id, 'c_jayden', d, back * 1440); });
  }

  const studyTask = state.tasks.find(x => x.id === 't_study');
  if (isTaskDueOn(studyTask, today)) {
    const atMs = now - 45 * 60000;
    state.completions.push({ id: uid('cm'), taskId: 't_study', childId: 'c_jayden', date: today, markedAtMs: atMs, status: 'pending' });
    state.notifications.push({ id: uid('nt'), recipient: 'parent_a', type: 'task_completed', childId: 'c_jayden', text: 'Jayden marked "Study block" done', atMs, read: false });
    state.notifications.push({ id: uid('nt'), recipient: 'parent_b', type: 'task_completed', childId: 'c_jayden', text: 'Jayden marked "Study block" done', atMs, read: false });
  }

  ['c_emma', 'c_jayden'].forEach(cid => {
    const total = state.pointsLedger.filter(l => l.childId === cid).reduce((s, l) => s + l.delta, 0);
    state.children.find(c => c.id === cid).points = total;
  });

  if (emma.points >= 60) {
    const atMs = now - 5 * 24 * 60 * 60000;
    state.redemptions.push({ id: uid('rd'), rewardId: 'r_icecream', childId: 'c_emma', requestedAtMs: atMs, status: 'approved', approvedBy: 'parent_b' });
    state.pointsLedger.push({ id: uid('pl'), childId: 'c_emma', delta: -60, reason: 'Redeemed: Ice cream trip', atMs });
    emma.points -= 60;
    state.notifications.push({ id: uid('nt'), recipient: 'parent_a', type: 'redeemed', childId: 'c_emma', text: 'Ice cream trip was redeemed for Emma', atMs, read: true });
    state.notifications.push({ id: uid('nt'), recipient: 'parent_b', type: 'redeemed', childId: 'c_emma', text: 'Ice cream trip was redeemed for Emma', atMs, read: true });
  }

  const affordable = state.rewards.filter(x => x.childId === 'c_jayden' && x.pointCost <= jayden.points);
  if (affordable.length) {
    const pick = affordable[0];
    const atMs = now - 20 * 60000;
    state.redemptions.push({ id: uid('rd'), rewardId: pick.id, childId: 'c_jayden', requestedAtMs: atMs, status: 'pending' });
    state.notifications.push({ id: uid('nt'), recipient: 'parent_a', type: 'redeem_request', childId: 'c_jayden', text: `Jayden wants to redeem ${pick.title}`, atMs, read: false });
    state.notifications.push({ id: uid('nt'), recipient: 'parent_b', type: 'redeem_request', childId: 'c_jayden', text: `Jayden wants to redeem ${pick.title}`, atMs, read: false });
  }

  return state;
}

function initApp() {
  STATE = loadState();
  if (!STATE) { STATE = buildSeedState(); saveState(); }
  checkAutoApprovals();
}

/* ---------- derived data ---------- */
function findCompletion(taskId, date) { return STATE.completions.find(c => c.taskId === taskId && c.date === date); }
function tasksForChild(childId) { return STATE.tasks.filter(t => t.childId === childId && t.active); }
function rewardsForChild(childId) { return STATE.rewards.filter(r => r.childId === childId && r.active); }
function getChild(id) { return STATE.children.find(c => c.id === id); }

function computeStreak(childId) {
  let streak = 0, forgiven = false, cursor = addDays(todayStr(), -1), guard = 0;
  while (guard++ < 90) {
    const due = tasksForChild(childId).filter(t => isTaskDueOn(t, cursor));
    if (due.length > 0) {
      const allDone = due.every(t => {
        const c = findCompletion(t.id, cursor);
        return c && (c.status === 'approved' || c.status === 'auto_approved');
      });
      if (allDone) streak++;
      else if (!forgiven) forgiven = true;
      else break;
    }
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function weeklyStats(childId) {
  let due = 0, approved = 0;
  for (let back = 0; back < 7; back++) {
    const d = addDays(todayStr(), -back);
    tasksForChild(childId).forEach(t => {
      if (isTaskDueOn(t, d)) {
        due++;
        const c = findCompletion(t.id, d);
        if (c && (c.status === 'approved' || c.status === 'auto_approved')) approved++;
      }
    });
  }
  const completionRate = due === 0 ? 0 : Math.round((approved / due) * 100);
  return { completionRate, approvedThisWeek: approved, dueThisWeek: due, streak: computeStreak(childId) };
}

function badgesForPoints(points) {
  const tiers = [[50, '🥉'], [150, '🥈'], [300, '🥇'], [500, '🏆']];
  return tiers.filter(([t]) => points >= t).map(([, e]) => e);
}

function notificationsFor(recipient) { return STATE.notifications.filter(n => n.recipient === recipient).sort((a, b) => b.atMs - a.atMs); }
function unreadCount(recipient) { return STATE.notifications.filter(n => n.recipient === recipient && !n.read).length; }

/* ---------- mutations ---------- */
function addLedger(childId, delta, reason) {
  STATE.pointsLedger.push({ id: uid('pl'), childId, delta, reason, atMs: nowMs() });
  getChild(childId).points += delta;
}
function notifyParents(type, childId, text) {
  ['parent_a', 'parent_b'].forEach(recipient => {
    STATE.notifications.push({ id: uid('nt'), recipient, type, childId, text, atMs: nowMs(), read: false });
  });
}

function markTaskDone(taskId) {
  const task = STATE.tasks.find(t => t.id === taskId);
  const date = todayStr();
  let c = findCompletion(taskId, date);
  if (c && c.status !== 'rejected') return;
  if (c) { c.status = 'pending'; c.markedAtMs = nowMs(); }
  else { STATE.completions.push({ id: uid('cm'), taskId, childId: task.childId, date, markedAtMs: nowMs(), status: 'pending' }); }
  const child = getChild(task.childId);
  notifyParents('task_completed', task.childId, `${child.name} marked "${task.title}" done`);
  saveState();
  showToast(`Nice! "${task.title}" is waiting for a parent.`);
  render();
}

function approveCompletion(id, by) {
  const c = STATE.completions.find(x => x.id === id);
  if (!c || c.status !== 'pending') return;
  const task = STATE.tasks.find(t => t.id === c.taskId);
  c.status = by === 'auto' ? 'auto_approved' : 'approved';
  c.validatedBy = by;
  addLedger(c.childId, task.pointValue, `Task: ${task.title}`);
  saveState();
}
function rejectCompletion(id, by) {
  const c = STATE.completions.find(x => x.id === id);
  if (!c || c.status !== 'pending') return;
  c.status = 'rejected';
  c.validatedBy = by;
  saveState();
}

function checkAutoApprovals() {
  let changed = false;
  STATE.completions.filter(c => c.status === 'pending').forEach(c => {
    if (nowMs() - c.markedAtMs >= 86400000) { approveCompletion(c.id, 'auto'); changed = true; }
  });
  if (changed) saveState();
}

function requestRedemption(rewardId) {
  const reward = STATE.rewards.find(r => r.id === rewardId);
  const child = getChild(reward.childId);
  if (child.points < reward.pointCost) return;
  const existing = STATE.redemptions.find(r => r.rewardId === rewardId && r.status === 'pending');
  if (existing) return;
  STATE.redemptions.push({ id: uid('rd'), rewardId, childId: reward.childId, requestedAtMs: nowMs(), status: 'pending' });
  notifyParents('redeem_request', reward.childId, `${child.name} wants to redeem ${reward.title}`);
  saveState();
  showToast('Sent to your parents for approval!');
  render();
}
function approveRedemption(id, by) {
  const r = STATE.redemptions.find(x => x.id === id);
  if (!r || r.status !== 'pending') return;
  const reward = STATE.rewards.find(x => x.id === r.rewardId);
  r.status = 'approved'; r.approvedBy = by;
  addLedger(r.childId, -reward.pointCost, `Redeemed: ${reward.title}`);
  saveState();
}
function declineRedemption(id, by) {
  const r = STATE.redemptions.find(x => x.id === id);
  if (!r || r.status !== 'pending') return;
  r.status = 'declined'; r.approvedBy = by;
  saveState();
}

function addChild(name, age) {
  const id = uid('c');
  STATE.children.push({ id, name, age, avatar: age <= 9 ? '🦊' : age <= 12 ? '🐼' : '🐺', points: 0 });
  saveState();
  return id;
}
function addTask(childId, data) {
  const id = uid('t');
  STATE.tasks.push({ id, childId, active: true, ...data });
  saveState();
  return id;
}
function updateTask(id, data) { Object.assign(STATE.tasks.find(t => t.id === id), data); saveState(); }
function removeTask(id) { const t = STATE.tasks.find(x => x.id === id); if (t) t.active = false; saveState(); }
function addReward(childId, data) {
  const id = uid('r');
  STATE.rewards.push({ id, childId, active: true, ...data });
  saveState();
  return id;
}
function updateReward(id, data) { Object.assign(STATE.rewards.find(r => r.id === id), data); saveState(); }
function removeReward(id) { const r = STATE.rewards.find(x => x.id === id); if (r) r.active = false; saveState(); }

function advanceOneDay() {
  STATE.clock.simulatedNowMs += 86400000;
  STATE.clock.simulatedDate = isoDate(new Date(STATE.clock.simulatedNowMs));
  checkAutoApprovals();
  saveState();
  showToast('⏩ A new day has begun!');
  render();
}
function resetDemo() {
  localStorage.removeItem(STORAGE_KEY);
  STATE = buildSeedState();
  saveState();
  location.hash = '#/';
  render();
  showToast('Demo data reset.');
}

/* ---------- toast / modal ---------- */
function showToast(msg) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => el.remove(), 2400);
}
function openModal(html, ctx = {}) {
  modalCtx = ctx;
  document.getElementById('modal-root').innerHTML = `<div class="modal-overlay" data-action="close-modal-backdrop">${html}</div>`;
}
function closeModal() { document.getElementById('modal-root').innerHTML = ''; modalCtx = {}; }

function emptyBlock(icon, text) {
  return `<div class="empty"><span class="big">${icon}</span>${esc(text)}</div>`;
}

function spawnConfetti(x, y) {
  const wrap = document.createElement('div');
  wrap.className = 'confetti-burst';
  wrap.style.cssText = `position:fixed; left:${x}px; top:${y}px; width:0; height:0; z-index:95;`;
  const bits = document.createElement('div');
  bits.className = 'bits';
  const emojis = ['🎉', '⭐', '✨', '🎊'];
  for (let i = 0; i < 6; i++) {
    const span = document.createElement('span');
    span.textContent = emojis[i % emojis.length];
    const angle = (i / 6) * Math.PI * 2;
    const dist = 40 + Math.random() * 30;
    span.style.setProperty('--tx', `${Math.cos(angle) * dist}px`);
    span.style.setProperty('--ty', `${Math.sin(angle) * dist - 20}px`);
    span.style.animationDelay = `${i * 0.02}s`;
    bits.appendChild(span);
  }
  wrap.appendChild(bits);
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 1000);
}

/* ---------- chrome ---------- */
function topbarChild(child) {
  return `<div class="topbar"><div class="topbar-inner">
    <button class="who" data-action="nav" data-href="#/"><span class="avatar">${child.avatar}</span>
      <span><div class="name">${esc(child.name)}</div><div class="sub">Age ${child.age}</div></span>
    </button>
    <button class="icon-btn" data-action="open-settings" aria-label="Settings">⚙️</button>
  </div></div>`;
}
function bottomnavChild(childId, active) {
  const tab = (key, icon, label) => `<a href="#/child/${childId}/${key}" class="${active === key ? 'active' : ''}"><span class="ic">${icon}</span>${label}</a>`;
  return `<div class="bottomnav"><div class="bottomnav-inner">
    ${tab('tasks', '✅', 'Tasks')}${tab('rewards', '🎁', 'Rewards')}${tab('progress', '📈', 'Progress')}
  </div></div>`;
}
function topbarParent(parentId, childId, tab) {
  const badge = unreadCount(`parent_${parentId.toLowerCase()}`);
  return `<div class="topbar"><div class="topbar-inner">
    <button class="who" data-action="nav" data-href="#/"><span class="avatar" style="background:var(--ink); color:#fff;">👤</span>
      <span><div class="name">Parent view</div><div class="sub">Managing the family</div></span>
    </button>
    <div class="parent-toggle" role="group" aria-label="Switch parent">
      <button class="${parentId === 'A' ? 'active' : ''}" data-action="set-parent" data-p="A" data-tab="${tab}" data-child="${childId || ''}">Parent A</button>
      <button class="${parentId === 'B' ? 'active' : ''}" data-action="set-parent" data-p="B" data-tab="${tab}" data-child="${childId || ''}">Parent B</button>
    </div>
    <button class="icon-btn" data-action="open-notifs" aria-label="Notifications">🔔${badge ? `<span class="dot"></span>` : ''}</button>
    <button class="icon-btn" data-action="open-settings" aria-label="Settings">⚙️</button>
  </div></div>`;
}
function bottomnavParent(parentId, active, childId) {
  const cid = childId || (STATE.children[0] && STATE.children[0].id) || '';
  const tab = (key, icon, label) => `<a href="#/parent/${parentId}/${key}/${cid}" class="${active === key ? 'active' : ''}"><span class="ic">${icon}</span>${label}</a>`;
  return `<div class="bottomnav"><div class="bottomnav-inner">
    <a href="#/parent/${parentId}/validate" class="${active === 'validate' ? 'active' : ''}"><span class="ic">📋</span>Validate</a>
    ${tab('children', '🧒', 'Children')}${tab('rewards', '🎁', 'Rewards')}${tab('insights', '📊', 'Insights')}
  </div></div>`;
}
function notifPanelHtml(parentId) {
  const recipient = `parent_${parentId.toLowerCase()}`;
  const items = notificationsFor(recipient);
  const rows = items.length ? items.map(n => `<div class="notif-item ${n.read ? '' : 'unread'}">
      <div class="t">${esc(n.text)}</div><div class="when">${fmtAgo(n.atMs)}</div>
    </div>`).join('') : emptyBlock('🔔', 'No notifications yet.');
  return `<div class="scrim ${notifOpen ? 'open' : ''}" data-action="close-notifs"></div>
  <div class="notif-panel ${notifOpen ? 'open' : ''}">
    <div class="notif-head"><h3>Notifications</h3>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-ghost btn-sm" data-action="mark-all-read" data-p="${parentId}">Mark all read</button>
        <button class="icon-btn" data-action="close-notifs" aria-label="Close">✕</button>
      </div>
    </div>
    <div class="notif-list">${rows}</div>
  </div>`;
}

/* ---------- picker ---------- */
function renderPicker() {
  const tiles = STATE.children.map(c => `<button class="profile-tile" data-action="nav" data-href="#/child/${c.id}/tasks">
      <div class="pa">${c.avatar}</div><div class="pn">${esc(c.name)}</div>
    </button>`).join('');
  return `<div class="picker-shell">
    <div class="logo">🦉</div>
    <h1>ChildTaskTracker</h1>
    <p class="sub">Who's using the app?</p>
    <div class="profile-grid">
      ${tiles}
      <button class="profile-tile parent" data-action="nav" data-href="#/parent/A/validate">
        <div class="pa">👤</div><div class="pn">Parent</div>
      </button>
    </div>
    <div class="footer-note">Demo build · all data stays in this browser</div>
  </div>`;
}

/* ---------- child views ---------- */
function renderChildTasks(child) {
  const today = todayStr();
  const due = tasksForChild(child.id).filter(t => isTaskDueOn(t, today));
  const doneCount = due.filter(t => { const c = findCompletion(t.id, today); return c && (c.status === 'approved' || c.status === 'auto_approved'); }).length;
  const rows = due.map(task => {
    const c = findCompletion(task.id, today);
    let cls = '', label = recurrenceLabel(task.recurrence), clickable = true, mark = '';
    if (c) {
      if (c.status === 'pending') { cls = 'pending'; label = 'Waiting for a parent'; clickable = false; mark = '⏳'; }
      else if (c.status === 'approved' || c.status === 'auto_approved') { cls = 'done'; label = c.status === 'auto_approved' ? 'Auto-approved ✓' : 'Approved ✓'; clickable = false; mark = '✓'; }
      else if (c.status === 'rejected') { label = 'Try again today'; }
    }
    return `<div class="task ${cls}">
      <div class="ticon">${task.emoji}</div>
      <div class="body"><div class="title">${esc(task.title)}</div><div class="status">${label}</div></div>
      <span class="points">+${task.pointValue}</span>
      ${clickable
        ? `<button class="check-btn" data-action="complete-task" data-task="${task.id}" aria-label="Mark ${esc(task.title)} done"></button>`
        : `<span class="check-btn" style="border-color:transparent;background:${cls === 'done' ? 'var(--grass)' : 'var(--sun-soft)'}; color:${cls === 'done' ? '#fff' : 'var(--sun-deep)'};">${mark}</span>`}
    </div>`;
  }).join('') || emptyBlock('🌤️', 'No tasks scheduled for today.');

  const stats = weeklyStats(child.id);
  return topbarChild(child) + `<div class="wrap">
    <div class="stat-bar">
      <div class="stat-chip flame"><div class="n">🔥 ${stats.streak}</div><div class="l">Day streak</div></div>
      <div class="stat-chip points"><div class="n">⭐ ${child.points}</div><div class="l">Points</div></div>
    </div>
    <div class="section-head"><h2>Today's tasks</h2><span class="meta">${doneCount} of ${due.length} done</span></div>
    ${rows}
  </div>` + bottomnavChild(child.id, 'tasks');
}

function renderChildRewards(child) {
  const rewards = rewardsForChild(child.id);
  const cards = rewards.length ? rewards.map(r => {
    const pending = STATE.redemptions.find(x => x.rewardId === r.id && x.status === 'pending');
    const pct = Math.min(100, Math.round((child.points / r.pointCost) * 100));
    const canRedeem = child.points >= r.pointCost && !pending;
    return `<div class="reward">
      <div class="remoji">${r.emoji}</div>
      <div class="rtitle">${esc(r.title)}</div>
      <div class="progress"><span style="width:${pct}%"></span></div>
      <div class="rcost">${child.points} / ${r.pointCost} pts</div>
      ${pending ? `<span class="badge-pill wait">⏳ Waiting for approval</span>`
        : canRedeem ? `<button class="btn btn-grass btn-sm btn-block" data-action="redeem" data-reward="${r.id}">Redeem</button>`
        : `<button class="btn btn-ghost btn-sm btn-block" disabled>Not yet</button>`}
    </div>`;
  }).join('') : emptyBlock('🎁', 'No rewards set up yet — ask a parent to add some!');
  return topbarChild(child) + `<div class="wrap">
    <div class="section-head"><h2>Reward shelf</h2><span class="meta">⭐ ${child.points} pts</span></div>
    <div class="reward-grid">${cards}</div>
  </div>` + bottomnavChild(child.id, 'rewards');
}

function renderChildProgress(child) {
  const stats = weeklyStats(child.id);
  const badges = badgesForPoints(child.points);
  const key = `kpi:${child.id}`;
  const cached = aiCache[key];
  let aiBlock = `<button class="btn btn-ai" data-action="ai-kpi-summary" data-child="${child.id}">✨ Get my weekly recap</button>`;
  if (cached) {
    if (cached.loading) aiBlock = `<div class="ai-panel"><div class="lbl"><span class="spinner"></span> Writing your recap…</div></div>`;
    else aiBlock = `<div class="ai-panel"><div class="lbl">✨ ${cached.source === 'ai' ? 'From your AI coach' : 'This week'}</div><p>${esc(cached.text)}</p></div>
      <button class="btn btn-ai" style="margin-top:10px;" data-action="ai-kpi-summary" data-child="${child.id}">↻ Refresh</button>`;
  }
  return topbarChild(child) + `<div class="wrap">
    <div class="section-head"><h2>Your progress</h2></div>
    <div class="stat-bar">
      <div class="stat-chip flame"><div class="n">🔥 ${stats.streak}</div><div class="l">Streak</div></div>
      <div class="stat-chip points"><div class="n">⭐ ${child.points}</div><div class="l">Points</div></div>
      <div class="stat-chip rate"><div class="n">${stats.dueThisWeek ? stats.completionRate + '%' : '—'}</div><div class="l">This week</div></div>
    </div>
    <div class="card">
      <h3 style="font-size:15px; margin-bottom:10px;">Badges earned</h3>
      <div style="font-size:26px; letter-spacing:6px;">${badges.length ? badges.join(' ') : '<span style="font-size:13px; color:var(--ink-soft); letter-spacing:normal;">Keep going — your first badge unlocks at 50 points.</span>'}</div>
    </div>
    ${aiBlock}
  </div>` + bottomnavChild(child.id, 'progress');
}

/* ---------- parent views ---------- */
function renderParentValidate(parentId) {
  const recipient = `parent_${parentId.toLowerCase()}`;
  const pendingC = STATE.completions.filter(c => c.status === 'pending');
  const pendingR = STATE.redemptions.filter(r => r.status === 'pending');

  const cRows = pendingC.length ? pendingC.map(c => {
    const task = STATE.tasks.find(t => t.id === c.taskId);
    const child = getChild(c.childId);
    const deadline = c.markedAtMs + 86400000;
    const remaining = fmtRemaining(deadline);
    const warn = deadline - nowMs() < 3 * 3600000;
    return `<div class="manage-row">
      <span class="avatar sm">${child.avatar}</span>
      <div class="mi"><div class="mt">${task.emoji} ${esc(task.title)}</div><div class="ms">${esc(child.name)} · ${fmtAgo(c.markedAtMs)}</div>
        <div class="countdown ${warn ? 'warn' : ''}">⏱ Auto-approves in ${remaining}</div></div>
      <div class="actions">
        <button class="btn btn-grass btn-sm icon-only" data-action="approve-completion" data-id="${c.id}" data-p="${recipient}" aria-label="Approve">✓</button>
        <button class="btn btn-danger btn-sm icon-only" data-action="reject-completion" data-id="${c.id}" data-p="${recipient}" aria-label="Reject">✕</button>
      </div>
    </div>`;
  }).join('') : emptyBlock('✨', 'Nothing waiting on task approvals.');

  const rRows = pendingR.length ? pendingR.map(r => {
    const reward = STATE.rewards.find(x => x.id === r.rewardId);
    const child = getChild(r.childId);
    return `<div class="manage-row">
      <span class="avatar sm">${child.avatar}</span>
      <div class="mi"><div class="mt">${reward.emoji} ${esc(reward.title)}</div><div class="ms">${esc(child.name)} · ${reward.pointCost} pts · ${fmtAgo(r.requestedAtMs)}</div></div>
      <div class="actions">
        <button class="btn btn-grass btn-sm icon-only" data-action="approve-redemption" data-id="${r.id}" data-p="${recipient}" aria-label="Approve">✓</button>
        <button class="btn btn-danger btn-sm icon-only" data-action="decline-redemption" data-id="${r.id}" data-p="${recipient}" aria-label="Decline">✕</button>
      </div>
    </div>`;
  }).join('') : emptyBlock('🎁', 'No reward requests right now.');

  return topbarParent(parentId, '', 'validate') + `<div class="wrap">
    <div class="section-head"><h2>Task approvals</h2><span class="meta">${pendingC.length} pending</span></div>
    ${cRows}
    <div class="section-head"><h2>Reward requests</h2><span class="meta">${pendingR.length} pending</span></div>
    ${rRows}
  </div>` + bottomnavParent(parentId, 'validate');
}

function childSelectRow(parentId, tab, activeId) {
  return `<div class="child-select">${STATE.children.map(c => `<button class="${c.id === activeId ? 'active' : ''}" data-action="nav" data-href="#/parent/${parentId}/${tab}/${c.id}"><span class="avatar sm">${c.avatar}</span>${esc(c.name)}</button>`).join('')}
    <button data-action="open-add-child" style="border-style:dashed;">+ Add child</button>
  </div>`;
}

function renderParentChildren(parentId, childId) {
  const child = getChild(childId) || STATE.children[0];
  const rows = child ? tasksForChild(child.id).map(t => `<div class="manage-row">
      <div class="ticon" style="width:34px;height:34px;font-size:16px;">${t.emoji}</div>
      <div class="mi"><div class="mt">${esc(t.title)}</div><div class="ms">${recurrenceLabel(t.recurrence)} · +${t.pointValue} pts</div></div>
      <div class="actions">
        <button class="btn btn-ghost btn-sm icon-only" data-action="edit-task" data-id="${t.id}" aria-label="Edit">✎</button>
        <button class="btn btn-ghost btn-sm icon-only" data-action="delete-task" data-id="${t.id}" aria-label="Delete">🗑️</button>
      </div>
    </div>`).join('') : '';
  return topbarParent(parentId, childId, 'children') + `<div class="wrap">
    ${childSelectRow(parentId, 'children', child && child.id)}
    ${child ? `<div class="card" style="margin-top:14px;">
      <div style="display:flex; align-items:center; gap:12px;">
        <span class="avatar">${child.avatar}</span>
        <div><div style="font-family:var(--font-display); font-weight:700; font-size:16px;">${esc(child.name)}</div><div style="font-size:12.5px; color:var(--ink-soft);">Age ${child.age} · ⭐ ${child.points} points</div></div>
      </div>
    </div>` : emptyBlock('🧒', 'Add your first child to get started.')}
    ${child ? `<div class="section-head"><h2>Tasks</h2></div>${rows || emptyBlock('📋', 'No tasks yet.')}
      <button class="btn btn-sky btn-block" style="margin-top:8px;" data-action="open-add-task" data-child="${child.id}">+ Add task</button>` : ''}
  </div>` + bottomnavParent(parentId, 'children', child && child.id);
}

function renderParentRewards(parentId, childId) {
  const child = getChild(childId) || STATE.children[0];
  const rows = child ? rewardsForChild(child.id).map(r => `<div class="manage-row">
      <div class="ticon" style="width:34px;height:34px;font-size:16px; background:var(--coral-soft); color:var(--coral-deep);">${r.emoji}</div>
      <div class="mi"><div class="mt">${esc(r.title)}</div><div class="ms">${r.pointCost} pts</div></div>
      <div class="actions">
        <button class="btn btn-ghost btn-sm icon-only" data-action="edit-reward" data-id="${r.id}" aria-label="Edit">✎</button>
        <button class="btn btn-ghost btn-sm icon-only" data-action="delete-reward" data-id="${r.id}" aria-label="Delete">🗑️</button>
      </div>
    </div>`).join('') : '';
  return topbarParent(parentId, childId, 'rewards') + `<div class="wrap">
    ${childSelectRow(parentId, 'rewards', child && child.id)}
    <div class="section-head"><h2>Reward catalog</h2></div>
    ${rows || emptyBlock('🎁', 'No rewards yet.')}
    ${child ? `<button class="btn btn-sky btn-block" style="margin-top:8px;" data-action="open-add-reward" data-child="${child.id}">+ Add reward</button>` : ''}
  </div>` + bottomnavParent(parentId, 'rewards', child && child.id);
}

function renderParentInsights(parentId, childId) {
  const child = getChild(childId) || STATE.children[0];
  if (!child) return topbarParent(parentId, '', 'insights') + `<div class="wrap">${emptyBlock('📊', 'Add a child to see insights.')}</div>` + bottomnavParent(parentId, 'insights');
  const stats = weeklyStats(child.id);

  const kpiKey = `kpi:${child.id}`, rewardKey = `reward:${child.id}`;
  const kpiCached = aiCache[kpiKey], rewardCached = aiCache[rewardKey];
  let kpiPanel = '';
  if (kpiCached) {
    kpiPanel = kpiCached.loading ? `<div class="ai-panel"><div class="lbl"><span class="spinner"></span> Writing summary…</div></div>`
      : `<div class="ai-panel"><div class="lbl">✨ ${kpiCached.source === 'ai' ? 'AI summary' : 'Summary'}</div><p>${esc(kpiCached.text)}</p></div>`;
  }
  let rewardPanel = '';
  if (rewardCached) {
    if (rewardCached.loading) rewardPanel = `<div class="ai-panel"><div class="lbl"><span class="spinner"></span> Thinking it over…</div></div>`;
    else if (rewardCached.empty) rewardPanel = `<div class="ai-panel"><div class="lbl">✨ Reward suggestion</div><p>Add a reward to this child's catalog first.</p></div>`;
    else {
      const reward = STATE.rewards.find(r => r.id === rewardCached.rewardId);
      rewardPanel = `<div class="ai-panel"><div class="lbl">✨ ${rewardCached.source === 'ai' ? 'AI suggestion' : 'Suggestion'}</div>
        <p><strong>${reward ? reward.emoji + ' ' + esc(reward.title) : ''}</strong> — ${esc(rewardCached.reason)}</p>
        <p style="margin-top:6px; font-size:12.5px; color:var(--ink-soft);">Suggested frequency: ${esc(rewardCached.suggestedFrequency || '—')}</p></div>`;
    }
  }

  return topbarParent(parentId, childId, 'insights') + `<div class="wrap">
    ${childSelectRow(parentId, 'insights', child.id)}
    <div class="stat-bar">
      <div class="stat-chip flame"><div class="n">🔥 ${stats.streak}</div><div class="l">Streak</div></div>
      <div class="stat-chip points"><div class="n">⭐ ${child.points}</div><div class="l">Points</div></div>
      <div class="stat-chip rate"><div class="n">${stats.dueThisWeek ? stats.completionRate + '%' : '—'}</div><div class="l">This week</div></div>
    </div>
    <div style="display:flex; gap:10px; flex-wrap:wrap;">
      <button class="btn btn-ai" data-action="ai-kpi-summary" data-child="${child.id}">✨ Get KPI summary</button>
      <button class="btn btn-ai" data-action="ai-recommend-reward" data-child="${child.id}">✨ Suggest a reward</button>
    </div>
    ${kpiPanel}${rewardPanel}
  </div>` + bottomnavParent(parentId, 'insights', child.id);
}

/* ---------- modals ---------- */
function modalSettings() {
  const key = AI.getApiKey();
  return `<div class="modal" onclick="event.stopPropagation()">
    <h3>⚙️ Settings</h3>
    <form id="form-settings">
      <div class="field"><label for="openai-key">OpenAI API key (optional)</label>
        <input type="password" id="openai-key" placeholder="sk-..." value="${key ? esc(key) : ''}">
        <p class="hint">Stored only in this browser's local storage and sent directly to OpenAI. Leave blank to use the built-in rule-based suggestions instead.</p>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-action="clear-key">Clear key</button>
        <button type="submit" class="btn btn-grass">Save</button>
      </div>
    </form>
    <hr style="border:none; border-top:2px solid var(--line); margin:20px 0;">
    <h3 style="font-size:15px;">Demo controls</h3>
    <p class="hint" style="margin-bottom:10px;">Today in the app: <strong>${todayStr()}</strong></p>
    <div class="modal-actions">
      <button class="btn btn-sky" data-action="advance-day">⏩ Advance to next day</button>
      <button class="btn btn-danger" data-action="reset-demo">♻️ Reset demo data</button>
    </div>
    <button class="btn btn-ghost btn-block" style="margin-top:14px;" data-action="close-modal">Close</button>
  </div>`;
}

function renderStarterChecklist(result) {
  window.__starterTasks = result.tasks;
  const items = result.tasks.map((t, i) => `<label style="display:flex; align-items:center; gap:8px; padding:8px 0; font-size:14px;">
    <input type="checkbox" data-starter-idx="${i}" checked style="width:18px; height:18px;">
    ${t.emoji} ${esc(t.title)} <span style="margin-left:auto; color:var(--ink-soft); font-size:12px;">${recurrenceLabel(t.recurrence)} · +${t.pointValue}</span>
  </label>`).join('');
  return `<div class="ai-panel"><div class="lbl">✨ ${result.source === 'ai' ? 'AI suggested' : 'Suggested (offline default)'}</div>${items}</div>`;
}

function modalAddChild() {
  return `<div class="modal" onclick="event.stopPropagation()">
    <h3>Add a child</h3>
    <form id="form-add-child">
      <div class="field"><label for="add-child-name">Name</label><input type="text" id="add-child-name" required maxlength="20"></div>
      <div class="field"><label for="add-child-age">Age</label><input type="number" id="add-child-age" required min="6" max="16" value="8"></div>
      <button type="button" class="btn btn-ai" data-action="ai-suggest-tasks">✨ Suggest starter tasks</button>
      <div id="starter-suggest-area"></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button>
        <button type="submit" class="btn btn-grass">Create child</button>
      </div>
    </form>
  </div>`;
}

function modalTaskForm(childId, task) {
  const rec = task ? task.recurrence.type : 'daily';
  const weekday = task && task.recurrence.type === 'weekly' ? task.recurrence.weekday : 0;
  const emoji = task ? task.emoji : EMOJI_CHOICES[0];
  return `<div class="modal" onclick="event.stopPropagation()">
    <h3>${task ? 'Edit task' : 'Add task'}</h3>
    <form id="form-task">
      <input type="hidden" id="task-id" value="${task ? task.id : ''}">
      <input type="hidden" id="task-child" value="${childId}">
      <div class="field"><label for="task-title">Task name</label><input type="text" id="task-title" required maxlength="28" value="${task ? esc(task.title) : ''}"></div>
      <div class="field"><label>Icon</label><div class="emoji-row" id="task-emoji-row">
        ${EMOJI_CHOICES.map(e => `<button type="button" class="${e === emoji ? 'sel' : ''}" data-pick-emoji="${e}">${e}</button>`).join('')}
      </div><input type="hidden" id="task-emoji" value="${emoji}"></div>
      <div class="field"><label>Repeats</label><div class="choice-row" id="task-recurrence-row">
        ${['daily', 'weekdays', 'weekly', 'oneoff'].map(r => `<button type="button" class="${r === rec ? 'sel' : ''}" data-pick-rec="${r}">${{ daily: 'Daily', weekdays: 'Weekdays', weekly: 'Weekly', oneoff: 'One-off' }[r]}</button>`).join('')}
      </div><input type="hidden" id="task-rec-type" value="${rec}"></div>
      <div class="field" id="task-weekday-field" style="display:${rec === 'weekly' ? 'block' : 'none'};"><label>Which day</label><div class="choice-row" id="task-weekday-row">
        ${WEEKDAYS.map((w, i) => `<button type="button" class="${i === weekday ? 'sel' : ''}" data-pick-weekday="${i}">${w.slice(0, 3)}</button>`).join('')}
      </div><input type="hidden" id="task-weekday" value="${weekday}"></div>
      <div class="field" id="task-date-field" style="display:${rec === 'oneoff' ? 'block' : 'none'};"><label for="task-date">Date</label><input type="date" id="task-date" value="${task && task.recurrence.date ? task.recurrence.date : todayStr()}"></div>
      <div class="field"><label for="task-points">Points earned</label><input type="number" id="task-points" min="5" max="50" value="${task ? task.pointValue : 10}"></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button>
        <button type="submit" class="btn btn-grass">${task ? 'Save changes' : 'Add task'}</button>
      </div>
    </form>
  </div>`;
}

function modalRewardForm(childId, reward) {
  const emoji = reward ? reward.emoji : REWARD_EMOJI_CHOICES[0];
  return `<div class="modal" onclick="event.stopPropagation()">
    <h3>${reward ? 'Edit reward' : 'Add reward'}</h3>
    <form id="form-reward">
      <input type="hidden" id="reward-id" value="${reward ? reward.id : ''}">
      <input type="hidden" id="reward-child" value="${childId}">
      <div class="field"><label for="reward-title">Reward name</label><input type="text" id="reward-title" required maxlength="28" value="${reward ? esc(reward.title) : ''}"></div>
      <div class="field"><label>Icon</label><div class="emoji-row" id="reward-emoji-row">
        ${REWARD_EMOJI_CHOICES.map(e => `<button type="button" class="${e === emoji ? 'sel' : ''}" data-pick-emoji="${e}">${e}</button>`).join('')}
      </div><input type="hidden" id="reward-emoji" value="${emoji}"></div>
      <div class="field"><label for="reward-cost">Point cost</label><input type="number" id="reward-cost" min="10" max="1000" step="10" value="${reward ? reward.pointCost : 60}"></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button>
        <button type="submit" class="btn btn-grass">${reward ? 'Save changes' : 'Add reward'}</button>
      </div>
    </form>
  </div>`;
}

function modalConfirmRedeem(reward) {
  return `<div class="modal" onclick="event.stopPropagation()">
    <h3>${reward.emoji} Redeem ${esc(reward.title)}?</h3>
    <p style="color:var(--ink-soft); margin-bottom:16px;">This will send a request to your parents for approval and hold ${reward.pointCost} points.</p>
    <div class="modal-actions">
      <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
      <button class="btn btn-primary" data-action="confirm-redeem" data-reward="${reward.id}">Send request</button>
    </div>
  </div>`;
}

/* ---------- router / render ---------- */
function parseRoute() { return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean); }

function render() {
  checkAutoApprovals();
  const parts = parseRoute();
  const app = document.getElementById('app');
  let html;
  if (parts[0] === 'child' && parts[1]) {
    const child = getChild(parts[1]);
    if (!child) { location.hash = '#/'; return; }
    const tab = parts[2] || 'tasks';
    if (tab === 'rewards') html = renderChildRewards(child);
    else if (tab === 'progress') html = renderChildProgress(child);
    else html = renderChildTasks(child);
  } else if (parts[0] === 'parent') {
    const parentId = parts[1] === 'B' ? 'B' : 'A';
    const tab = parts[2] || 'validate';
    const childId = parts[3];
    if (tab === 'children') html = renderParentChildren(parentId, childId);
    else if (tab === 'rewards') html = renderParentRewards(parentId, childId);
    else if (tab === 'insights') html = renderParentInsights(parentId, childId);
    else html = renderParentValidate(parentId);
    html += notifPanelHtml(parentId);
  } else {
    html = renderPicker();
  }
  app.innerHTML = html;
}

/* ---------- event wiring ---------- */
function currentParentId() { const p = parseRoute(); return p[0] === 'parent' && p[1] === 'B' ? 'B' : 'A'; }

function wireEmojiPicker(rowId, hiddenId) {
  document.getElementById(rowId).querySelectorAll('[data-pick-emoji]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById(rowId).querySelectorAll('button').forEach(b => b.classList.remove('sel'));
      btn.classList.add('sel');
      document.getElementById(hiddenId).value = btn.dataset.pickEmoji;
    });
  });
}

document.addEventListener('click', async (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;

  if (action === 'nav') { location.hash = target.dataset.href; return; }
  if (action === 'switch-profile') { location.hash = '#/'; return; }

  if (action === 'complete-task') { spawnConfetti(e.clientX, e.clientY); markTaskDone(target.dataset.task); return; }

  if (action === 'redeem') {
    const reward = STATE.rewards.find(r => r.id === target.dataset.reward);
    openModal(modalConfirmRedeem(reward));
    return;
  }
  if (action === 'confirm-redeem') { requestRedemption(target.dataset.reward); closeModal(); return; }

  if (action === 'approve-completion') { approveCompletion(target.dataset.id, target.dataset.p); render(); return; }
  if (action === 'reject-completion') { rejectCompletion(target.dataset.id, target.dataset.p); render(); return; }
  if (action === 'approve-redemption') { approveRedemption(target.dataset.id, target.dataset.p); render(); return; }
  if (action === 'decline-redemption') { declineRedemption(target.dataset.id, target.dataset.p); render(); return; }

  if (action === 'set-parent') { location.hash = `#/parent/${target.dataset.p}/${target.dataset.tab}${target.dataset.child ? '/' + target.dataset.child : ''}`; return; }

  if (action === 'open-notifs') { notifOpen = true; render(); return; }
  if (action === 'close-notifs') { notifOpen = false; render(); return; }
  if (action === 'mark-all-read') {
    const recipient = `parent_${target.dataset.p.toLowerCase()}`;
    STATE.notifications.forEach(n => { if (n.recipient === recipient) n.read = true; });
    saveState(); render(); return;
  }

  if (action === 'open-settings') { openModal(modalSettings()); return; }
  if (action === 'close-modal' || action === 'close-modal-backdrop') { if (e.target === target) closeModal(); return; }
  if (action === 'clear-key') { AI.setApiKey(''); document.getElementById('openai-key').value = ''; showToast('API key cleared.'); return; }
  if (action === 'advance-day') { closeModal(); advanceOneDay(); return; }
  if (action === 'reset-demo') { if (confirm('Reset all demo data back to the starting sample? This cannot be undone.')) { closeModal(); resetDemo(); } return; }

  if (action === 'open-add-child') { openModal(modalAddChild()); return; }
  if (action === 'open-add-task') { openModal(modalTaskForm(target.dataset.child)); wireEmojiPicker('task-emoji-row', 'task-emoji'); wireRecurrencePicker(); return; }
  if (action === 'edit-task') {
    const task = STATE.tasks.find(t => t.id === target.dataset.id);
    openModal(modalTaskForm(task.childId, task)); wireEmojiPicker('task-emoji-row', 'task-emoji'); wireRecurrencePicker();
    return;
  }
  if (action === 'delete-task') { if (confirm('Remove this task?')) { removeTask(target.dataset.id); render(); } return; }

  if (action === 'open-add-reward') { openModal(modalRewardForm(target.dataset.child)); wireEmojiPicker('reward-emoji-row', 'reward-emoji'); return; }
  if (action === 'edit-reward') {
    const reward = STATE.rewards.find(r => r.id === target.dataset.id);
    openModal(modalRewardForm(reward.childId, reward)); wireEmojiPicker('reward-emoji-row', 'reward-emoji');
    return;
  }
  if (action === 'delete-reward') { if (confirm('Remove this reward?')) { removeReward(target.dataset.id); render(); } return; }

  if (action === 'ai-suggest-tasks') {
    const name = document.getElementById('add-child-name').value.trim() || 'your child';
    const age = Number(document.getElementById('add-child-age').value) || 8;
    const area = document.getElementById('starter-suggest-area');
    area.innerHTML = `<div class="ai-panel"><div class="lbl"><span class="spinner"></span> Thinking of a starter list…</div></div>`;
    const result = await AI.suggestStarterTasks(name, age);
    area.innerHTML = renderStarterChecklist(result);
    return;
  }

  if (action === 'ai-kpi-summary') {
    const childId = target.dataset.child;
    const child = getChild(childId);
    aiCache[`kpi:${childId}`] = { loading: true };
    render();
    const stats = weeklyStats(childId);
    const result = await AI.kpiSummary(child, stats);
    aiCache[`kpi:${childId}`] = { loading: false, ...result };
    render();
    return;
  }
  if (action === 'ai-recommend-reward') {
    const childId = target.dataset.child;
    const child = getChild(childId);
    const rewards = rewardsForChild(childId);
    aiCache[`reward:${childId}`] = { loading: true };
    render();
    const stats = weeklyStats(childId);
    if (!rewards.length) { aiCache[`reward:${childId}`] = { loading: false, empty: true }; render(); return; }
    const result = await AI.recommendReward(child, rewards, stats);
    aiCache[`reward:${childId}`] = { loading: false, ...result };
    render();
    return;
  }
});

function wireRecurrencePicker() {
  document.getElementById('task-recurrence-row').querySelectorAll('[data-pick-rec]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('task-recurrence-row').querySelectorAll('button').forEach(b => b.classList.remove('sel'));
      btn.classList.add('sel');
      const val = btn.dataset.pickRec;
      document.getElementById('task-rec-type').value = val;
      document.getElementById('task-weekday-field').style.display = val === 'weekly' ? 'block' : 'none';
      document.getElementById('task-date-field').style.display = val === 'oneoff' ? 'block' : 'none';
    });
  });
  const wdRow = document.getElementById('task-weekday-row');
  if (wdRow) wdRow.querySelectorAll('[data-pick-weekday]').forEach(btn => {
    btn.addEventListener('click', () => {
      wdRow.querySelectorAll('button').forEach(b => b.classList.remove('sel'));
      btn.classList.add('sel');
      document.getElementById('task-weekday').value = btn.dataset.pickWeekday;
    });
  });
}

document.addEventListener('submit', (e) => {
  if (e.target.id === 'form-settings') {
    e.preventDefault();
    AI.setApiKey(document.getElementById('openai-key').value.trim());
    showToast('Settings saved.');
    closeModal();
    return;
  }
  if (e.target.id === 'form-add-child') {
    e.preventDefault();
    const name = document.getElementById('add-child-name').value.trim();
    const age = Number(document.getElementById('add-child-age').value);
    if (!name) return;
    const id = addChild(name, age);
    const checks = document.querySelectorAll('[data-starter-idx]:checked');
    checks.forEach(chk => {
      const t = (window.__starterTasks || [])[Number(chk.dataset.starterIdx)];
      if (t) addTask(id, { title: t.title, emoji: t.emoji, recurrence: t.recurrence, pointValue: t.pointValue });
    });
    window.__starterTasks = null;
    closeModal();
    location.hash = `#/parent/${currentParentId()}/children/${id}`;
    render();
    showToast(`${name} was added!`);
    return;
  }
  if (e.target.id === 'form-task') {
    e.preventDefault();
    const id = document.getElementById('task-id').value;
    const childId = document.getElementById('task-child').value;
    const title = document.getElementById('task-title').value.trim();
    if (!title) return;
    const recType = document.getElementById('task-rec-type').value;
    const recurrence = recType === 'weekly' ? { type: 'weekly', weekday: Number(document.getElementById('task-weekday').value) }
      : recType === 'oneoff' ? { type: 'oneoff', date: document.getElementById('task-date').value }
      : { type: recType };
    const data = { title, emoji: document.getElementById('task-emoji').value, recurrence, pointValue: Number(document.getElementById('task-points').value) || 10 };
    if (id) updateTask(id, data); else addTask(childId, data);
    closeModal(); render();
    showToast(id ? 'Task updated.' : 'Task added.');
    return;
  }
  if (e.target.id === 'form-reward') {
    e.preventDefault();
    const id = document.getElementById('reward-id').value;
    const childId = document.getElementById('reward-child').value;
    const title = document.getElementById('reward-title').value.trim();
    if (!title) return;
    const data = { title, emoji: document.getElementById('reward-emoji').value, pointCost: Number(document.getElementById('reward-cost').value) || 50 };
    if (id) updateReward(id, data); else addReward(childId, data);
    closeModal(); render();
    showToast(id ? 'Reward updated.' : 'Reward added.');
    return;
  }
});

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', () => {
  initApp();
  if (!location.hash) location.hash = '#/';
  render();
});
