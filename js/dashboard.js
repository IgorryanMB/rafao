import { brl, calculateLateAmounts, escapeHtml, installmentStatus, shortDate, parseLocalDate } from './utils.js';
import { getData } from './storage.js';

let chart;

export function getMetrics(data = getData()) {
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

export function renderDashboard() {
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
    return `<div class="stack-item"><div><div class="stack-item-title">${escapeHtml(client?.name || p.clientName || 'Cliente removido')}</div><div class="stack-item-meta">${escapeHtml(p.purchaseName || 'Compra não informada')} · ${date}</div></div><div class="d-flex align-items-center gap-2"><span class="stack-badge">${brl.format(Number(p.applied ?? p.amount ?? 0))}</span><button class="btn btn-sm btn-outline-gold" data-pro-receipt="${escapeHtml(p.id)}" title="Comprovante"><i class="bi bi-receipt"></i></button></div></div>`;
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
