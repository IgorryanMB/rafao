/* JV Perfumes - bundle local gerado a partir dos modulos em /js.
   Mantem o projeto modular, mas permite abrir index.html diretamente por file://. */
(function(){
'use strict';

/* ===== utils.js ===== */
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const shortDate = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseLocalDate(value) {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function isoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addMonths(date, months) {
  const result = new Date(date);
  const originalDay = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(originalDay, lastDay));
  return result;
}

function daysUntil(dateStr) {
  const target = parseLocalDate(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  return Math.ceil((target - today) / 86400000);
}


function calculateLateAmounts(inst, settings = {}) {
  const original = Math.max(0, Number(inst.amount || 0));
  const paid = Math.max(0, Number(inst.paidAmount || 0));
  const principal = Math.max(0, original - paid);
  if (inst.paidAt) {
    const total = Number(inst.paidAmount ?? inst.amount ?? 0);
    return { principal: 0, original, paid: total, daysLate: Number(inst.daysLatePaid || 0), interest: Math.max(0, total - original - Number(inst.lateFeePaid || 0)), fee: Number(inst.lateFeePaid || 0), total: 0 };
  }
  const days = Math.max(0, -daysUntil(inst.dueDate));
  if (!days || principal <= 0) return { principal, original, paid, daysLate: 0, interest: 0, fee: 0, total: principal };
  const monthlyRate = Math.max(0, Number(settings.lateInterestMonthly ?? 20)) / 100;
  const feeRate = Math.max(0, Number(settings.lateFeePercent ?? 2)) / 100;
  const chargeInterest = settings.chargeLateInterest !== false;
  const chargeFee = settings.chargeLateFee !== false;
  const interest = chargeInterest ? principal * monthlyRate * (days / 30) : 0;
  const fee = chargeFee ? principal * feeRate : 0;
  const total = principal + interest + fee;
  return { principal, original, paid, daysLate: days, interest: +interest.toFixed(2), fee: +fee.toFixed(2), total: +total.toFixed(2) };
}
function installmentStatus(inst, dueSoonDays = 5) {
  if (inst.paidAt) return { key: 'paid', label: 'Pago' };
  const days = daysUntil(inst.dueDate);
  if (days < 0) return { key: 'overdue', label: `Atrasada ${Math.abs(days)}d` };
  if (days <= dueSoonDays) return { key: 'soon', label: days === 0 ? 'Vence hoje' : `Vence em ${days}d` };
  return { key: 'open', label: 'Em aberto' };
}

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('') || 'JV';
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[c]));
}

function normalizePhone(phone = '') {
  let digits = phone.replace(/\D/g, '');
  if (digits && !digits.startsWith('55')) digits = `55${digits}`;
  return digits;
}

/* ===== storage.js ===== */

const KEY = 'jvperfumes:data:v1';

function buildSeed() {
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2, 12);
  const second = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 4, 12);
  const third = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7, 12);

  const clients = [
    { id: 'cli_ana', name: 'Ana Paula', phone: '(18) 99812-4455', email: 'ana@email.com', notes: 'Troca de válvula e reposição.', createdAt: new Date().toISOString() },
    { id: 'cli_carlos', name: 'Carlos Henrique', phone: '(18) 99701-2030', email: '', notes: 'Perfume importado.', createdAt: new Date().toISOString() },
    { id: 'cli_marina', name: 'Marina Lopes', phone: '(18) 99155-8890', email: 'marina@email.com', notes: '', createdAt: new Date().toISOString() }
  ];

  const installments = [];
  const addPlan = (clientId, total, count, start, paidCount = 0) => {
    const base = Math.floor((total / count) * 100) / 100;
    for (let i = 0; i < count; i++) {
      const amount = i === count - 1 ? +(total - base * (count - 1)).toFixed(2) : base;
      installments.push({ id: uid('par'), clientId, number: i + 1, amount, dueDate: isoDate(addMonths(start, i)), paidAt: i < paidCount ? new Date(today.getTime() - (paidCount - i) * 86400000 * 10).toISOString() : null, createdAt: new Date().toISOString() });
    }
  };
  addPlan('cli_ana', 480, 4, first, 2);
  addPlan('cli_carlos', 320, 2, second, 0);
  addPlan('cli_marina', 750, 5, third, 4);

  return {
    version: 1,
    settings: { dueSoonDays: 5, notificationsEnabled: false, lateInterestMonthly: 20, lateFeePercent: 2 },
    clients,
    installments,
    products: [
      { id: 'prd_1', name: 'Frasco Premium 100ml', category: 'Frascos', brand: 'JV', sku: 'FR-100-P', qty: 8, minStock: 4, cost: 22.5, price: 39.9, createdAt: new Date().toISOString() },
      { id: 'prd_2', name: 'Válvula Spray Rosca 15mm', category: 'Válvulas', brand: 'Genérica', sku: 'VL-15', qty: 3, minStock: 5, cost: 4.2, price: 9.9, createdAt: new Date().toISOString() },
      { id: 'prd_3', name: 'Essência Amadeirada 100ml', category: 'Essências', brand: 'Maison', sku: 'ES-AM-100', qty: 1, minStock: 2, cost: 48, price: 85, createdAt: new Date().toISOString() },
      { id: 'prd_4', name: 'Atomizador Portátil 8ml', category: 'Acessórios', brand: 'JV', sku: 'AT-08', qty: 0, minStock: 3, cost: 11, price: 24.9, createdAt: new Date().toISOString() }
    ],
    movements: []
  };
}

function getData() {
  const raw = localStorage.getItem(KEY);
  if (!raw) {
    const seed = buildSeed();
    saveData(seed);
    return seed;
  }
  try {
    const data = JSON.parse(raw);
    data.settings ||= {};
    if (data.settings.dueSoonDays == null) data.settings.dueSoonDays = 5;
    if (data.settings.notificationsEnabled == null) data.settings.notificationsEnabled = false;
    if (data.settings.lateInterestMonthly == null) data.settings.lateInterestMonthly = 20;
    if (data.settings.lateFeePercent == null) data.settings.lateFeePercent = 2;
    return data;
  }
  catch { const seed = buildSeed(); saveData(seed); return seed; }
}

function saveData(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
  window.dispatchEvent(new CustomEvent('jv:data-changed'));
}

