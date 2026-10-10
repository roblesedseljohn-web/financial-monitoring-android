'use strict';

const app = document.getElementById('app');
const nav = document.getElementById('nav');
const menuButton = document.getElementById('menuButton');
const toastEl = document.getElementById('toast');

let snapshot = { paycards: [], freelance: [], receivables: [], generalExpenses: [], history: [], movements: [] };
let currentView = 'overview';
let detail = null;
let overviewMonth = localMonthKey();
let overviewYear = new Date().getFullYear();

function localDateKey(d = new Date()) {
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
function localMonthKey() { return localDateKey().slice(0, 7); }
function n(v) { const x = Number(v); return Number.isFinite(x) ? x : 0; }
function money(v) { return '₱' + n(v).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function h(v) { return String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }
function humanDate(s) { if (!s) return '—'; const d = new Date(`${s}T00:00:00`); return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }); }
function humanDateTime(s) { if (!s) return '—'; const d = new Date(s); return isNaN(d) ? s : d.toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); }
function monthLabel(k) { const d = new Date(`${k}-01T00:00:00`); return d.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }); }
function sum(arr, fn) { return arr.reduce((a, x) => a + n(fn(x)), 0); }
function byId(list, id) { return list.find(x => Number(x.id) === Number(id)); }
function monthOf(date) { return String(date || '').slice(0, 7); }
function yearOf(date) { return Number(String(date || '').slice(0, 4)); }
function isOverdue(date, remaining) { return !!date && remaining > 0 && date < localDateKey(); }
function isPaydayReceived(paycard) { return !!paycard?.paydayDate && paycard.paydayDate <= localDateKey(); }
function toast(msg) { toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => toastEl.hidden = true, 2200); }

function expenseStatus(amountDue, amountPaid) {
  const due = n(amountDue), paid = n(amountPaid);
  if (paid <= 0 && due > 0) return { text: `Unpaid • ${money(due)} remaining`, cls: 'remaining' };
  if (paid < due) return { text: `${money(due - paid)} remaining`, cls: 'remaining' };
  if (paid > due) return { text: `Paid • ${money(paid - due)} over`, cls: 'overpaid' };
  return { text: 'Paid', cls: 'paid' };
}

const NativeAdapter = {
  snapshot() { return JSON.parse(Android.getSnapshot()); },
  createPaycard(o) { return Number(Android.createPaycard(JSON.stringify(o))); },
  updatePaycard(id, o) { return Android.updatePaycard(Number(id), JSON.stringify(o)); },
  deletePaycard(id) { return Android.deletePaycard(Number(id)); },
  updateExpensePayment(id, a) { return Android.updateExpensePayment(Number(id), Number(a)); },
  createFreelance(o) { return Number(Android.createFreelance(JSON.stringify(o))); },
  updateFreelance(id, o) { return Android.updateFreelance(Number(id), JSON.stringify(o)); },
  deleteFreelance(id) { return Android.deleteFreelance(Number(id)); },
  updateFreelanceExpensePayment(id, a) { return Android.updateFreelanceExpensePayment(Number(id), Number(a)); },
  createReceivable(o) { return Number(Android.createReceivable(JSON.stringify(o))); },
  updateReceivable(id, o) { return Android.updateReceivable(Number(id), JSON.stringify(o)); },
  deleteReceivable(id) { return Android.deleteReceivable(Number(id)); },
  createGeneralExpense(o) { return Number(Android.createGeneralExpense(JSON.stringify(o))); },
  updateGeneralExpense(id, o) { return Android.updateGeneralExpense(Number(id), JSON.stringify(o)); },
  deleteGeneralExpense(id) { return Android.deleteGeneralExpense(Number(id)); }
};

