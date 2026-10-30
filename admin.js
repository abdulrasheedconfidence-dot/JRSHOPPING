const loginPanel = document.getElementById('login-panel');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('login-form');
const loginMessage = document.getElementById('login-message');
const adminMessage = document.getElementById('admin-message');
const signout = document.getElementById('signout');
const rowsRoot = document.getElementById('transactions-body');
let transactions = [];

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
const money = (amount, currency) => new Intl.NumberFormat('en-US', { style:'currency', currency:currency || 'USD' }).format(Number(amount) || 0);
const date = value => value ? new Intl.DateTimeFormat('en-US', { dateStyle:'medium', timeStyle:'short', timeZone:'America/New_York' }).format(new Date(value)) : '—';

function showDashboard() {
  loginPanel.hidden = true;
  dashboard.hidden = false;
  signout.hidden = false;
  loadTransactions();
}

async function loadTransactions() {
  adminMessage.textContent = 'Loading transactions…';
  try {
    const response = await fetch('/api/admin-orders', { credentials:'same-origin', cache:'no-store' });
    const result = await response.json();
    if (response.status === 401) {
      loginPanel.hidden = false; dashboard.hidden = true; signout.hidden = true;
      adminMessage.textContent = '';
      return;
    }
    if (!response.ok) throw new Error(result.error || 'Transactions could not be loaded.');
    transactions = result.transactions || [];
    renderTransactions();
    adminMessage.textContent = '';
  } catch (error) { adminMessage.textContent = error.message; }
}

function itemSummary(transaction) {
  return (transaction.entries || []).map(entry => {
    if (entry.type === 'discount') return `${entry.name}`;
    const quantity = Number(entry.quantity || 1);
    return `${quantity > 1 ? `${quantity} × ` : ''}${entry.name || 'Item'}`;
  }).join(' · ') || 'Order details unavailable';
}

function renderTransactions() {
  const status = document.getElementById('status-filter').value;
  const kind = document.getElementById('type-filter').value;
  const term = document.getElementById('search').value.trim().toLowerCase();
  const filtered = transactions.filter(transaction => {
    const matchesStatus = status === 'all' || transaction.payment_status === status;
    const matchesKind = kind === 'all' || transaction.kind === kind;
    const searchable = [transaction.customer_name, transaction.customer_email, transaction.customer_phone, transaction.tx_ref, itemSummary(transaction)].join(' ').toLowerCase();
    return matchesStatus && matchesKind && searchable.includes(term);
  });
  document.getElementById('result-count').textContent = `${filtered.length} ${filtered.length === 1 ? 'transaction' : 'transactions'} · latest ${transactions.length} records`;
  rowsRoot.innerHTML = filtered.length ? filtered.map(transaction => `<tr><td>${escapeHtml(date(transaction.created_at))}<small>${transaction.paid_at ? `Paid ${escapeHtml(date(transaction.paid_at))}` : ''}</small></td><td><span class="status-pill status-${escapeHtml(transaction.payment_status)}">${escapeHtml(transaction.payment_status.replaceAll('_',' ').toUpperCase())}</span></td><td>${escapeHtml(transaction.kind === 'ticket' ? 'Ticket order' : 'Shop order')}<small>${escapeHtml(itemSummary(transaction))}</small></td><td>${escapeHtml(transaction.customer_name)}<small>${escapeHtml(transaction.customer_email)}${transaction.customer_phone ? ` · ${escapeHtml(transaction.customer_phone)}` : ''}</small></td><td class="amount">${escapeHtml(money(transaction.amount, transaction.currency))}</td><td>${escapeHtml(transaction.tx_ref)}${transaction.flutterwave_transaction_id ? `<small>Provider ID: ${escapeHtml(transaction.flutterwave_transaction_id)}</small>` : ''}</td></tr>`).join('') : '<tr><td class="empty-row" colspan="6">No transactions match these filters.</td></tr>';
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = loginForm.querySelector('button');
  button.disabled = true;
  loginMessage.textContent = 'Signing in…';
  try {
    const response = await fetch('/api/admin-login', { method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password:new FormData(loginForm).get('password')}) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Sign in failed.');
    loginForm.reset();
    loginMessage.textContent = '';
    showDashboard();
  } catch (error) { loginMessage.textContent = error.message; }
  finally { button.disabled = false; }
});

signout.addEventListener('click', async () => {
  await fetch('/api/admin-login', { method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:'logout'}) }).catch(() => {});
  transactions = [];
  dashboard.hidden = true;
  signout.hidden = true;
  loginPanel.hidden = false;
  loginMessage.textContent = 'You have signed out.';
});

document.getElementById('refresh').addEventListener('click', loadTransactions);
['status-filter','type-filter','search'].forEach(id => document.getElementById(id).addEventListener('input', renderTransactions));

fetch('/api/admin-orders', { credentials:'same-origin', cache:'no-store' }).then(response => {
  if (response.ok) showDashboard();
  else if (response.status === 503) response.json().then(data => { loginMessage.textContent = data.error || ''; });
}).catch(() => {});