function updateData(mutator) {
  const data = getData();
  mutator(data);
  saveData(data);
  return data;
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(getData(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `jv-perfumes-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

async function importBackup(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (!parsed || !Array.isArray(parsed.clients) || !Array.isArray(parsed.installments) || !Array.isArray(parsed.products)) throw new Error('Backup inválido');
  saveData(parsed);
}

/* ===== dashboard.js ===== */

let chart;

function getMetrics(data = getData()) {
  const open = data.installments.filter(i => !i.paidAt);
  const paid = data.installments.filter(i => i.paidAt);
  const overdue = open.filter(i => installmentStatus(i, data.settings.dueSoonDays).key === 'overdue');
  const soon = open.filter(i => ['soon'].includes(installmentStatus(i, data.settings.dueSoonDays).key));
  const low = data.products.filter(p => p.qty <= p.minStock);
  const received = data.installments.reduce((sum, i) => sum + Number(i.paidAmount || (i.paidAt ? i.amount : 0)), 0);
  const partial = data.installments.filter(i => !i.paidAt && Number(i.paidAmount || 0) > 0);
  const receivable = open.reduce((sum, i) => sum + calculateLateAmounts(i, data.settings).total, 0);
  return { open, paid, partial, overdue, soon, low, received, receivable };
}

function renderDashboard() {
  const data = getData();
  const m = getMetrics(data);
  const cards = [
    ['bi-cash-stack', 'A receber', brl.format(m.receivable), `${m.open.length} parcela(s) em aberto`],
    ['bi-check2-circle', 'Já recebido', brl.format(m.received), `${m.paid.length} quitadas · ${brl.format(m.partial.reduce((sum,i)=>sum+Number(i.paidAmount||0),0))} em parciais`],
    ['bi-alarm', 'Vencendo / atrasadas', String(m.soon.length + m.overdue.length), `${m.overdue.length} em atraso`],
    ['bi-box-seam', 'Estoque baixo', String(m.low.length), `${data.products.length} produto(s) cadastrados`]
  ];
  document.getElementById('kpiCards').innerHTML = cards.map(c => `<div class="col-6 col-xl-3"><div class="kpi-card"><div class="kpi-icon"><i class="bi ${c[0]}"></i></div><div class="kpi-label mt-3">${c[1]}</div><div class="kpi-value">${c[2]}</div><div class="kpi-foot">${c[3]}</div></div></div>`).join('');

  const clientBalances = new Map();
  for (const inst of m.open) {
    if (!clientBalances.has(inst.clientId)) clientBalances.set(inst.clientId, []);
    clientBalances.get(inst.clientId).push(inst);
  }
  const upcoming = [...clientBalances.entries()].map(([clientId, installments]) => ({
    clientId,
    installments: installments.sort((a,b) => a.dueDate.localeCompare(b.dueDate)),
    balance: installments.reduce((sum, item) => sum + calculateLateAmounts(item, data.settings).total, 0)
  })).sort((a,b) => a.installments[0].dueDate.localeCompare(b.installments[0].dueDate)).slice(0,7);
  const tbody = document.getElementById('upcomingTable');
  tbody.innerHTML = upcoming.length ? upcoming.map(item => {
    const client = data.clients.find(c => c.id === item.clientId);
    const first = item.installments[0];
    const status = item.installments.some(i => installmentStatus(i, data.settings.dueSoonDays).key === 'overdue') ? { key: 'overdue', label: 'Em atraso' } : installmentStatus(first, data.settings.dueSoonDays);
    const names = [...new Set(item.installments.map(i => i.purchaseName).filter(Boolean))];
    const label = names.length ? names.map(escapeHtml).join(', ') : item.installments.length + ' parcela(s)';
    return `<tr><td><strong>${escapeHtml(client?.name || 'Cliente removido')}</strong></td><td>${label}</td><td>${shortDate.format(parseLocalDate(first.dueDate))}</td><td>${brl.format(item.balance)}</td><td><span class="status-pill status-${status.key}">${status.label}</span></td><td class="text-end"><button class="btn btn-sm btn-outline-light" data-open-client="${item.clientId}">Selecionar venda</button></td></tr>`;
  }).join('') : `<tr><td colspan="6"><div class="empty-state"><i class="bi bi-check-circle"></i>Nenhuma cobrança pendente.</div></td></tr>`;

  const payments = (data.paymentHistory || []).slice().sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt)).slice(0,6);
  document.getElementById('lowStockList').innerHTML = payments.length ? payments.map(p => {
    const client = data.clients.find(c => c.id === p.clientId);
    const date = p.createdAt ? shortDate.format(new Date(p.createdAt)) : 'Data indisponível';
    return `<div class="stack-item"><div><div class="stack-item-title">${client?.name || 'Cliente removido'}</div><div class="stack-item-meta">${date} · ${brl.format(Number(p.applied ?? p.amount ?? 0))} aplicado</div></div><span class="stack-badge">${brl.format(Number(p.amount || 0))}</span></div>`;
  }).join('') : `<div class="empty-state"><i class="bi bi-cash-coin"></i>Nenhum pagamento registrado ainda.</div>`;

  document.getElementById('summaryList').innerHTML = `
    <div class="summary-row"><span>Clientes ativos</span><strong>${data.clients.length}</strong></div>
    <div class="summary-row"><span>Parcelas vencidas</span><strong>${m.overdue.length}</strong></div>
    <div class="summary-row"><span>Itens sem estoque</span><strong>${data.products.filter(p=>p.qty<=0).length}</strong></div>
    <div class="summary-row"><span>Valor do estoque</span><strong>${brl.format(data.products.reduce((s,p)=>s+(Number(p.cost)||0)*(Number(p.qty)||0),0))}</strong></div>`;

  renderChart(data);
}

function renderChart(data) {
  if (!window.Chart) return;
  const now = new Date();
  const labels = [];
  const paidData = [];
  const openData = [];
  for (let i = -2; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    labels.push(d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''));
    const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const subset = data.installments.filter(x => x.dueDate.startsWith(ym));
    paidData.push(subset.reduce((s,x)=>s+Number(x.paidAmount || (x.paidAt ? x.amount : 0)),0));
    openData.push(subset.filter(x=>!x.paidAt).reduce((s,x)=>s+calculateLateAmounts(x,data.settings).total,0));
  }
  const ctx = document.getElementById('receivablesChart');
  chart?.destroy();
  chart = new Chart(ctx, { type:'bar', data:{ labels, datasets:[{ label:'Pago', data:paidData, backgroundColor:'rgba(99,214,161,.58)', borderRadius:7 },{ label:'Em aberto', data:openData, backgroundColor:'rgba(216,169,74,.58)', borderRadius:7 }] }, options:{ responsive:true, plugins:{ legend:{ labels:{ color:'#b7c4d1' } } }, scales:{ x:{ ticks:{ color:'#8193a6' }, grid:{ display:false } }, y:{ ticks:{ color:'#8193a6', callback:v=>`R$ ${v}` }, grid:{ color:'rgba(255,255,255,.06)' } } } } });
}

/* ===== clients.js ===== */

let clientModal, detailsModal, purchaseClientId = null;

function initClients(showToast) {
  clientModal = bootstrap.Modal.getOrCreateInstance('#clientModal');
  detailsModal = bootstrap.Modal.getOrCreateInstance('#clientDetailsModal');

  document.querySelectorAll('[data-open-client-modal]').forEach(btn => btn.addEventListener('click', () => openClientModal()));
  document.getElementById('clientForm').addEventListener('submit', e => saveClient(e, showToast));
  document.getElementById('clientSearch').addEventListener('input', renderClients);
  document.getElementById('clientStatusFilter').addEventListener('change', renderClients);

  document.addEventListener('click', e => {
    const open = e.target.closest('[data-open-client]');
    if (open) openClientDetails(open.dataset.openClient, showToast);
    const edit = e.target.closest('[data-edit-client]');
    if (edit) openClientModal(edit.dataset.editClient);
    const newPurchase = e.target.closest('[data-new-purchase]');
    if (newPurchase) { const clientId = newPurchase.dataset.newPurchase; detailsModal?.hide(); setTimeout(() => openPurchaseModal(clientId), 150); }
    const del = e.target.closest('[data-delete-client]');
    if (del) deleteClient(del.dataset.deleteClient, showToast);
    const pay = e.target.closest('[data-toggle-payment]');
    if (pay) togglePayment(pay.dataset.togglePayment, pay.dataset.clientId, showToast);
    const submitPayment = e.target.closest('[data-payment-submit]');
    if (submitPayment) registerPayment(submitPayment.dataset.paymentSubmit, submitPayment.dataset.clientId, showToast);
    const cancelPayment = e.target.closest('[data-payment-cancel]');
    if (cancelPayment) document.getElementById('paymentEntryCard')?.remove();
    const whatsapp = e.target.closest('[data-whatsapp-client]');
    if (whatsapp) openWhatsApp(whatsapp.dataset.whatsappClient);
  });
}

function renderClients() {
  const data = getData();
  const query = foldSearch(document.getElementById('clientSearch')?.value.trim() || '');
  const filter = document.getElementById('clientStatusFilter')?.value || 'all';
  let clients = data.clients.map(c => ({ c, ins: data.installments.filter(i => i.clientId === c.id) }));
  clients = clients.filter(({c,ins}) => {
    const text = foldSearch(`${c.name} ${c.phone} ${c.email} ${ins.map(i => i.purchaseName || '').join(' ')}`);
    if (query && !text.includes(query)) return false;
    const open = ins.filter(i=>!i.paidAt);
    const overdue = open.some(i=>installmentStatus(i,data.settings.dueSoonDays).key==='overdue');
    if (filter==='open' && open.length===0) return false;
    if (filter==='paid' && open.length>0) return false;
    if (filter==='overdue' && !overdue) return false;
    return true;
  });
  document.getElementById('clientCountLabel').textContent = `${clients.length} cliente(s)`;
  document.getElementById('clientsGrid').innerHTML = clients.length ? clients.map(({c,ins}) => clientCard(c,ins,data.settings.dueSoonDays)).join('') : `<div class="col-12"><div class="panel empty-state"><i class="bi bi-people"></i>Nenhum cliente encontrado.</div></div>`;
}

function foldSearch(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function clientCard(client, ins, dueDays) {
  const data = getData();
  const total = ins.reduce((sum,i)=>sum+Number(i.amount||0),0);
  const paid = ins.reduce((sum,i)=>sum+Number(i.paidAmount || (i.paidAt ? i.amount : 0)),0);
  const open = ins.filter(i=>!i.paidAt).reduce((sum,i)=>sum+calculateLateAmounts(i,data.settings).total,0);
  const paidCount = ins.filter(i=>i.paidAt).length;
  const progress = ins.length ? Math.round((paidCount/ins.length)*100) : 0;
  const hasOverdue = ins.some(i=>installmentStatus(i,dueDays).key==='overdue');
  const status = open <= .001 ? ['paid','Quitado'] : hasOverdue ? ['overdue','Em atraso'] : ['open','Em aberto'];
  return `<div class="col-12 col-md-6 col-xxl-4"><div class="client-card"><div class="client-top"><div class="d-flex gap-3"><div class="client-avatar">${initials(client.name)}</div><div><div class="client-name">${escapeHtml(client.name)}</div><div class="client-meta">${escapeHtml(client.phone || client.email || 'Sem contato')}</div></div></div><span class="status-pill status-${status[0]}">${status[1]}</span></div><div class="money-row"><div class="money-block"><small>Contrato</small><strong>${brl.format(total)}</strong></div><div class="money-block text-end"><small>Saldo atualizado</small><strong>${brl.format(open)}</strong></div></div><div class="d-flex justify-content-between small text-secondary mt-3"><span>${paidCount}/${ins.length} pagas</span><span>${progress}%</span></div><div class="progress mt-2"><div class="progress-bar" style="width:${progress}%"></div></div><div class="client-actions"><button class="btn btn-sm btn-outline-light" data-open-client="${client.id}"><i class="bi bi-eye me-1"></i>Ver</button>${client.phone ? `<button class="btn btn-sm btn-outline-success" data-whatsapp-client="${client.id}"><i class="bi bi-whatsapp"></i></button>` : ''}<button class="btn btn-sm btn-outline-secondary" data-edit-client="${client.id}"><i class="bi bi-pencil"></i></button></div></div></div>`;
}
function openClientModal(id = null) {
  const form = document.getElementById('clientForm');
  purchaseClientId = null;
  resetSaleStockControls();
  form.reset();
  ['clientTotal','clientInstallments','clientFirstDue','clientPurchaseProduct'].forEach(fieldId => { document.getElementById(fieldId).disabled = false; });
  document.getElementById('clientId').value = '';
  document.getElementById('clientInstallments').value = 1;
  const d = new Date(); d.setDate(d.getDate()+7);
  document.getElementById('clientFirstDue').value = isoDate(d);
  document.getElementById('clientModalTitle').textContent = id ? 'Editar cliente' : 'Novo cliente';
  if (id) {
    const data = getData(); const c = data.clients.find(x=>x.id===id); const ins = data.installments.filter(x=>x.clientId===id).sort((a,b)=>a.number-b.number);
    if (!c) return;
    const total = ins.reduce((s,i)=>s+Number(i.amount||0),0);
    document.getElementById('clientId').value = c.id;
    document.getElementById('clientName').value = c.name;
    document.getElementById('clientPhone').value = c.phone || '';
    document.getElementById('clientEmail').value = c.email || '';
    document.getElementById('clientNotes').value = c.notes || '';
    document.getElementById('clientTotal').value = total.toFixed(2);
    document.getElementById('clientInstallments').value = ins.length || 1;
    document.getElementById('clientFirstDue').value = ins[0]?.dueDate || isoDate(d);
    ['clientTotal','clientInstallments','clientFirstDue','clientPurchaseProduct'].forEach(fieldId => { document.getElementById(fieldId).disabled = true; });
  }
  document.getElementById('clientStockProduct').disabled = Boolean(id);
  document.getElementById('clientStockQty').disabled = Boolean(id);
  clientModal.show();
}

function openPurchaseModal(clientId) {
  const data = getData();
  const client = data.clients.find(c => c.id === clientId);
  if (!client) return;
  purchaseClientId = clientId;
  resetSaleStockControls();
  const form = document.getElementById('clientForm');
  form.reset();
  document.getElementById('clientId').value = '';
  document.getElementById('clientName').value = client.name;
  document.getElementById('clientPhone').value = client.phone || '';
  document.getElementById('clientEmail').value = client.email || '';
  document.getElementById('clientNotes').value = client.notes || '';
  document.getElementById('clientPurchaseProduct').value = '';
  ['clientTotal','clientInstallments','clientFirstDue','clientPurchaseProduct'].forEach(fieldId => { document.getElementById(fieldId).disabled = false; });
  document.getElementById('clientTotal').value = '';
  document.getElementById('clientInstallments').value = 1;
  const due = new Date(); due.setDate(due.getDate() + 7);
  document.getElementById('clientFirstDue').value = isoDate(due);
  document.getElementById('clientModalTitle').textContent = 'Nova compra — ' + client.name;
  document.getElementById('clientStockProduct').disabled = false;
  document.getElementById('clientStockQty').disabled = false;
  clientModal.show();
}

function resetSaleStockControls() {
  const select = document.getElementById('clientStockProduct');
  const qty = document.getElementById('clientStockQty');
  if (select) select.value = '';
  if (qty) qty.value = '1';
}
function readStockSale(showToast) {
  const productId = document.getElementById('clientStockProduct')?.value || '';
  if (!productId) return null;
  const qty = Number(document.getElementById('clientStockQty')?.value);
  const p = getData().products.find(item => item.id === productId);
  if (!p || !Number.isInteger(qty) || qty < 1) { showToast('Escolha um produto e uma quantidade válida.'); return false; }
  if (Number(p.qty || 0) < qty) { showToast('Estoque insuficiente para esta venda.'); return false; }
  return { productId, qty, costTotal: +(Number(p.cost || 0) * qty).toFixed(2), productName: p.name };
}
function applyStockSale(data, sale, clientId, purchaseId) {
  if (!sale) return;
  const p = data.products.find(item => item.id === sale.productId);
  if (!p || Number(p.qty || 0) < sale.qty) throw new Error('Estoque insuficiente.');
  p.qty = Number(p.qty || 0) - sale.qty;
  data.movements ||= [];
  data.movements.push({ id: uid('mov'), productId: p.id, type: 'out', qty: sale.qty, note: 'Venda: ' + sale.productName, clientId, purchaseId, createdAt: new Date().toISOString() });
}
function saveClient(e, showToast) {
  e.preventDefault();
  const id = document.getElementById('clientId').value;
  const payload = {
    name: document.getElementById('clientName').value.trim(),
    phone: document.getElementById('clientPhone').value.trim(),
    email: document.getElementById('clientEmail').value.trim(),
    notes: document.getElementById('clientNotes').value.trim()
  };
  const total = Number(document.getElementById('clientTotal').value);
  const count = Number(document.getElementById('clientInstallments').value);
  const firstDue = parseLocalDate(document.getElementById('clientFirstDue').value);
  const purchaseName = document.getElementById('clientPurchaseProduct').value.trim();
  const stockSale = id ? null : readStockSale(showToast);
  if (stockSale === false) return;
  const stockMeta = stockSale ? { stockProductId: stockSale.productId, stockQty: stockSale.qty, saleCostTotal: stockSale.costTotal } : null;
  if (!payload.name) return;
  if (purchaseClientId) {
    if (!purchaseName || !Number.isFinite(total) || total <= 0 || !Number.isInteger(count) || count < 1 || count > 60 || !firstDue) return;
    const targetId = purchaseClientId;
    updateData(data => { const purchaseId = uid('buy'); createInstallments(data, targetId, total, count, firstDue, new Map(), purchaseId, purchaseName, stockMeta); applyStockSale(data, stockSale, targetId, purchaseId); });
    purchaseClientId = null;
    clientModal.hide();
    showToast('Nova compra registrada no cadastro do cliente.');
    if (detailsModal) { detailsModal.hide(); setTimeout(() => openClientDetails(targetId, showToast), 150); }
    return;
  }
  if (id) {
    updateData(data => { const idx = data.clients.findIndex(c => c.id === id); if (idx >= 0) data.clients[idx] = { ...data.clients[idx], ...payload, updatedAt: new Date().toISOString() }; });
    clientModal.hide(); showToast('Dados do cliente atualizados. As compras e parcelas foram preservadas.'); return;
  }
  if (!purchaseName || !Number.isFinite(total) || total <= 0 || !Number.isInteger(count) || count < 1 || count > 60 || !firstDue) return;

  updateData(data => {
    let clientId = id;
    if (id) {
      const idx = data.clients.findIndex(c=>c.id===id);
      data.clients[idx] = { ...data.clients[idx], ...payload, updatedAt:new Date().toISOString() };
      const old = data.installments.filter(i=>i.clientId===id).sort((a,b)=>a.number-b.number);
      const paidMap = new Map(old.map(i=>[i.number,i.paidAt]));
      data.installments = data.installments.filter(i=>i.clientId!==id);
      createInstallments(data, id, total, count, firstDue, paidMap);
    } else {
      clientId = uid('cli');
      data.clients.push({ id:clientId, ...payload, createdAt:new Date().toISOString() });
      const purchaseId = uid('buy');
      createInstallments(data, clientId, total, count, firstDue, new Map(), purchaseId, purchaseName, stockMeta);
      applyStockSale(data, stockSale, clientId, purchaseId);
    }
  });
  clientModal.hide(); showToast(id ? 'Cliente atualizado.' : 'Cliente cadastrado.');
}

function createInstallments(data, clientId, total, count, firstDue, paidMap = new Map(), purchaseId = null, purchaseName = '', stockMeta = null) {
  const base = Math.floor((total / count) * 100) / 100;
  for (let i=0;i<count;i++) {
    const n=i+1; const amount = n===count ? +(total-base*(count-1)).toFixed(2) : base;
    data.installments.push({ id:uid('par'), clientId, number:n, amount, dueDate:isoDate(addMonths(firstDue,i)), paidAt:paidMap.get(n)||null, ...(purchaseId ? { purchaseId } : {}), ...(purchaseName ? { purchaseName } : {}), ...(stockMeta || {}), createdAt:new Date().toISOString() });
  }
}

function openClientDetails(id, showToast = ()=>{}) {
  const data = getData(); const client = data.clients.find(c=>c.id===id); if (!client) return;
  const ins = data.installments.filter(i=>i.clientId===id).sort((a,b)=>a.number-b.number);
  const contracted = ins.reduce((sum,i)=>sum+Number(i.amount||0),0);
  const paid = ins.filter(i=>i.paidAt).reduce((sum,i)=>sum+Number(i.paidAmount ?? i.amount ?? 0),0);
  const openUpdated = ins.filter(i=>!i.paidAt).reduce((sum,i)=>sum+calculateLateAmounts(i,data.settings).total,0);
  const additions = ins.filter(i=>!i.paidAt).reduce((sum,i)=>{const x=calculateLateAmounts(i,data.settings);return sum+x.interest+x.fee},0);
  document.getElementById('detailsClientName').textContent = client.name;
  document.getElementById('clientDetailsBody').innerHTML = `<div class="row g-3 mb-4"><div class="col-6 col-lg"><div class="detail-stat"><small>Contrato</small><strong>${brl.format(contracted)}</strong></div></div><div class="col-6 col-lg"><div class="detail-stat"><small>Já pago</small><strong>${brl.format(paid)}</strong></div></div><div class="col-6 col-lg"><div class="detail-stat"><small>Acréscimos atuais</small><strong>${brl.format(additions)}</strong></div></div><div class="col-6 col-lg"><div class="detail-stat"><small>Saldo atualizado</small><strong>${brl.format(openUpdated)}</strong></div></div><div class="col-6 col-lg"><div class="detail-stat"><small>Parcelas</small><strong>${ins.filter(i=>i.paidAt).length}/${ins.length}</strong></div></div></div><div class="small text-secondary mb-3"><i class="bi bi-percent me-1"></i>Juros configurados: ${Number(data.settings.lateInterestMonthly ?? 20).toLocaleString('pt-BR')}% ao mês proporcional aos dias de atraso + multa de ${Number(data.settings.lateFeePercent ?? 2).toLocaleString('pt-BR')}%.</div><div class="d-flex flex-wrap gap-2 mb-4">${client.phone?`<button type="button" class="btn btn-outline-success" data-whatsapp-client="${client.id}"><i class="bi bi-whatsapp me-1"></i>WhatsApp</button>`:''}<button class="btn btn-outline-light" data-edit-client="${client.id}" data-bs-dismiss="modal"><i class="bi bi-pencil me-1"></i>Editar</button><button class="btn btn-gold" data-new-purchase="${client.id}"><i class="bi bi-bag-plus me-1"></i>Nova compra</button><button class="btn btn-outline-danger ms-md-auto" data-delete-client="${client.id}"><i class="bi bi-trash me-1"></i>Excluir</button></div><h3 class="h6 mb-3">Compras e parcelas</h3>${renderPurchaseSections(ins,data.settings,client.id)}${client.notes?`<div class="mt-4 p-3 rounded-3 border border-secondary-subtle"><small class="text-secondary d-block mb-1">Observações</small>${escapeHtml(client.notes)}</div>`:''}`;
  detailsModal.show();
}

function renderPurchaseSections(installments, settings, clientId) {
  const groups = [];
  const indexed = new Map();
  for (const item of installments) {
    const key = item.purchaseId || 'legacy-purchase';
    if (!indexed.has(key)) { const group = { items: [] }; indexed.set(key, group); groups.push(group); }
    indexed.get(key).items.push(item);
  }
  return groups.map((group, index) => {
    const total = group.items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const paid = group.items.filter(item => item.paidAt).length;
    const firstOpen = group.items.find(item => !item.paidAt);
    const productName = group.items.find(item => item.purchaseName)?.purchaseName || 'Produto não informado';
    return '<section class="purchase-section mb-4"><div class="d-flex justify-content-between align-items-center flex-wrap gap-3 mb-2"><div><h3 class="h6 mb-1">Compra ' + (index + 1) + ' — ' + escapeHtml(productName) + '</h3><div class="small text-secondary">' + brl.format(total) + ' · ' + paid + '/' + group.items.length + ' parcelas quitadas</div></div>' + (firstOpen ? '<button class="btn btn-sm btn-outline-success" data-toggle-payment="' + firstOpen.id + '" data-client-id="' + clientId + '"><i class="bi bi-cash-coin me-1"></i>Abater valor desta venda</button>' : '<span class="small text-success"><i class="bi bi-check-circle me-1"></i>Venda quitada</span>') + '</div><div class="installment-list">' + group.items.map(item => installmentRow(item, settings, clientId)).join('') + '</div></section>';
  }).join('') || '<div class="empty-state">Nenhuma compra registrada.</div>';
}

function installmentRow(i,settings,clientId){
  const s=installmentStatus(i,settings.dueSoonDays); const calc=calculateLateAmounts(i,settings);
  const paid=Number(i.paidAmount||0);
  const valueHtml = i.paidAt
    ? `<div><strong>${brl.format(paid||i.amount)}</strong><div class="small text-success">Quitada</div></div>`
    : `<div><strong>${brl.format(calc.total)}</strong>${paid>0?`<div class="small text-info">Pago parcial: ${brl.format(paid)}</div>`:''}${calc.daysLate>0?`<div class="small text-warning">+ ${brl.format(calc.interest+calc.fee)} de acréscimos</div>`:''}</div>`;
  return `<div class="installment-row"><strong>#${i.number}</strong><span>${shortDate.format(parseLocalDate(i.dueDate))}</span><span>${valueHtml}</span><span><span class="status-pill status-${s.key}">${s.label}</span></span><button class="btn btn-sm ${i.paidAt?'btn-outline-secondary':'btn-outline-success'}" data-toggle-payment="${i.id}" data-client-id="${clientId}">${i.paidAt?'<i class="bi bi-arrow-counterclockwise me-1"></i>Desfazer':'<i class="bi bi-cash-coin me-1"></i>Registrar pagamento'}</button></div>`
}

function togglePayment(id,clientId,showToast){
  const snapshot=getData(), selected=snapshot.installments.find(x=>x.id===id);
  if(!selected)return;
  if(selected.paidAt){
    if(!confirm('Desfazer o pagamento desta parcela?'))return;
    updateData(data=>{const i=data.installments.find(x=>x.id===id);if(i){i.paidAt=null;delete i.paidAmount;delete i.lateFeePaid;delete i.daysLatePaid;}});
    showToast('Pagamento desfeito.');openClientDetails(clientId,showToast);return;
  }
  document.getElementById('paymentEntryCard')?.remove();
  const due=calculateLateAmounts(selected,snapshot.settings).total;
  const list=document.querySelector('#clientDetailsBody .installment-list');
  if(!list)return;
  list.insertAdjacentHTML('beforebegin',`<div class="payment-entry-card" id="paymentEntryCard">
    <div class="d-flex justify-content-between align-items-start gap-3 mb-3"><div><span class="panel-kicker">Novo recebimento</span><h3 class="h5 mt-1 mb-1">Parcela #${selected.number}</h3><div class="small text-secondary">Saldo atual: ${brl.format(due)}. O excedente pode abater as próximas parcelas.</div></div><button type="button" class="btn-close btn-close-white" aria-label="Fechar" data-payment-cancel></button></div>
    <div class="row g-3 align-items-end"><div class="col-12 col-md-5"><label class="form-label" for="paymentAmount">Valor recebido (R$)</label><input id="paymentAmount" class="form-control form-control-dark" type="number" min="0.01" step="0.01" value="${due.toFixed(2)}" required></div>
    <div class="col-12 col-md-4"><div class="form-check"><input class="form-check-input" id="paymentChargeInterest" type="checkbox" checked><label class="form-check-label small" for="paymentChargeInterest">Calcular juros e multa nas parcelas vencidas</label></div></div>
    <div class="col-12 col-md-3 d-flex gap-2"><button class="btn btn-outline-light flex-fill" type="button" data-payment-cancel>Cancelar</button><button class="btn btn-gold flex-fill" type="button" data-payment-submit="${id}" data-client-id="${clientId}">Registrar</button></div></div></div>`);
  document.getElementById('paymentAmount')?.focus();
}
function registerPayment(id,clientId,showToast){
  const snapshot=getData(), selected=snapshot.installments.find(x=>x.id===id);
  const field=document.getElementById('paymentAmount');
  if(!selected||!field)return;
  const amount=Number(field.value);
  if(!Number.isFinite(amount)||amount<=0){field.classList.add('is-invalid');field.focus();return;}
  const chargeInterest=document.getElementById('paymentChargeInterest')?.checked ?? true;
  const scope=snapshot.installments.filter(x=>x.clientId===clientId && x.purchaseId===selected.purchaseId && !x.paidAt && x.number>=selected.number);
  const maxDue=scope.reduce((sum,i)=>sum+calculateLateAmounts(i,{...snapshot.settings,chargeLateInterest:chargeInterest,chargeLateFee:chargeInterest}).total,0);
  if (amount > maxDue + 0.01) { showToast('Valor superior ao saldo desta venda: ' + brl.format(maxDue)); field.focus(); return; }
  let remaining=amount,appliedTotal=0;
  const allocations=[];
  updateData(data=>{
    const list=data.installments.filter(x=>x.clientId===clientId&&x.purchaseId===selected.purchaseId&&!x.paidAt&&x.number>=selected.number).sort((a,b)=>a.number-b.number);
    for(const inst of list){
      if(remaining<=0.009)break;
      const cfg={...data.settings,chargeLateInterest:chargeInterest,chargeLateFee:chargeInterest};
      const due=calculateLateAmounts(inst,cfg).total;
      const applied=Math.min(remaining,due);
      inst.paidAmount=+(Number(inst.paidAmount||0)+applied).toFixed(2);
      allocations.push({ installmentId: inst.id, amount: +applied.toFixed(2), number: inst.number });
      remaining=+(remaining-applied).toFixed(2);appliedTotal=+(appliedTotal+applied).toFixed(2);
      if(due-applied<=0.009){
        const finalCalc=calculateLateAmounts({...inst,paidAmount:0,paidAt:null},cfg);
        inst.paidAt=new Date().toISOString();
        inst.paidAmount=+(Number(inst.amount||0)+finalCalc.interest+finalCalc.fee).toFixed(2);
        inst.lateFeePaid=finalCalc.fee;inst.daysLatePaid=finalCalc.daysLate;
      }
    }
    data.paymentHistory ||= [];
    data.paymentHistory.push({id:uid('pay'),clientId,clientName:data.clients.find(c=>c.id===clientId)?.name||'Cliente',purchaseId:selected.purchaseId || null,purchaseName:selected.purchaseName||'Produto não informado',amount:appliedTotal,applied:appliedTotal,unapplied:remaining,allocations,chargeInterest,balanceAfter:+data.installments.filter(i=>i.clientId===clientId&&i.purchaseId===selected.purchaseId&&!i.paidAt).reduce((sum,i)=>sum+calculateLateAmounts(i,data.settings).total,0).toFixed(2),createdAt:new Date().toISOString()});
  });
  document.getElementById('paymentEntryCard')?.remove();
  showToast(`Pagamento de ${brl.format(amount)} registrado.`);
  openClientDetails(clientId,showToast);
}
function deleteClient(id,showToast){const data=getData();const c=data.clients.find(x=>x.id===id);if(!c)return;if(!confirm(`Excluir ${c.name} e todas as parcelas?`))return;updateData(d=>{d.clients=d.clients.filter(x=>x.id!==id);d.installments=d.installments.filter(x=>x.clientId!==id)});detailsModal?.hide();showToast('Cliente excluído.');}
function openWhatsApp(id){
  const data=getData(); const c=data.clients.find(x=>x.id===id); if(!c?.phone)return;
  const ins=data.installments.filter(i=>i.clientId===id&&!i.paidAt);
  const saldo=ins.reduce((sum,i)=>sum+calculateLateAmounts(i,data.settings).total,0);
  const acrescimos=ins.reduce((sum,i)=>{const x=calculateLateAmounts(i,data.settings);return sum+x.interest+x.fee},0);
  const perfumes=[...new Set(ins.map(i=>i.purchaseName || 'Produto não informado'))].join(', ');
  const next=ins.sort((a,b)=>a.dueDate.localeCompare(b.dueDate))[0];
  const msg=`Olá, ${c.name}! Passando para lembrar que há um saldo atualizado de ${brl.format(saldo)} na JV Perfumes${perfumes?` referente a: ${perfumes}`:''}${acrescimos>0?` (incluindo ${brl.format(acrescimos)} de acréscimos por atraso)`:''}${next?`, com próxima parcela em ${shortDate.format(parseLocalDate(next.dueDate))}`:''}.`;
  window.open(`https://wa.me/${normalizePhone(c.phone)}?text=${encodeURIComponent(msg)}`,'_blank','noopener')
}

/* ===== inventory.js ===== */

let productModal, moveModal;

function initInventory(showToast) {
  productModal = bootstrap.Modal.getOrCreateInstance('#productModal');
  moveModal = bootstrap.Modal.getOrCreateInstance('#stockMoveModal');
  document.getElementById('productForm').addEventListener('submit', e => saveProduct(e, showToast));
  document.getElementById('stockMoveForm').addEventListener('submit', e => saveMove(e, showToast));
  document.getElementById('productSearch').addEventListener('input', renderInventory);
  document.getElementById('stockFilter').addEventListener('change', renderInventory);
  document.getElementById('productModal').addEventListener('show.bs.modal', e => { if (!e.relatedTarget?.dataset?.editProduct) resetProductForm(); });
  document.addEventListener('click', e => {
    const edit = e.target.closest('[data-edit-product]'); if (edit) openProduct(edit.dataset.editProduct);
    const move = e.target.closest('[data-move-product]'); if (move) openMove(move.dataset.moveProduct);
    const del = e.target.closest('[data-delete-product]'); if (del) deleteProduct(del.dataset.deleteProduct, showToast);
  });
}

function renderInventory() {
  const data = getData();
  const query = foldProductSearch(document.getElementById('productSearch')?.value.trim() || '');
  const filter = document.getElementById('stockFilter')?.value || 'all';
  const stockValue = data.products.reduce((s,p)=>s+Number(p.cost||0)*Number(p.qty||0),0);
  const low = data.products.filter(p=>p.qty<=p.minStock);
  const out = data.products.filter(p=>p.qty<=0);
  document.getElementById('stockKpis').innerHTML = [
    ['bi-boxes','Produtos',data.products.length,'Itens cadastrados'],
    ['bi-exclamation-triangle','Estoque baixo',low.length,'No mínimo ou abaixo'],
    ['bi-x-octagon','Sem estoque',out.length,'Precisam de reposição'],
    ['bi-cash-coin','Valor em estoque',brl.format(stockValue),'Baseado no custo']
  ].map(c=>`<div class="col-6 col-xl-3"><div class="kpi-card"><div class="kpi-icon"><i class="bi ${c[0]}"></i></div><div class="kpi-label mt-3">${c[1]}</div><div class="kpi-value">${c[2]}</div><div class="kpi-foot">${c[3]}</div></div></div>`).join('');
  let products = data.products.filter(p=>foldProductSearch(`${p.name} ${p.category} ${p.brand} ${p.sku}`).includes(query));
  if(filter==='low')products=products.filter(p=>p.qty<=p.minStock); if(filter==='out')products=products.filter(p=>p.qty<=0);
  document.getElementById('productsTable').innerHTML = products.length ? products.map(p=>row(p)).join('') : `<tr><td colspan="8"><div class="empty-state"><i class="bi bi-box-seam"></i>Nenhum produto encontrado.</div></td></tr>`;
}

function foldProductSearch(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function row(p){const status=p.qty<=0?['out','Sem estoque']:p.qty<=p.minStock?['low','Estoque baixo']:['paid','Normal'];return `<tr><td><strong>${escapeHtml(p.name)}</strong><div class="small text-secondary">${escapeHtml(p.brand||'')} ${p.sku?`• ${escapeHtml(p.sku)}`:''}</div></td><td>${escapeHtml(p.category||'—')}</td><td><strong>${p.qty}</strong></td><td>${p.minStock}</td><td>${brl.format(p.cost||0)}</td><td>${brl.format(p.price||0)}</td><td><span class="status-pill status-${status[0]}">${status[1]}</span></td><td class="text-end"><div class="btn-group btn-group-sm"><button class="btn btn-outline-light" data-move-product="${p.id}" title="Movimentar"><i class="bi bi-arrow-left-right"></i></button><button class="btn btn-outline-secondary" data-edit-product="${p.id}" title="Editar"><i class="bi bi-pencil"></i></button><button class="btn btn-outline-danger" data-delete-product="${p.id}" title="Excluir"><i class="bi bi-trash"></i></button></div></td></tr>`}
function resetProductForm(){document.getElementById('productForm').reset();document.getElementById('productId').value='';document.getElementById('productQty').value=0;document.getElementById('productMin').value=2;document.getElementById('productModalTitle').textContent='Novo produto'}
function openProduct(id){const p=getData().products.find(x=>x.id===id);if(!p)return;document.getElementById('productId').value=p.id;document.getElementById('productName').value=p.name;document.getElementById('productCategory').value=p.category||'';document.getElementById('productBrand').value=p.brand||'';document.getElementById('productSku').value=p.sku||'';document.getElementById('productQty').value=p.qty;document.getElementById('productMin').value=p.minStock;document.getElementById('productCost').value=p.cost||0;document.getElementById('productPrice').value=p.price||0;document.getElementById('productModalTitle').textContent='Editar produto';productModal.show()}
function saveProduct(e,showToast){e.preventDefault();const id=document.getElementById('productId').value;const payload={name:document.getElementById('productName').value.trim(),category:document.getElementById('productCategory').value.trim(),brand:document.getElementById('productBrand').value.trim(),sku:document.getElementById('productSku').value.trim(),qty:Number(document.getElementById('productQty').value)||0,minStock:Number(document.getElementById('productMin').value)||0,cost:Number(document.getElementById('productCost').value)||0,price:Number(document.getElementById('productPrice').value)||0};updateData(data=>{if(id){const ix=data.products.findIndex(p=>p.id===id);data.products[ix]={...data.products[ix],...payload,updatedAt:new Date().toISOString()}}else data.products.push({id:uid('prd'),...payload,createdAt:new Date().toISOString()})});productModal.hide();showToast(id?'Produto atualizado.':'Produto cadastrado.')}
function openMove(id){const p=getData().products.find(x=>x.id===id);if(!p)return;document.getElementById('moveProductId').value=id;document.getElementById('moveProductName').textContent=`${p.name} • atual: ${p.qty} un.`;document.getElementById('moveQty').value=1;document.getElementById('moveNote').value='';moveModal.show()}
function saveMove(e,showToast){e.preventDefault();const id=document.getElementById('moveProductId').value;const type=document.getElementById('moveType').value;const qty=Math.max(1,Number(document.getElementById('moveQty').value)||1);const note=document.getElementById('moveNote').value.trim();updateData(data=>{const p=data.products.find(x=>x.id===id);if(!p)return;const delta=type==='in'?qty:-qty;p.qty=Math.max(0,p.qty+delta);data.movements.push({id:uid('mov'),productId:id,type,qty,note,createdAt:new Date().toISOString()})});moveModal.hide();showToast('Estoque atualizado.')}
function deleteProduct(id,showToast){const p=getData().products.find(x=>x.id===id);if(!p)return;if(!confirm(`Excluir ${p.name}?`))return;updateData(d=>{d.products=d.products.filter(x=>x.id!==id);d.movements=d.movements.filter(x=>x.productId!==id)});showToast('Produto excluído.')}

/* ===== notifications.js ===== */

let swRegistration;

async function initNotifications(showToast) {
  const data = getData();
  document.getElementById('dueSoonDays').value = String(data.settings.dueSoonDays ?? 5);
  document.getElementById('dueSoonDays').addEventListener('change', e => {
    updateData(d => d.settings.dueSoonDays = Number(e.target.value));
    showToast('Antecedência atualizada.');
    renderAlerts(); syncAlertsToWorker();
  });
  const interestInput = document.getElementById('lateInterestMonthly');
  const feeInput = document.getElementById('lateFeePercent');
  interestInput.value = String(data.settings.lateInterestMonthly ?? 20);
  feeInput.value = String(data.settings.lateFeePercent ?? 2);
  interestInput.addEventListener('change', e => {
    const value = Math.max(0, Number(e.target.value || 0));
    updateData(d => d.settings.lateInterestMonthly = value);
    showToast(`Juros de atraso definidos em ${value}% ao mês.`);
    renderAlerts(); syncAlertsToWorker();
  });
  feeInput.addEventListener('change', e => {
    const value = Math.max(0, Number(e.target.value || 0));
    updateData(d => d.settings.lateFeePercent = value);
    showToast(`Multa definida em ${value}%.`);
    renderAlerts(); syncAlertsToWorker();
  });
  document.getElementById('enableNotificationsBtn').addEventListener('click', () => requestPermission(showToast));
  document.getElementById('testNotificationBtn').addEventListener('click', () => showTestNotification(showToast));
  await registerWorker();
  updateNotificationStatus();
  renderAlerts();
  await maybeNotifyDueItems();
  await syncAlertsToWorker();
}

async function registerWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    swRegistration = await navigator.serviceWorker.register('./service-worker.js');
    if ('periodicSync' in swRegistration && navigator.permissions?.query) {
      try {
        const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
        if (status.state === 'granted') await swRegistration.periodicSync.register('jv-due-check', { minInterval: 24 * 60 * 60 * 1000 });
      } catch {}
    }
  } catch (e) { console.warn('SW não registrado', e); }
}

async function requestPermission(showToast) {
  if (!('Notification' in window)) { showToast('Este navegador não oferece notificações.'); return; }
  const permission = await Notification.requestPermission();
  updateData(d => d.settings.notificationsEnabled = permission === 'granted');
  updateNotificationStatus();
  if (permission === 'granted') { showToast('Notificações ativadas.'); await showTestNotification(showToast); await syncAlertsToWorker(); }
  else showToast('Permissão de notificação não concedida.');
}

function updateNotificationStatus() {
  const el = document.getElementById('notificationStatus');
  if (!('Notification' in window)) return el.textContent = 'Não suportado neste navegador.';
  el.textContent = Notification.permission === 'granted' ? 'Ativado neste aparelho.' : Notification.permission === 'denied' ? 'Bloqueado pelo navegador. Libere nas permissões do site.' : 'Ainda não ativado.';
}

function renderAlerts() {
  const data = getData();
  const alerts = data.installments.filter(i=>!i.paidAt).map(i=>({i,s:installmentStatus(i,data.settings.dueSoonDays)})).filter(x=>['overdue','soon'].includes(x.s.key)).sort((a,b)=>a.i.dueDate.localeCompare(b.i.dueDate));
  const el=document.getElementById('alertsList');
  el.innerHTML=alerts.length?alerts.map(({i,s})=>{const c=data.clients.find(x=>x.id===i.clientId);return `<div class="stack-item"><div><div class="stack-item-title">${c?.name||'Cliente'}</div><div class="stack-item-meta">Parcela ${i.number} • ${shortDate.format(parseLocalDate(i.dueDate))}</div></div><div class="text-end"><span class="status-pill status-${s.key}">${s.label}</span><div class="small mt-1">${brl.format(calculateLateAmounts(i,data.settings).total)}</div></div></div>`}).join(''):`<div class="empty-state"><i class="bi bi-bell-slash"></i>Nenhum alerta no momento.</div>`;
}

async function showTestNotification(showToast) {
  if (!('Notification' in window) || Notification.permission !== 'granted') { showToast('Ative as notificações primeiro.'); return; }
  const opts = { body:'Teste concluído. Os lembretes da JV Perfumes estão ativos.', icon:'assets/img/icon-192.png', badge:'assets/img/icon-192.png', tag:'jv-test' };
  if (swRegistration) await swRegistration.showNotification('JV Perfumes', opts); else new Notification('JV Perfumes', opts);
}

async function maybeNotifyDueItems() {
  const data=getData();
  if(!data.settings.notificationsEnabled || !('Notification' in window) || Notification.permission!=='granted')return;
  const today=new Date().toISOString().slice(0,10); const key='jvperfumes:last-due-notification'; if(localStorage.getItem(key)===today)return;
  const alerts=data.installments.filter(i=>!i.paidAt).map(i=>({i,s:installmentStatus(i,data.settings.dueSoonDays)})).filter(x=>['overdue','soon'].includes(x.s.key));
  if(!alerts.length)return;
  const overdue=alerts.filter(x=>x.s.key==='overdue').length; const soon=alerts.length-overdue;
  const body=`${alerts.length} cobrança(s) exigem atenção: ${overdue} atrasada(s) e ${soon} próxima(s) do vencimento.`;
  const opts={body,icon:'assets/img/icon-192.png',badge:'assets/img/icon-192.png',tag:'jv-due-summary',renotify:true};
  if(swRegistration)await swRegistration.showNotification('JV Perfumes • Cobranças',opts);else new Notification('JV Perfumes • Cobranças',opts);
  localStorage.setItem(key,today);
}

async function syncAlertsToWorker(){
  if(!navigator.serviceWorker?.controller && swRegistration) await navigator.serviceWorker.ready;
  const data=getData(); const alerts=data.installments.filter(i=>!i.paidAt).map(i=>({i,s:installmentStatus(i,data.settings.dueSoonDays)})).filter(x=>['overdue','soon'].includes(x.s.key));
  const payload={type:'SYNC_ALERTS',alerts:alerts.map(({i,s})=>({clientName:data.clients.find(c=>c.id===i.clientId)?.name||'Cliente',amount:calculateLateAmounts(i,data.settings).total,dueDate:i.dueDate,status:s.key,label:s.label}))};
  (navigator.serviceWorker.controller||swRegistration?.active)?.postMessage(payload);
}

/* ===== app.js ===== */

const toast = bootstrap.Toast.getOrCreateInstance(document.getElementById('appToast'), { delay: 2600 });
const showToast = message => { document.getElementById('toastMessage').textContent = message; toast.show(); };
let currentPage='dashboard';
let deferredInstallPrompt=null;

function showPage(page){
  currentPage=page;
  document.querySelectorAll('.app-page').forEach(s=>s.classList.toggle('d-none',s.id!==`page-${page}`));
  document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  if(page==='dashboard')renderDashboard(); if(page==='clients')renderClients(); if(page==='inventory')renderInventory(); if(page==='notifications')renderAlerts();
  window.scrollTo({top:0,behavior:'smooth'});
}

document.querySelectorAll('[data-page]').forEach(btn=>btn.addEventListener('click',()=>showPage(btn.dataset.page)));
document.addEventListener('click',e=>{const go=e.target.closest('[data-go-page]');if(go)showPage(go.dataset.goPage)});

document.getElementById('exportBtn').addEventListener('click',()=>{exportBackup();showToast('Backup exportado.');});
document.getElementById('importFile').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{await importBackup(file);showToast('Backup restaurado.');refreshAll();}catch(err){showToast(err.message||'Falha ao restaurar backup.')}finally{e.target.value='';}});

window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;const btn=document.getElementById('installBtn');btn.classList.remove('d-none');btn.onclick=async()=>{await deferredInstallPrompt.prompt();deferredInstallPrompt=null;btn.classList.add('d-none')}});

function refreshAll(){renderDashboard();renderClients();renderInventory();renderAlerts();}
window.addEventListener('jv:data-changed',()=>{refreshAll();maybeNotifyDueItems();});

initClients(showToast);
initInventory(showToast);
initNotifications(showToast);
refreshAll();

})();