function makeMock() {
  const key = 'financial-monitoring-browser-preview-v2';
  let s; try { s = JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { s = null; }
  if (!s) s = { paycards: [], freelance: [], receivables: [], generalExpenses: [], history: [], movements: [] };
  if (!s.generalExpenses) s.generalExpenses = [];
  if (!s.movements) s.movements = [];
  const save = () => localStorage.setItem(key, JSON.stringify(s));
  const next = a => a.reduce((m, x) => Math.max(m, n(x.id)), 0) + 1;
  const hist = (type, id, action, summary, details = {}) => s.history.unshift({ id: next(s.history), entityType: type, entityId: id, action, summary, details, createdAt: new Date().toISOString() });
  const move = (kind, sourceType, sourceId, parentType, parentId, amount, note) => {
    if (Math.abs(amount) < 0.000001) return;
    s.movements.unshift({ id: next(s.movements), kind, sourceType, sourceId, parentType, parentId, amount, movementDate: localDateKey(), note, createdAt: new Date().toISOString() });
  };
  const removeMoves = (pred) => { s.movements = s.movements.filter(x => !pred(x)); };
  return {
    snapshot() { return JSON.parse(JSON.stringify(s)); },
    createPaycard(o) {
      const id = next(s.paycards); let ei = 1;
      const expenses = (o.expenses || []).map(e => ({ ...e, id: Date.now() + ei++, amountPaid: n(e.amountPaid) }));
      s.paycards.push({ ...o, id, expenses, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      expenses.forEach(e => { if (n(e.amountPaid) > 0) move('expense_payment', 'payday_expense', e.id, 'payday', id, -n(e.amountPaid), `Initial payment for ${e.name}`); });
      hist('payday', id, 'created', 'Payday card created', s.paycards[s.paycards.length - 1]); save(); return id;
    },
    updatePaycard(id, o) {
      const i = s.paycards.findIndex(x => x.id == id); if (i < 0) return false;
      const before = JSON.parse(JSON.stringify(s.paycards[i])); const old = new Map((before.expenses || []).map(e => [Number(e.id), e]));
      const incomingIds = new Set((o.expenses || []).map(e => Number(e.id)).filter(Boolean));
      before.expenses.filter(e => !incomingIds.has(Number(e.id))).forEach(e => removeMoves(m => m.sourceType === 'payday_expense' && Number(m.sourceId) === Number(e.id)));
      s.paycards[i] = { ...before, ...o, expenses: (o.expenses || []).map((e, j) => { const prev = old.get(Number(e.id)); return { ...e, id: e.id || Date.now() + j, amountPaid: prev ? n(prev.amountPaid) : n(e.amountPaid) }; }), updatedAt: new Date().toISOString() };
      hist('payday', id, 'edited', 'Payday card edited', { before, after: s.paycards[i] }); save(); return true;
    },
    deletePaycard(id) { const x = byId(s.paycards, id); if (!x) return false; hist('payday', id, 'deleted', 'Payday card deleted', x); removeMoves(m => m.parentType === 'payday' && Number(m.parentId) === Number(id)); s.paycards = s.paycards.filter(x => x.id != id); save(); return true; },
    updateExpensePayment(id, a) {
      for (const p of s.paycards) {
        const e = byId(p.expenses || [], id); if (!e) continue;
        const before = n(e.amountPaid), after = Math.max(0, n(a)); e.amountPaid = after;
        const delta = after - before; move('expense_payment', 'payday_expense', e.id, 'payday', p.id, -delta, `${delta >= 0 ? 'Payment' : 'Payment correction'} for ${e.name}`);
        hist('payday', p.id, 'payment', `Payment updated for ${e.name}`, { expense: e.name, before, after, delta, date: localDateKey() }); save(); return true;
      } return false;
    },
    createFreelance(o) {
      const id = next(s.freelance); let ei = 1;
      const expenses = (o.expenses || []).map(e => ({ ...e, id: Date.now() + ei++, amountPaid: n(e.amountPaid) }));
      s.freelance.push({ ...o, id, expenses, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      expenses.forEach(e => { if (n(e.amountPaid) > 0) move('expense_payment', 'freelance_expense', e.id, 'freelance', id, -n(e.amountPaid), `Initial payment for ${e.name}`); });
      hist('freelance', id, 'created', 'Freelance income created', s.freelance[s.freelance.length - 1]); save(); return id;
    },
    updateFreelance(id, o) {
      const i = s.freelance.findIndex(x => x.id == id); if (i < 0) return false;
      const before = JSON.parse(JSON.stringify(s.freelance[i])); const old = new Map((before.expenses || []).map(e => [Number(e.id), e]));
      const incomingIds = new Set((o.expenses || []).map(e => Number(e.id)).filter(Boolean));
      before.expenses.filter(e => !incomingIds.has(Number(e.id))).forEach(e => removeMoves(m => m.sourceType === 'freelance_expense' && Number(m.sourceId) === Number(e.id)));
      s.freelance[i] = { ...before, ...o, expenses: (o.expenses || []).map((e, j) => { const prev = old.get(Number(e.id)); return { ...e, id: e.id || Date.now() + j, amountPaid: prev ? n(prev.amountPaid) : n(e.amountPaid) }; }), updatedAt: new Date().toISOString() };
      hist('freelance', id, 'edited', 'Freelance income edited', { before, after: s.freelance[i] }); save(); return true;
    },
    deleteFreelance(id) { const x = byId(s.freelance, id); if (!x) return false; hist('freelance', id, 'deleted', 'Freelance income deleted', x); removeMoves(m => m.parentType === 'freelance' && Number(m.parentId) === Number(id)); s.freelance = s.freelance.filter(x => x.id != id); save(); return true; },
    updateFreelanceExpensePayment(id, a) {
      for (const p of s.freelance) {
        const e = byId(p.expenses || [], id); if (!e) continue;
        const before = n(e.amountPaid), after = Math.max(0, n(a)); e.amountPaid = after;
        const delta = after - before; move('expense_payment', 'freelance_expense', e.id, 'freelance', p.id, -delta, `${delta >= 0 ? 'Payment' : 'Payment correction'} for ${e.name}`);
        hist('freelance', p.id, 'payment', `Freelance expense payment updated for ${e.name}`, { expense: e.name, before, after, delta, date: localDateKey() }); save(); return true;
      } return false;
    },
    createReceivable(o) {
      const id = next(s.receivables); const r = { ...o, id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; s.receivables.push(r);
      if (n(o.amountReceived) > 0) move('receivable_repayment', 'receivable', id, 'receivable', id, n(o.amountReceived), `Initial repayment from ${o.personName}`);
      hist('receivable', id, 'created', 'Money owed to me entry created', r); save(); return id;
    },
    updateReceivable(id, o) {
      const i = s.receivables.findIndex(x => x.id == id); if (i < 0) return false;
      const before = JSON.parse(JSON.stringify(s.receivables[i])); s.receivables[i] = { ...before, ...o, updatedAt: new Date().toISOString() };
      if (n(before.amountReceived) !== n(o.amountReceived)) { const delta = n(o.amountReceived) - n(before.amountReceived); move('receivable_repayment', 'receivable', id, 'receivable', id, delta, `${delta >= 0 ? 'Repayment' : 'Repayment correction'} from ${o.personName}`); hist('receivable', id, 'payment', `Repayment updated for ${o.personName}`, { before: n(before.amountReceived), after: n(o.amountReceived), delta, date: localDateKey() }); }
      hist('receivable', id, 'edited', 'Money owed to me entry edited', { before, after: s.receivables[i] }); save(); return true;
    },
    deleteReceivable(id) { const x = byId(s.receivables, id); if (!x) return false; hist('receivable', id, 'deleted', 'Money owed to me entry deleted', x); removeMoves(m => m.parentType === 'receivable' && Number(m.parentId) === Number(id)); s.receivables = s.receivables.filter(x => x.id != id); save(); return true; },
    createGeneralExpense(o) {
      const id = next(s.generalExpenses); const x = { ...o, id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      s.generalExpenses.push(x); move('general_expense', 'general_expense', id, 'general_expense', id, -n(o.amount), `General expense: ${o.name}`);
      const m = s.movements[0]; if (m) m.movementDate = o.expenseDate || localDateKey();
      hist('general_expense', id, 'created', 'General expense created', x); save(); return id;
    },
    updateGeneralExpense(id, o) {
      const i = s.generalExpenses.findIndex(x => x.id == id); if (i < 0) return false;
      const before = JSON.parse(JSON.stringify(s.generalExpenses[i])); s.generalExpenses[i] = { ...before, ...o, updatedAt: new Date().toISOString() };
      removeMoves(m => m.sourceType === 'general_expense' && Number(m.sourceId) === Number(id));
      move('general_expense', 'general_expense', id, 'general_expense', id, -n(o.amount), `General expense: ${o.name}`);
      const m = s.movements[0]; if (m) m.movementDate = o.expenseDate || localDateKey();
      hist('general_expense', id, 'edited', 'General expense edited', { before, after: s.generalExpenses[i] }); save(); return true;
    },
    deleteGeneralExpense(id) {
      const x = byId(s.generalExpenses, id); if (!x) return false;
      hist('general_expense', id, 'deleted', 'General expense deleted', x);
      removeMoves(m => m.sourceType === 'general_expense' && Number(m.sourceId) === Number(id));
      s.generalExpenses = s.generalExpenses.filter(x => x.id != id); save(); return true;
    }
  };
}

const DB = (typeof Android !== 'undefined' && Android.getSnapshot) ? NativeAdapter : makeMock();

function refresh() { snapshot = DB.snapshot(); if (!snapshot.generalExpenses) snapshot.generalExpenses = []; if (!snapshot.movements) snapshot.movements = []; render(); }
function showView(view) { currentView = view; detail = null; nav.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.view === view)); nav.classList.remove('open'); render(); window.scrollTo(0, 0); }
nav.addEventListener('click', e => { const b = e.target.closest('button[data-view]'); if (b) showView(b.dataset.view); });
menuButton.addEventListener('click', () => nav.classList.toggle('open'));

window.handleAndroidBack = () => {
  if (detail) {
    if (detail.type.startsWith('payday')) { detail = null; currentView = 'payday'; }
    else if (detail.type.startsWith('freelance')) { detail = null; currentView = 'freelance'; }
    else if (detail.type.startsWith('generalExpense')) { detail = null; currentView = 'generalExpenses'; }
    else { detail = null; currentView = 'receivables'; }
    render(); window.scrollTo(0, 0); return true;
  }
  if (currentView !== 'overview') { showView('overview'); return true; }
  return false;
};

function render() {
  nav.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.view === currentView && !detail));
  if (detail?.type === 'payday') return renderPaydayDetail(detail.id);
  if (detail?.type === 'freelance') return renderFreelanceDetail(detail.id);
  if (detail?.type === 'paydayForm') return renderPaydayForm(detail.id || null);
  if (detail?.type === 'freelanceForm') return renderFreelanceForm(detail.id || null);
  if (detail?.type === 'receivableForm') return renderReceivableForm(detail.id || null);
  if (detail?.type === 'generalExpenseForm') return renderGeneralExpenseForm(detail.id || null);
  if (currentView === 'payday') return renderPaydayDashboard();
  if (currentView === 'freelance') return renderFreelanceDashboard();
  if (currentView === 'generalExpenses') return renderGeneralExpenses();
  if (currentView === 'receivables') return renderReceivables();
  if (currentView === 'history') return renderHistory();
  renderOverview();
}

function movementTotal({ month = null, year = null, kind = null } = {}) {
  return sum(snapshot.movements.filter(m => {
    if (kind && m.kind !== kind) return false;
    if (month && monthOf(m.movementDate) !== month) return false;
    if (year && yearOf(m.movementDate) !== Number(year)) return false;
    return true;
  }), m => m.amount);
}
function currentOpenBills() {
  return sum(snapshot.paycards, p => sum(p.expenses || [], e => Math.max(n(e.amountDue) - n(e.amountPaid), 0))) +
         sum(snapshot.freelance, f => sum(f.expenses || [], e => Math.max(n(e.amountDue) - n(e.amountPaid), 0)));
}
function currentOutstandingReceivables() { return sum(snapshot.receivables, r => Math.max(n(r.amountOwed) - n(r.amountReceived), 0)); }
function trackedAvailable() {
  return sum(snapshot.paycards.filter(isPaydayReceived), p => p.netPay) + sum(snapshot.freelance, f => f.amountReceived) + movementTotal();
}

function spendingTotal({ month = null, year = null } = {}) {
  return -sum(snapshot.movements.filter(m => {
    if (!['expense_payment', 'general_expense'].includes(m.kind)) return false;
    if (month && monthOf(m.movementDate) !== month) return false;
    if (year && yearOf(m.movementDate) !== Number(year)) return false;
    return true;
  }), m => m.amount);
}

function periodStats(monthKey) {
  const salary = sum(snapshot.paycards.filter(x => isPaydayReceived(x) && monthOf(x.paydayDate) === monthKey), x => x.netPay);
  const freelance = sum(snapshot.freelance.filter(x => monthOf(x.incomeDate) === monthKey), x => x.amountReceived);
  const repayment = movementTotal({ month: monthKey, kind: 'receivable_repayment' });
  const spending = spendingTotal({ month: monthKey });
  const income = salary + freelance + repayment;
  return { salary, freelance, repayment, spending, income, net: income - spending };
}

function yearStats(year) {
  const salary = sum(snapshot.paycards.filter(x => isPaydayReceived(x) && yearOf(x.paydayDate) === Number(year)), x => x.netPay);
  const freelance = sum(snapshot.freelance.filter(x => yearOf(x.incomeDate) === Number(year)), x => x.amountReceived);
  const repayment = movementTotal({ year, kind: 'receivable_repayment' });
  const spending = spendingTotal({ year });
  const income = salary + freelance + repayment;
  return { salary, freelance, repayment, spending, income, net: income - spending };
}

function renderOverview() {
  const m = periodStats(overviewMonth);
  const y = yearStats(overviewYear);
  const rows = [];
  for (let month = 1; month <= 12; month++) {
    const k = `${overviewYear}-${String(month).padStart(2, '0')}`;
    rows.push({ k, ...periodStats(k) });
  }
  app.innerHTML = `
    <section class="hero"><div class="hero-row"><div><div class="eyebrow">YOUR MONEY AT A GLANCE</div><h2>Overview</h2><div class="muted small">Only money actually received or paid changes your tracked cash. Future payday cards are excluded until their payday date arrives. Money still owed to you and unpaid bills stay separate.</div></div></div></section>
    <section class="summary-grid four">
      <article class="summary-card accent-card"><span>Tracked money available</span><strong class="${trackedAvailable() < 0 ? 'negative' : 'positive'}">${money(trackedAvailable())}</strong><small>Received income − actual payments; future salary excluded</small></article>
      <article class="summary-card"><span>Unpaid bills / expenses</span><strong class="negative">${money(currentOpenBills())}</strong><small>Pending obligations</small></article>
      <article class="summary-card"><span>Money owed to you</span><strong>${money(currentOutstandingReceivables())}</strong><small>Not counted until received</small></article>
      <article class="summary-card"><span>History entries</span><strong>${snapshot.history.length}</strong><small>Tracked changes</small></article>
    </section>
    <section class="panel"><div class="filter-row"><label class="field"><span>Month</span><input id="overviewMonth" type="month" value="${h(overviewMonth)}"></label><button class="button secondary" onclick="applyOverviewMonth()">View month</button><label class="field"><span>Year</span><input id="overviewYear" type="number" min="2000" max="2100" value="${overviewYear}"></label><button class="button secondary" onclick="applyOverviewYear()">View year</button></div></section>
    <div class="section-head"><div><div class="eyebrow">MONTHLY</div><h2>${h(monthLabel(overviewMonth))}</h2></div></div>
    <section class="summary-grid six">
      <article class="summary-card"><span>Salary received</span><strong>${money(m.salary)}</strong></article>
      <article class="summary-card"><span>Freelance received</span><strong>${money(m.freelance)}</strong></article>
      <article class="summary-card"><span>Repayments received</span><strong>${money(m.repayment)}</strong></article>
      <article class="summary-card"><span>Total cash in</span><strong>${money(m.income)}</strong></article>
      <article class="summary-card"><span>Actual spending</span><strong>${money(m.spending)}</strong></article>
      <article class="summary-card"><span>Month net</span><strong class="${m.net < 0 ? 'negative' : 'positive'}">${money(m.net)}</strong></article>
    </section>
    <div class="section-head"><div><div class="eyebrow">YEARLY</div><h2>${overviewYear} Summary</h2></div></div>
    <section class="summary-grid six">
      <article class="summary-card"><span>Total salary</span><strong>${money(y.salary)}</strong></article>
      <article class="summary-card"><span>Total freelance</span><strong>${money(y.freelance)}</strong></article>
      <article class="summary-card"><span>Repayments</span><strong>${money(y.repayment)}</strong></article>
      <article class="summary-card"><span>Total cash in</span><strong>${money(y.income)}</strong></article>
      <article class="summary-card"><span>Total spending</span><strong>${money(y.spending)}</strong></article>
      <article class="summary-card"><span>Year net</span><strong class="${y.net < 0 ? 'negative' : 'positive'}">${money(y.net)}</strong></article>
    </section>
    <section class="panel"><div class="section-head"><div><div class="eyebrow">MONTH BY MONTH</div><h2>${overviewYear} breakdown</h2></div></div><div class="table-scroll"><table class="table wide-table"><thead><tr><th>Month</th><th>Salary</th><th>Freelance</th><th>Repayments</th><th>Cash in</th><th>Spent</th><th>Net</th></tr></thead><tbody>${rows.map(r => `<tr><td><strong>${h(monthLabel(r.k).split(' ')[0])}</strong></td><td>${money(r.salary)}</td><td>${money(r.freelance)}</td><td>${money(r.repayment)}</td><td>${money(r.income)}</td><td>${money(r.spending)}</td><td class="${r.net < 0 ? 'negative' : 'positive'}">${money(r.net)}</td></tr>`).join('')}</tbody></table></div></section>`;
}
window.applyOverviewMonth = () => { overviewMonth = document.getElementById('overviewMonth').value || overviewMonth; renderOverview(); };
window.applyOverviewYear = () => { overviewYear = Number(document.getElementById('overviewYear').value) || overviewYear; renderOverview(); };

function groupByMonth(items, dateKey) { const g = {}; items.forEach(x => { const k = monthOf(x[dateKey]); (g[k] ??= []).push(x); }); return Object.entries(g).sort((a, b) => b[0].localeCompare(a[0])); }

function renderPaydayDashboard() {
  const groups = groupByMonth(snapshot.paycards, 'paydayDate');
  app.innerHTML = `<section class="hero"><div class="hero-row"><div><div class="eyebrow">REGULAR INCOME</div><h2>Payday Dashboard</h2><div class="muted small">Each card is one actual salary payout. Actual payday dates can change for weekends or holidays.</div></div><button class="button primary" onclick="openPaydayForm()">＋ Add Pay Card</button></div></section>${!groups.length ? `<div class="empty">No salary cards yet.</div>` : groups.map(([k, cards]) => `<section><div class="section-head"><div><div class="eyebrow">MONTH</div><h2>${h(monthLabel(k))}</h2></div><button class="button secondary compact-button" onclick="openPaydayForm()">＋</button></div><div class="card-grid">${cards.map(paydayCardHtml).join('')}</div></section>`).join('')}`;
}
function paydayCardHtml(c) {
  const expenses = c.expenses || [];
  const paid = sum(expenses, e => e.amountPaid);
  const listedBills = sum(expenses, e => e.amountDue);
  const outstanding = sum(expenses, e => Math.max(n(e.amountDue) - n(e.amountPaid), 0));
  const allowance = n(c.allowance);
  const left = n(c.netPay) - allowance - paid;
  const possibleLeft = left - outstanding;
  const open = expenses.filter(e => n(e.amountPaid) < n(e.amountDue)).length;
  return `<article class="finance-card clickable" onclick="openPayday(${c.id})"><div class="card-top"><span class="date-pill">${h(humanDate(c.paydayDate))}</span><span class="muted small">${open} open</span></div><div class="metric-label">Net pay</div><div class="metric-main">${money(c.netPay)}</div><div class="divider"></div><div class="card-stats"><div><span>Allowance</span><strong>${money(allowance)}</strong></div><div><span>Total listed bills</span><strong>${money(listedBills)}</strong></div><div><span>Actually paid</span><strong>${money(paid)}</strong></div></div><div class="divider"></div><div class="card-stats"><div><span>Money left</span><strong class="${left < 0 ? 'negative' : 'positive'}">${money(left)}</strong></div><div><span>Possible money left</span><strong class="${possibleLeft < 0 ? 'negative' : 'positive'}">${money(possibleLeft)}</strong></div></div><div class="card-actions" onclick="event.stopPropagation()"><button class="mini" onclick="openPaydayForm(${c.id})">Edit</button><button class="mini danger" onclick="removePayday(${c.id})">Delete</button></div></article>`;
}
window.openPayday = id => { detail = { type: 'payday', id: Number(id) }; render(); window.scrollTo(0, 0); };
window.openPaydayForm = id => { detail = { type: 'paydayForm', id: id ? Number(id) : null }; render(); window.scrollTo(0, 0); };
window.removePayday = id => { if (confirm('Delete this payday card? Its snapshot will remain in History, but it will be removed from active totals.')) { DB.deletePaycard(id); toast('Payday card deleted'); detail = null; currentView = 'payday'; refresh(); } };

function paymentRow(e, inputClass) {
  const st = expenseStatus(e.amountDue, e.amountPaid), rem = Math.max(n(e.amountDue) - n(e.amountPaid), 0);
  return `<tr data-due="${n(e.amountDue)}"><td><strong>${h(e.name)}</strong></td><td>${money(e.amountDue)}</td><td class="${isOverdue(e.dueDate, rem) ? 'overdue' : ''}">${h(humanDate(e.dueDate))}</td><td><input class="${inputClass}" data-id="${e.id}" data-original="${n(e.amountPaid)}" type="number" min="0" step="0.01" value="${n(e.amountPaid)}"></td><td><span class="status ${st.cls}">${h(st.text)}</span></td></tr>`;
}
function bindPaymentEditor(selector, netAmount, reservedAmount = 0) {
  const inputs = [...document.querySelectorAll(selector)];
  const recalc = () => {
    let total = 0;
    inputs.forEach(input => {
      const paid = Math.max(0, n(input.value)); total += paid;
      const row = input.closest('tr'); const due = n(row.dataset.due); const status = expenseStatus(due, paid); const badge = row.querySelector('.status'); badge.className = `status ${status.cls}`; badge.textContent = status.text;
    });
    document.querySelectorAll('[data-live-total-paid]').forEach(el => el.textContent = money(total));
    const left = n(netAmount) - n(reservedAmount) - total;
    document.querySelectorAll('[data-live-money-left]').forEach(el => { el.textContent = money(left); el.className = left < 0 ? 'negative' : 'positive'; });
  };
  inputs.forEach(i => i.addEventListener('input', recalc)); recalc();
}

function renderPaydayDetail(id) {
  const c = byId(snapshot.paycards, id); if (!c) { detail = null; return renderPaydayDashboard(); }
  const expenses = c.expenses || [];
  const paid = sum(expenses, e => e.amountPaid);
  const listedBills = sum(expenses, e => e.amountDue);
  const outstanding = sum(expenses, e => Math.max(n(e.amountDue) - n(e.amountPaid), 0));
  const allowance = n(c.allowance);
  const left = n(c.netPay) - allowance - paid;
  const possibleLeft = left - outstanding;
  app.innerHTML = `<section class="hero"><div class="hero-row"><div><button class="mini" onclick="backToPayday()">← Payday</button><div class="spacer"></div><div class="eyebrow">${h(humanDate(c.paydayDate))}</div><h2>${money(c.netPay)} Net Pay</h2></div><div class="actions"><button class="button secondary" onclick="openPaydayForm(${c.id})">Edit Card</button><button class="button danger" onclick="removePayday(${c.id})">Delete</button></div></div></section>
    <section class="summary-grid six"><article class="summary-card"><span>Net pay</span><strong>${money(c.netPay)}</strong></article><article class="summary-card"><span>Allowance</span><strong>${money(allowance)}</strong><small>Reserved from this payday</small></article><article class="summary-card"><span>Total listed bills</span><strong>${money(listedBills)}</strong><small>Includes unpaid bills</small></article><article class="summary-card"><span>Actually paid</span><strong data-live-total-paid>${money(paid)}</strong></article><article class="summary-card"><span>Money left</span><strong data-live-money-left class="${left < 0 ? 'negative' : 'positive'}">${money(left)}</strong><small>Based on actual payments</small></article><article class="summary-card"><span>Possible money left</span><strong class="${possibleLeft < 0 ? 'negative' : 'positive'}">${money(possibleLeft)}</strong><small>After all listed bills are fully paid</small></article></section>
    <section class="panel"><div class="section-head"><div><div class="eyebrow">BILLS & EXPENSES</div><h2>Payments</h2></div></div>${!expenses.length ? `<div class="empty">No expenses on this card.</div>` : `<div class="table-scroll"><table class="table"><thead><tr><th>Expense</th><th>Amount Due</th><th>Due Date</th><th>Amount Paid</th><th>Status</th></tr></thead><tbody>${expenses.map(e => paymentRow(e, 'payday-payment')).join('')}</tbody></table></div><div class="totals"><div><span>Allowance</span><strong>${money(allowance)}</strong></div><div><span>Total listed bills</span><strong>${money(listedBills)}</strong></div><div><span>Total actually paid</span><strong data-live-total-paid>${money(paid)}</strong></div><div><span>Money left</span><strong data-live-money-left class="${left < 0 ? 'negative' : 'positive'}">${money(left)}</strong></div><div><span>Possible money left</span><strong class="${possibleLeft < 0 ? 'negative' : 'positive'}">${money(possibleLeft)}</strong></div></div><div class="card-actions"><button class="button secondary" onclick="zeroPaydayPayments()">Set all to ₱0</button><button class="button primary" onclick="savePaydayPayments()">Save Payments</button></div>`}</section>`;
  bindPaymentEditor('.payday-payment', c.netPay, allowance);
}
window.backToPayday = () => { detail = null; currentView = 'payday'; render(); };
window.savePaydayPayments = () => {
  let changed = 0;
  document.querySelectorAll('.payday-payment').forEach(i => { const val = Math.max(0, n(i.value)); if (Math.abs(val - n(i.dataset.original)) > 0.000001) { if (DB.updateExpensePayment(Number(i.dataset.id), val)) changed++; } });
  toast(changed ? `${changed} payment${changed === 1 ? '' : 's'} updated` : 'No payment changes'); refresh();
};
window.zeroPaydayPayments = () => { document.querySelectorAll('.payday-payment').forEach(i => { i.value = '0'; i.dispatchEvent(new Event('input', { bubbles: true })); }); };

function expenseFormRows(items) { return items.length ? items.map(e => expenseFormRow(e)).join('') : expenseFormRow({}); }
function expenseFormRow(e) {
  return `<div class="expense-row expense-edit-row" data-id="${e.id || ''}"><label class="field wide"><span>Bill / Expense Name</span><input class="ex-name" required value="${h(e.name || '')}"></label><label class="field"><span>Amount</span><input class="ex-amount" type="number" min="0" step="0.01" required value="${e.amountDue !== undefined && e.amountDue !== '' ? h(e.amountDue) : ''}"></label><label class="field"><span>Due Date</span><input class="ex-due" type="date" value="${h(e.dueDate || '')}"></label><button type="button" class="mini danger" onclick="removeExpenseRow(this)">Remove</button><input class="ex-paid" type="hidden" value="${n(e.amountPaid)}"></div>`;
}
window.addExpenseRow = () => { document.getElementById('expenseRows').insertAdjacentHTML('beforeend', expenseFormRow({})); };
window.removeExpenseRow = btn => { const row = btn.closest('.expense-edit-row'); const paid = n(row.querySelector('.ex-paid')?.value); if (paid > 0 && !confirm(`This expense has ${money(paid)} recorded as paid. Removing it will also remove that payment from active totals. History will still show the change. Continue?`)) return; row.remove(); };
function collectExpenses() { return [...document.querySelectorAll('.expense-edit-row')].map(r => ({ id: r.dataset.id ? Number(r.dataset.id) : 0, name: r.querySelector('.ex-name').value.trim(), amountDue: n(r.querySelector('.ex-amount').value), dueDate: r.querySelector('.ex-due').value || '', amountPaid: n(r.querySelector('.ex-paid').value) })).filter(e => e.name); }

function renderPaydayForm(id) {
  const c = id ? byId(snapshot.paycards, id) : null;
  app.innerHTML = `<section class="hero"><div><button class="mini" onclick="${c ? `openPayday(${c.id})` : `backToPayday()`}">← Back</button><div class="spacer"></div><div class="eyebrow">${c ? 'EDIT' : 'NEW'} PAYDAY</div><h2>${c ? 'Edit Pay Card' : 'Add Pay Card'}</h2></div></section><form class="panel" onsubmit="submitPayday(event,${c ? c.id : 'null'})"><div class="form-grid"><label class="field"><span>Actual Payday Date</span><input id="paydayDate" type="date" required value="${h(c?.paydayDate || localDateKey())}"></label><label class="field"><span>Net Pay</span><input id="netPay" type="number" min="0" step="0.01" required value="${c ? h(c.netPay) : ''}"></label><label class="field"><span>Allowance</span><input id="allowance" type="number" min="0" step="0.01" required value="${c ? h(n(c.allowance)) : '0'}"><small class="muted">Reserved from this payday. It reduces remaining money but is not a pending bill.</small></label></div><div class="section-head"><div><div class="eyebrow">UNLIMITED</div><h2>Bills / Expenses</h2></div><button type="button" class="button secondary" onclick="addExpenseRow()">＋ Add Expense</button></div><div id="expenseRows" class="expense-list">${expenseFormRows(c?.expenses || [])}</div><div class="card-actions"><button class="button primary" type="submit">${c ? 'Save Changes' : 'Create Pay Card'}</button></div></form>`;
}
window.submitPayday = (ev, id) => { ev.preventDefault(); const o = { paydayDate: document.getElementById('paydayDate').value, netPay: n(document.getElementById('netPay').value), allowance: n(document.getElementById('allowance').value), expenses: collectExpenses() }; const result = id ? DB.updatePaycard(id, o) : DB.createPaycard(o); const ok = id ? result : result > 0; if (ok) { toast(id ? 'Payday card updated' : 'Payday card created'); snapshot = DB.snapshot(); detail = id ? { type: 'payday', id } : { type: 'payday', id: Number(result) }; render(); } else toast('Could not save card'); };

function renderFreelanceDashboard() {
  const groups = groupByMonth(snapshot.freelance, 'incomeDate');
  app.innerHTML = `<section class="hero"><div class="hero-row"><div><div class="eyebrow">IRREGULAR INCOME</div><h2>Freelance Dashboard</h2><div class="muted small">Track money actually received from freelance work and expenses paid from it.</div></div><button class="button primary" onclick="openFreelanceForm()">＋ Add Freelance</button></div></section>${!groups.length ? `<div class="empty">No freelance income yet.</div>` : groups.map(([k, cards]) => `<section><div class="section-head"><div><div class="eyebrow">MONTH</div><h2>${h(monthLabel(k))}</h2></div><button class="button secondary compact-button" onclick="openFreelanceForm()">＋</button></div><div class="card-grid">${cards.map(freelanceCardHtml).join('')}</div></section>`).join('')}`;
}
function freelanceCardHtml(c) {
  const expenses = c.expenses || [];
  const paid = sum(expenses, e => e.amountPaid);
  const listedExpenses = sum(expenses, e => e.amountDue);
  const outstanding = sum(expenses, e => Math.max(n(e.amountDue) - n(e.amountPaid), 0));
  const left = n(c.amountReceived) - paid;
  const possibleLeft = left - outstanding;
  const open = expenses.filter(e => n(e.amountPaid) < n(e.amountDue)).length;
  return `<article class="finance-card clickable" onclick="openFreelance(${c.id})"><div class="card-top"><span class="date-pill">${h(humanDate(c.incomeDate))}</span><span class="muted small">${open} open</span></div><div class="metric-label">${h(c.projectName)}${c.clientName ? ` • ${h(c.clientName)}` : ''}</div><div class="metric-main">${money(c.amountReceived)}</div><div class="divider"></div><div class="card-stats"><div><span>Total listed expenses</span><strong>${money(listedExpenses)}</strong></div><div><span>Actually spent</span><strong>${money(paid)}</strong></div></div><div class="divider"></div><div class="card-stats"><div><span>Money left</span><strong class="${left < 0 ? 'negative' : 'positive'}">${money(left)}</strong></div><div><span>Possible money left</span><strong class="${possibleLeft < 0 ? 'negative' : 'positive'}">${money(possibleLeft)}</strong></div></div><div class="card-actions" onclick="event.stopPropagation()"><button class="mini" onclick="openFreelanceForm(${c.id})">Edit</button><button class="mini danger" onclick="removeFreelance(${c.id})">Delete</button></div></article>`;
}
window.openFreelance = id => { detail = { type: 'freelance', id: Number(id) }; render(); window.scrollTo(0, 0); };
window.openFreelanceForm = id => { detail = { type: 'freelanceForm', id: id ? Number(id) : null }; render(); window.scrollTo(0, 0); };
window.removeFreelance = id => { if (confirm('Delete this freelance card? Its snapshot will remain in History, but it will be removed from active totals.')) { DB.deleteFreelance(id); toast('Freelance card deleted'); detail = null; currentView = 'freelance'; refresh(); } };

function renderFreelanceDetail(id) {
  const c = byId(snapshot.freelance, id); if (!c) { detail = null; return renderFreelanceDashboard(); }
  const expenses = c.expenses || [];
  const paid = sum(expenses, e => e.amountPaid);
  const listedExpenses = sum(expenses, e => e.amountDue);
  const outstanding = sum(expenses, e => Math.max(n(e.amountDue) - n(e.amountPaid), 0));
  const left = n(c.amountReceived) - paid;
  const possibleLeft = left - outstanding;
  app.innerHTML = `<section class="hero"><div class="hero-row"><div><button class="mini" onclick="backToFreelance()">← Freelance</button><div class="spacer"></div><div class="eyebrow">${h(humanDate(c.incomeDate))}</div><h2>${h(c.projectName)}</h2><div class="muted">${h(c.clientName || 'No client')}</div></div><div class="actions"><button class="button secondary" onclick="openFreelanceForm(${c.id})">Edit Card</button><button class="button danger" onclick="removeFreelance(${c.id})">Delete</button></div></div></section><section class="summary-grid"><article class="summary-card"><span>Income received</span><strong>${money(c.amountReceived)}</strong></article><article class="summary-card"><span>Total listed expenses</span><strong>${money(listedExpenses)}</strong><small>Includes unpaid expenses</small></article><article class="summary-card"><span>Actually spent</span><strong data-live-total-paid>${money(paid)}</strong></article><article class="summary-card"><span>Money left</span><strong data-live-money-left class="${left < 0 ? 'negative' : 'positive'}">${money(left)}</strong><small>Based on actual payments</small></article><article class="summary-card"><span>Possible money left</span><strong class="${possibleLeft < 0 ? 'negative' : 'positive'}">${money(possibleLeft)}</strong><small>After all listed expenses are fully paid</small></article></section><section class="panel">${!expenses.length ? `<div class="empty">No expenses attached to this income.</div>` : `<div class="table-scroll"><table class="table"><thead><tr><th>Expense</th><th>Amount Due</th><th>Due Date</th><th>Amount Paid</th><th>Status</th></tr></thead><tbody>${expenses.map(e => paymentRow(e, 'freelance-payment')).join('')}</tbody></table></div><div class="totals"><div><span>Total listed expenses</span><strong>${money(listedExpenses)}</strong></div><div><span>Total actually spent</span><strong data-live-total-paid>${money(paid)}</strong></div><div><span>Money left</span><strong data-live-money-left class="${left < 0 ? 'negative' : 'positive'}">${money(left)}</strong></div><div><span>Possible money left</span><strong class="${possibleLeft < 0 ? 'negative' : 'positive'}">${money(possibleLeft)}</strong></div></div><div class="card-actions"><button class="button secondary" onclick="zeroFreelancePayments()">Set all to ₱0</button><button class="button primary" onclick="saveFreelancePayments()">Save Payments</button></div>`}</section>`;
  bindPaymentEditor('.freelance-payment', c.amountReceived);
}
window.backToFreelance = () => { detail = null; currentView = 'freelance'; render(); };
window.saveFreelancePayments = () => { let changed = 0; document.querySelectorAll('.freelance-payment').forEach(i => { const val = Math.max(0, n(i.value)); if (Math.abs(val - n(i.dataset.original)) > 0.000001) { if (DB.updateFreelanceExpensePayment(Number(i.dataset.id), val)) changed++; } }); toast(changed ? `${changed} payment${changed === 1 ? '' : 's'} updated` : 'No payment changes'); refresh(); };
window.zeroFreelancePayments = () => { document.querySelectorAll('.freelance-payment').forEach(i => { i.value = '0'; i.dispatchEvent(new Event('input', { bubbles: true })); }); };

function renderFreelanceForm(id) {
  const c = id ? byId(snapshot.freelance, id) : null;
  app.innerHTML = `<section class="hero"><div><button class="mini" onclick="${c ? `openFreelance(${c.id})` : `backToFreelance()`}">← Back</button><div class="spacer"></div><div class="eyebrow">${c ? 'EDIT' : 'NEW'} FREELANCE</div><h2>${c ? 'Edit Freelance Card' : 'Add Freelance Income'}</h2></div></section><form class="panel" onsubmit="submitFreelance(event,${c ? c.id : 'null'})"><div class="form-grid"><label class="field"><span>Date Received</span><input id="incomeDate" type="date" required value="${h(c?.incomeDate || localDateKey())}"></label><label class="field"><span>Amount Received</span><input id="amountReceived" type="number" min="0" step="0.01" required value="${c ? h(c.amountReceived) : ''}"></label><label class="field"><span>Project / Income Name</span><input id="projectName" required value="${h(c?.projectName || '')}"></label><label class="field"><span>Client</span><input id="clientName" value="${h(c?.clientName || '')}"></label></div><div class="section-head"><div><div class="eyebrow">OPTIONAL</div><h2>Expenses from this income</h2></div><button type="button" class="button secondary" onclick="addExpenseRow()">＋ Add Expense</button></div><div id="expenseRows" class="expense-list">${expenseFormRows(c?.expenses || [])}</div><div class="card-actions"><button class="button primary" type="submit">${c ? 'Save Changes' : 'Create Freelance Card'}</button></div></form>`;
}
window.submitFreelance = (ev, id) => { ev.preventDefault(); const o = { incomeDate: document.getElementById('incomeDate').value, projectName: document.getElementById('projectName').value.trim(), clientName: document.getElementById('clientName').value.trim(), amountReceived: n(document.getElementById('amountReceived').value), expenses: collectExpenses() }; const result = id ? DB.updateFreelance(id, o) : DB.createFreelance(o); const ok = id ? result : result > 0; if (ok) { toast(id ? 'Freelance card updated' : 'Freelance card created'); snapshot = DB.snapshot(); detail = id ? { type: 'freelance', id } : { type: 'freelance', id: Number(result) }; render(); } else toast('Could not save freelance card'); };

function renderGeneralExpenses() {
  const groups = groupByMonth(snapshot.generalExpenses, 'expenseDate');
  const thisMonth = sum(snapshot.generalExpenses.filter(x => monthOf(x.expenseDate) === localMonthKey()), x => x.amount);
  const total = sum(snapshot.generalExpenses, x => x.amount);
  app.innerHTML = `<section class="hero"><div class="hero-row"><div><div class="eyebrow">ACCUMULATED BALANCE</div><h2>General Expenses</h2><div class="muted small">Use this for purchases made from your accumulated available money when they are not tied to a specific Payday or Freelance card.</div></div><button class="button primary" onclick="openGeneralExpenseForm()">＋ Add Expense</button></div></section>
    <section class="summary-grid three"><article class="summary-card"><span>This month</span><strong>${money(thisMonth)}</strong></article><article class="summary-card"><span>All-time general expenses</span><strong>${money(total)}</strong></article><article class="summary-card"><span>Entries</span><strong>${snapshot.generalExpenses.length}</strong></article></section>
    ${!groups.length ? `<div class="empty">No general expenses yet.</div>` : groups.map(([k, items]) => `<section><div class="section-head"><div><div class="eyebrow">MONTH</div><h2>${h(monthLabel(k))}</h2></div><strong>${money(sum(items, x => x.amount))}</strong></div><div class="card-grid">${items.map(generalExpenseCardHtml).join('')}</div></section>`).join('')}`;
}
function generalExpenseCardHtml(x) {
  return `<article class="finance-card"><div class="card-top"><span class="date-pill">${h(humanDate(x.expenseDate))}</span><strong class="negative">${money(x.amount)}</strong></div><div class="metric-label">${h(x.name)}</div>${x.description ? `<div class="muted small spacer">${h(x.description)}</div>` : ''}<div class="card-actions"><button class="mini" onclick="openGeneralExpenseForm(${x.id})">Edit</button><button class="mini danger" onclick="removeGeneralExpense(${x.id})">Delete</button></div></article>`;
}
window.openGeneralExpenseForm = id => { detail = { type: 'generalExpenseForm', id: id ? Number(id) : null }; render(); window.scrollTo(0, 0); };
window.removeGeneralExpense = id => { if (confirm('Delete this general expense? It will be removed from active spending totals, while the deleted snapshot stays in History.')) { DB.deleteGeneralExpense(id); toast('General expense deleted'); detail = null; currentView = 'generalExpenses'; refresh(); } };
function renderGeneralExpenseForm(id) {
  const x = id ? byId(snapshot.generalExpenses, id) : null;
  app.innerHTML = `<section class="hero"><div><button class="mini" onclick="backToGeneralExpenses()">← General Expenses</button><div class="spacer"></div><div class="eyebrow">${x ? 'EDIT' : 'NEW'} GENERAL EXPENSE</div><h2>${x ? 'Edit General Expense' : 'Add General Expense'}</h2></div></section><form class="panel" onsubmit="submitGeneralExpense(event,${x ? x.id : 'null'})"><div class="form-grid"><label class="field"><span>Date Spent</span><input id="generalExpenseDate" type="date" required value="${h(x?.expenseDate || localDateKey())}"></label><label class="field"><span>Expense Name</span><input id="generalExpenseName" required value="${h(x?.name || '')}" placeholder="e.g. Keyboard, Dinner, Repair"></label><label class="field"><span>Amount</span><input id="generalExpenseAmount" type="number" min="0.01" step="0.01" required value="${x ? h(x.amount) : ''}"></label><label class="field"><span>Description</span><textarea id="generalExpenseDescription" placeholder="Optional note">${h(x?.description || '')}</textarea></label></div><div class="card-actions"><button class="button primary" type="submit">${x ? 'Save Changes' : 'Add Expense'}</button></div></form>`;
}
window.backToGeneralExpenses = () => { detail = null; currentView = 'generalExpenses'; render(); };
window.submitGeneralExpense = (ev, id) => {
  ev.preventDefault();
  const o = { expenseDate: document.getElementById('generalExpenseDate').value, name: document.getElementById('generalExpenseName').value.trim(), amount: n(document.getElementById('generalExpenseAmount').value), description: document.getElementById('generalExpenseDescription').value.trim() };
  const result = id ? DB.updateGeneralExpense(id, o) : DB.createGeneralExpense(o);
  const ok = id ? result : result > 0;
  if (ok) { toast(id ? 'General expense updated' : 'General expense added'); snapshot = DB.snapshot(); detail = null; currentView = 'generalExpenses'; render(); } else toast('Could not save general expense');
};

function renderReceivables() {
  const outstanding = currentOutstandingReceivables();
  let body = '<div class="empty">Nobody is recorded as owing you money.</div>';
  if (snapshot.receivables.length) {
    const rows = snapshot.receivables.map(r => {
      const rem = Math.max(n(r.amountOwed) - n(r.amountReceived), 0), paid = rem <= 0, dueClass = isOverdue(r.dueDate, rem) ? 'overdue' : '';
      return `<tr><td><strong>${h(r.personName)}</strong><div class="muted small">${h(r.description || '')}</div></td><td>${money(r.amountOwed)}</td><td>${money(r.amountReceived)}</td><td class="${paid ? 'positive' : 'negative'}">${money(rem)}</td><td>${h(humanDate(r.dateOwed))}</td><td class="${dueClass}">${h(humanDate(r.dueDate))}</td><td><span class="status ${paid ? 'paid' : 'remaining'}">${paid ? 'Paid back' : 'Outstanding'}</span></td><td><div class="card-actions"><button class="mini" onclick="openReceivableForm(${r.id})">Edit / Receive</button><button class="mini danger" onclick="removeReceivable(${r.id})">Delete</button></div></td></tr>`;
    }).join('');
    body = `<section class="panel"><div class="table-scroll"><table class="table wide-table"><thead><tr><th>Person / Source</th><th>Amount Owed</th><th>Received</th><th>Remaining</th><th>Date Owed</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }
  app.innerHTML = `<section class="hero"><div class="hero-row"><div><div class="eyebrow">RECEIVABLES</div><h2>Money Owed to Me</h2><div class="muted small">Pending money stays separate until you actually receive it. Repayments are counted as cash-in on the date you record them.</div></div><button class="button primary" onclick="openReceivableForm()">＋ Add Entry</button></div></section><section class="summary-grid four"><article class="summary-card"><span>Total originally owed</span><strong>${money(sum(snapshot.receivables, r => r.amountOwed))}</strong></article><article class="summary-card"><span>Received so far</span><strong>${money(sum(snapshot.receivables, r => r.amountReceived))}</strong></article><article class="summary-card"><span>Still owed</span><strong class="negative">${money(outstanding)}</strong></article><article class="summary-card"><span>Open entries</span><strong>${snapshot.receivables.filter(r => n(r.amountReceived) < n(r.amountOwed)).length}</strong></article></section>${body}`;
}
window.openReceivableForm = id => { detail = { type: 'receivableForm', id: id ? Number(id) : null }; render(); window.scrollTo(0, 0); };
window.removeReceivable = id => { if (confirm('Delete this entry? Its snapshot will remain in History, but it will be removed from active totals.')) { DB.deleteReceivable(id); toast('Entry deleted'); detail = null; currentView = 'receivables'; refresh(); } };
function renderReceivableForm(id) {
  const r = id ? byId(snapshot.receivables, id) : null;
  app.innerHTML = `<section class="hero"><div><button class="mini" onclick="backToReceivables()">← Money Owed to Me</button><div class="spacer"></div><div class="eyebrow">${r ? 'EDIT' : 'NEW'} RECEIVABLE</div><h2>${r ? 'Edit / Record Repayment' : 'Add Money Owed to Me'}</h2></div></section><form class="panel" onsubmit="submitReceivable(event,${r ? r.id : 'null'})"><div class="form-grid"><label class="field"><span>Person / Source</span><input id="personName" required value="${h(r?.personName || '')}"></label><label class="field"><span>Amount Owed</span><input id="amountOwed" type="number" min="0" step="0.01" required value="${r ? h(r.amountOwed) : ''}"></label><label class="field"><span>Date Owed</span><input id="dateOwed" type="date" required value="${h(r?.dateOwed || localDateKey())}"></label><label class="field"><span>Expected / Due Date</span><input id="receivableDue" type="date" value="${h(r?.dueDate || '')}"></label><label class="field"><span>Amount Received So Far</span><input id="receivedSoFar" type="number" min="0" step="0.01" value="${r ? h(r.amountReceived) : '0'}"><small class="muted">You can increase, reduce, or reset this later if you need to correct it.</small></label><label class="field"><span>Description</span><textarea id="receivableDescription">${h(r?.description || '')}</textarea></label></div><div class="card-actions"><button class="button primary" type="submit">${r ? 'Save Changes' : 'Add Entry'}</button></div></form>`;
}
window.backToReceivables = () => { detail = null; currentView = 'receivables'; render(); };
window.submitReceivable = (ev, id) => { ev.preventDefault(); const o = { personName: document.getElementById('personName').value.trim(), amountOwed: n(document.getElementById('amountOwed').value), dateOwed: document.getElementById('dateOwed').value, dueDate: document.getElementById('receivableDue').value || '', description: document.getElementById('receivableDescription').value.trim(), amountReceived: n(document.getElementById('receivedSoFar').value) }; const result = id ? DB.updateReceivable(id, o) : DB.createReceivable(o); const ok = id ? result : result > 0; if (ok) { toast(id ? 'Entry updated' : 'Entry created'); snapshot = DB.snapshot(); detail = null; currentView = 'receivables'; render(); } else toast('Could not save entry'); };

function renderHistory() {
  app.innerHTML = `<section class="hero"><div><div class="eyebrow">AUDIT LOG</div><h2>History</h2><div class="muted small">Created, edited, payment-corrected, and deleted records remain visible here with timestamps.</div></div></section><section class="panel"><div class="filter-row"><label class="field"><span>Action</span><select id="historyAction" onchange="filterHistory()"><option value="all">All</option><option value="created">Created</option><option value="edited">Edited</option><option value="payment">Payment Updates</option><option value="deleted">Deleted</option></select></label><label class="field"><span>Section</span><select id="historyType" onchange="filterHistory()"><option value="all">All</option><option value="payday">Payday</option><option value="freelance">Freelance</option><option value="receivable">Money Owed to Me</option><option value="general_expense">General Expenses</option></select></label></div><div id="historyList"></div></section>`;
  filterHistory();
}
window.filterHistory = () => {
  const action = document.getElementById('historyAction')?.value || 'all', type = document.getElementById('historyType')?.value || 'all';
  const rows = snapshot.history.filter(x => (action === 'all' || x.action === action) && (type === 'all' || x.entityType === type));
  document.getElementById('historyList').innerHTML = rows.length ? rows.map(x => `<div class="history-item"><div><strong>${h(x.summary)}</strong></div><div class="meta">${h(x.entityType)} • ${h(x.action)} • ${h(humanDateTime(x.createdAt))}</div>${historyDetails(x)}</div>`).join('') : `<div class="empty">No history entries for this filter.</div>`;
};
function historyDetails(x) {
  const d = x.details || {};
  if (x.action === 'payment' && d.before !== undefined) return `<div class="small muted">${d.expense ? `${h(d.expense)} • ` : ''}${money(d.before)} → ${money(d.after)}${d.date ? ` • recorded ${h(humanDate(d.date))}` : ''}</div>`;
  if (x.action === 'deleted') { const date = d.paydayDate || d.incomeDate || d.dateOwed || d.expenseDate; return `<div class="small muted">Deleted snapshot${date ? ` • record date ${h(humanDate(date))}` : ''}</div>`; }
  if (x.action === 'edited' && d.before && d.after) {
    const date = d.after.paydayDate || d.after.incomeDate || d.after.dateOwed || d.after.expenseDate;
    return `<div class="small muted">${date ? `Record date: ${h(humanDate(date))}` : 'Record updated'}</div>`;
  }
  return '';
}

refresh();
