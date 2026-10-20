/* JV Perfumes | cobrancas, relatorios, comprovantes e historico.
   Complemento isolado do aplicativo existente; nao cria outro armazenamento. */
(function () {
  'use strict';

  const KEY = 'jvperfumes:data:v1';
  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const dt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
  const folded = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const amount = v => Number(v) || 0;
  const iso = v => { const d = new Date(v); return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10); };
  const dateOf = s => s ? dt.format(new Date(s.slice(0, 10) + 'T12:00:00')) : '—';
  const daysFromToday = str => {
    if (!str) return 999999;
    const today = new Date(); today.setHours(12, 0, 0, 0);
    const d = new Date(str.slice(0, 10) + 'T12:00:00');
    return Math.round((d - today) / 86400000);
  };
  const numberPhone = p => {
    let digits = String(p || '').replace(/\D/g, '');
    if (digits.length === 10 || digits.length === 11) digits = '55' + digits;
    return /^55\d{10,11}$/.test(digits) ? digits : '';
  };
  const getDue = (i, settings = {}) => {
    const principal = Math.max(0, amount(i.amount) - amount(i.paidAmount));
    if (i.paidAt) return 0;
    const late = Math.max(0, -daysFromToday(i.dueDate));
    if (late === 0) return principal;
    const fee = settings.lateFeePercent == null ? 2 : amount(settings.lateFeePercent);
    const interest = settings.lateInterestMonthly == null ? 20 : amount(settings.lateInterestMonthly);
    return principal + (settings.chargeLateFee === false ? 0 : principal * fee / 100) + (settings.chargeLateInterest === false ? 0 : principal * interest / 100 * late / 30);
  };
  const getSales = data => {
    const groups = new Map();
    (data.installments || []).forEach(inst => {
      const key = inst.purchaseId || 'legacy:' + inst.clientId;
      if (!groups.has(key)) groups.set(key, { key, clientId: inst.clientId, installments: [] });
      groups.get(key).installments.push(inst);
    });
    return [...groups.values()].map(g => {
      g.installments.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '') || a.number - b.number);
      const first = g.installments[0];
      g.productName = first.purchaseName || 'Produto não informado';
      g.total = g.installments.reduce((sum, i) => sum + amount(i.amount), 0);
      g.cost = Number.isFinite(Number(first.saleCostTotal)) && first.stockProductId ? amount(first.saleCostTotal) : null;
      g.stockQty = first.stockQty || null;
      g.createdAt = first.createdAt || '';
      g.balance = g.installments.reduce((sum, i) => sum + getDue(i, data.settings), 0);
      g.next = g.installments.filter(i => !i.paidAt)[0] || null;
      return g;
    });
  };

  function fillStockDropdown() {
    const select = document.getElementById('clientStockProduct');
    if (!select) return;
    const data = read();
    const selected = select.value;
    const opts = (data.products || []).slice().sort((a,b) => folded(a.name).localeCompare(folded(b.name))).map(p =>
      '<option value="' + esc(p.id) + '"' + (amount(p.qty) < 1 ? ' disabled' : '') + '>' + esc(p.name) + ' (' + amount(p.qty) + ' un. · ' + money.format(amount(p.price)) + ')</option>'
    ).join('');
    select.innerHTML = '<option value="">Venda sem movimentar estoque</option>' + opts;
    if ([...select.options].some(o => o.value === selected && !o.disabled)) select.value = selected;
    updateStockHint(false);
  }

  function updateStockHint(fill) {
    const select = document.getElementById('clientStockProduct');
    const qtyInput = document.getElementById('clientStockQty');
    const hint = document.getElementById('clientStockHint');
    if (!select || !qtyInput || !hint) return;
    const p = (read().products || []).find(x => x.id === select.value);
    const qty = Math.max(1, Math.trunc(amount(qtyInput.value) || 1));
    if (!p) { hint.textContent = 'Sem vínculo: esta compra não movimentará o estoque nem entrará no cálculo de lucro.'; return; }
    const hasStock = amount(p.qty) >= qty;
    hint.textContent = hasStock
      ? 'Disponível: ' + p.qty + ' un. · Baixa automática: ' + qty + ' un. · Custo estimado: ' + money.format(amount(p.cost) * qty)
      : 'Estoque insuficiente: apenas ' + p.qty + ' unidade(s) disponíveis.';
    hint.classList.toggle('text-danger', !hasStock);
    hint.classList.toggle('text-secondary', hasStock);
    if (fill) {
      const purchase = document.getElementById('clientPurchaseProduct');
      const total = document.getElementById('clientTotal');
      if (purchase && (!purchase.value.trim() || purchase.dataset.stockFilled === 'yes')) {
        purchase.value = p.name; purchase.dataset.stockFilled = 'yes';
      }
      if (total && (!total.value || total.dataset.stockFilled === 'yes')) {
        total.value = (amount(p.price) * qty).toFixed(2); total.dataset.stockFilled = 'yes';
      }
    }
  }

  let collectionFilter = 'today';
  function renderCollections() {
    const box = document.getElementById('collectionsTable'); if (!box) return;
    const data = read(), clients = data.clients || [], settings = data.settings || {};
    const query = folded(document.getElementById('collectionSearch')?.value || '');
    let sales = getSales(data).filter(s => s.next);
    sales = sales.filter(s => {
      const days = daysFromToday(s.next.dueDate);
      if (collectionFilter === 'today' && days !== 0) return false;
      if (collectionFilter === 'week' && (days < 1 || days > 7)) return false;
      if (collectionFilter === 'overdue' && days >= 0) return false;
      const c = clients.find(c => c.id === s.clientId);
      return !query || folded((c?.name || '') + ' ' + (c?.phone || '') + ' ' + s.productName).includes(query);
    }).sort((a,b) => a.next.dueDate.localeCompare(b.next.dueDate));
    document.querySelectorAll('[data-collection-filter]').forEach(btn => {
      const active = btn.dataset.collectionFilter === collectionFilter;
      btn.classList.toggle('btn-gold', active);
      btn.classList.toggle('btn-outline-light', !active);
    });
    const total = sales.reduce((sum,s) => sum + s.balance, 0);
    document.getElementById('collectionSummary').textContent = sales.length + ' compra(s) · ' + money.format(total) + ' em aberto';
    box.innerHTML = sales.length ? sales.map(s => {
      const c = clients.find(c => c.id === s.clientId), days = daysFromToday(s.next.dueDate);
      const state = days < 0 ? ['overdue','Atrasado'] : days === 0 ? ['soon','Hoje'] : ['open','A vencer'];
      return '<tr><td><strong>' + esc(c?.name || 'Cliente excluído') + '</strong><div class="small text-secondary">' + esc(c?.phone || '') + '</div></td>'
        + '<td>' + esc(s.productName) + '<div class="small text-secondary">' + s.installments.length + ' parcela(s)</div></td>'
        + '<td>' + dateOf(s.next.dueDate) + '</td><td><strong>' + money.format(s.balance) + '</strong></td>'
        + '<td><span class="status-pill status-' + state[0] + '">' + state[1] + '</span></td><td><div class="d-flex flex-wrap gap-1">'
        + '<button class="btn btn-sm btn-outline-light" data-open-client="' + esc(s.clientId) + '">Ver venda</button>'
        + (numberPhone(c?.phone) ? '<button class="btn btn-sm btn-outline-success" data-pro-whatsapp="' + esc(s.key) + '" data-pro-client="' + esc(s.clientId) + '" title="Preparar cobrança no WhatsApp"><i class="bi bi-whatsapp"></i></button>' : '')
        + '</div></td></tr>';
    }).join('') : '<tr><td colspan="6"><div class="empty-state"><i class="bi bi-check-circle"></i>Nenhuma cobrança neste filtro.</div></td></tr>';
  }

  function reportDetails() {
    const data = read(), sales = getSales(data);
    const month = document.getElementById('reportMonth')?.value || new Date().toLocaleDateString('sv-SE').slice(0,7);
    const periodSales = sales.filter(s => (s.createdAt || '').slice(0,7) === month);
    const payments = (data.paymentHistory || []).filter(p => (p.createdAt || '').slice(0,7) === month && !p.reversedAt);
    const sold = periodSales.reduce((sum,s) => sum + s.total, 0);
    const received = payments.reduce((sum,p) => sum + amount(p.applied ?? p.amount), 0);
    const costed = periodSales.filter(s => s.cost !== null);
    const estimated = costed.reduce((sum,s) => sum + s.total - s.cost, 0);
    const outstanding = sales.reduce((sum,s) => sum + s.balance,0);
    return {data,sales,month,periodSales,payments,sold,received,costed,estimated,outstanding};
  }

  function renderFinance() {
    const el = document.getElementById('proFinanceKpis'); if (!el) return;
    const r = reportDetails();
    el.innerHTML = [
      ['bi-bag-check','Vendas do mês',money.format(r.sold),r.periodSales.length + ' compra(s) registradas'],
      ['bi-wallet2','Recebido no mês',money.format(r.received),r.payments.length + ' pagamento(s) no histórico'],
      ['bi-graph-up-arrow','Lucro estimado',money.format(r.estimated),r.costed.length + ' venda(s) vinculada(s) ao estoque']
    ].map(k => '<div class="col-12 col-md-4"><div class="kpi-card"><div class="kpi-icon"><i class="bi ' + k[0] + '"></i></div><div class="kpi-label mt-2">' + k[1] + '</div><div class="kpi-value">' + k[2] + '</div><div class="kpi-foot">' + k[3] + '</div></div></div>').join('');
  }

  function renderReports() {
    const cards = document.getElementById('reportCards'); if (!cards) return;
    const r = reportDetails();
    cards.innerHTML = [
      ['Vendido no período',money.format(r.sold),r.periodSales.length + ' compra(s)'],
      ['Recebido no período',money.format(r.received),r.payments.length + ' recebimento(s) registrado(s)'],
      ['Lucro estimado',money.format(r.estimated),r.costed.length + ' venda(s) com custo'],
      ['Saldo geral a receber',money.format(r.outstanding),'Todas as compras ainda abertas']
    ].map(x => '<div class="col-6 col-xl-3"><div class="kpi-card"><div class="kpi-label">' + x[0] + '</div><div class="kpi-value">' + x[1] + '</div><div class="kpi-foot">' + x[2] + '</div></div></div>').join('');
    const groups = new Map();
    for (const sale of r.periodSales) {
      const name = sale.productName, entry = groups.get(name) || {name,count:0,total:0,cost:0,covered:0};
      entry.count++; entry.total += sale.total;
      if (sale.cost !== null) { entry.covered += sale.total; entry.cost += sale.cost; }
      groups.set(name,entry);
    }
    document.getElementById('reportProducts').innerHTML = [...groups.values()].sort((a,b) => b.total - a.total).map(g =>
      '<tr><td>' + esc(g.name) + '</td><td>' + g.count + '</td><td>' + money.format(g.total) + '</td><td>' + (g.covered ? money.format(g.cost) : 'Não informado') + '</td><td>' + (g.covered ? money.format(g.covered - g.cost) + (g.covered < g.total ? ' (parcial)' : '') : '—') + '</td></tr>'
    ).join('') || '<tr><td colspan="5"><div class="empty-state">Nenhuma venda registrada neste mês.</div></td></tr>';
    document.getElementById('reportPayments').innerHTML = r.payments.length ? r.payments.slice().sort((a,b) => (b.createdAt || '').localeCompare(a.createdAt || '')).map(p =>
      '<div class="stack-item"><div><div class="stack-item-title">' + esc(p.clientName || r.data.clients?.find(c => c.id === p.clientId)?.name || 'Cliente') + '</div><div class="stack-item-meta">' + esc(p.purchaseName || 'Perfume não informado') + ' · ' + dateOf(p.createdAt) + '</div></div><div class="d-flex gap-2 align-items-center"><strong>' + money.format(amount(p.applied ?? p.amount)) + '</strong><button class="btn btn-sm btn-outline-gold" data-pro-receipt="' + esc(p.id) + '" title="Comprovante"><i class="bi bi-receipt"></i></button></div></div>'
    ).join('') : '<div class="empty-state">Nenhum recebimento registrado neste período.</div>';
  }

  function renderHistory() {
    const body = document.getElementById('clientDetailsBody'); if (!body) return;
    const clientId = body.querySelector('[data-new-purchase]')?.dataset.newPurchase;
    if (!clientId) return;
    body.querySelector('#proClientHistory')?.remove();
    const data = read();
    const sales = getSales(data).filter(s => s.clientId === clientId);
    const payments = (data.paymentHistory || []).filter(p => p.clientId === clientId && !p.reversedAt).slice().sort((a,b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const client = (data.clients || []).find(c => c.id === clientId);
    const saleRows = sales.map(s => '<div class="stack-item"><div><strong>' + esc(s.productName) + '</strong><div class="stack-item-meta">' + dateOf(s.createdAt) + ' · ' + money.format(s.total) + ' · ' + (s.balance > 0.01 ? 'Saldo: ' + money.format(s.balance) : 'Quitada') + '</div></div>' +
       (numberPhone(client?.phone) && s.next ? '<button class="btn btn-sm btn-outline-success" data-pro-whatsapp="' + esc(s.key) + '" data-pro-client="' + esc(clientId) + '"><i class="bi bi-whatsapp"></i><span class="d-none d-sm-inline"> Cobrar</span></button>' : '') + '</div>').join('');
    const paymentRows = payments.map(p => '<div class="stack-item"><div><strong>' + money.format(amount(p.applied ?? p.amount)) + ' recebido</strong><div class="stack-item-meta">' + dateOf(p.createdAt) + ' · ' + esc(p.purchaseName || sales.find(s => s.key === p.purchaseId)?.productName || 'Compra não informada') + '</div></div><button class="btn btn-sm btn-outline-gold" data-pro-receipt="' + esc(p.id) + '"><i class="bi bi-receipt me-1"></i>Recibo</button></div>').join('');
    body.insertAdjacentHTML('beforeend','<section id="proClientHistory" class="mt-4"><div class="panel-kicker">Relacionamento</div><h3 class="h5 mt-1 mb-3">Histórico completo</h3><h4 class="h6">Compras</h4><div class="stack-list mb-4">' + (saleRows || '<div class="small text-secondary">Nenhuma compra.</div>') + '</div><h4 class="h6">Pagamentos registrados</h4><div class="stack-list">' + (paymentRows || '<div class="small text-secondary">Ainda não há pagamentos no histórico de recebimentos.</div>') + '</div></section>');
  }

  function sendWhatsApp(clientId, saleKey) {
    const data = read(), c = (data.clients || []).find(c => c.id === clientId);
    const phone = numberPhone(c?.phone);
    if (!phone) { alert('Cadastre um telefone válido com DDD antes de cobrar.'); return; }
    const sale = getSales(data).find(s => s.clientId === clientId && s.key === saleKey);
    if (!sale || !sale.next) { alert('Esta compra não possui parcelas em aberto.'); return; }
    const open = sale.installments.filter(i => !i.paidAt);
    const due = open[0].dueDate;
    const text = 'Olá, ' + c.name + '! Tudo bem? Aqui é da JV Perfumes. ' +
      'Passando para lembrar sobre o perfume ' + sale.productName + '. ' +
      'Sua próxima parcela vence em ' + dateOf(due) + ', no valor atualizado de ' + money.format(getDue(open[0], data.settings)) +
      '. O saldo atualizado desta compra é ' + money.format(sale.balance) +
      '. Caso já tenha efetuado o pagamento, por favor desconsidere. Obrigado!';
    window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(text), '_blank', 'noopener,noreferrer');
  }

  function ensureReceiptModal() {
    if (document.getElementById('proReceiptModal')) return;
    document.body.insertAdjacentHTML('beforeend', '<div class="modal fade" tabindex="-1" id="proReceiptModal"><div class="modal-dialog modal-dialog-centered"><div class="modal-content modal-dark"><div class="modal-header"><h2 class="modal-title h5">Comprovante de pagamento</h2><button class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div><div class="modal-body"><div id="receiptPrintSection"></div><p class="small text-secondary mt-3 mb-0">Recibo gerado com base no pagamento registrado no sistema. Não é documento fiscal.</p></div><div class="modal-footer"><button class="btn btn-outline-light" data-bs-dismiss="modal">Fechar</button><button class="btn btn-gold" id="proPrintReceipt"><i class="bi bi-printer me-1"></i>Imprimir / salvar PDF</button></div></div></div></div>');
    document.getElementById('proPrintReceipt').addEventListener('click', () => {
      document.body.classList.add('pro-print-receipt');
      window.print();
    });
  }
  function showReceipt(id) {
    const data = read(), p = (data.paymentHistory || []).find(x => x.id === id && !x.reversedAt);
    if (!p) { alert('Pagamento não encontrado no histórico.'); return; }
    ensureReceiptModal();
    const c = (data.clients || []).find(x => x.id === p.clientId);
    const sale = getSales(data).find(s => s.clientId === p.clientId && s.key === (p.purchaseId || 'legacy:' + p.clientId));
    const balanceAfter = p.balanceAfter != null ? money.format(amount(p.balanceAfter)) : 'Não registrado na data';
    document.getElementById('receiptPrintSection').innerHTML =
      '<div class="pro-receipt"><div class="text-center mb-4"><div class="pro-receipt-brand">JV PERFUMES</div><div class="small">Comprovante de recebimento</div></div>'
      + '<div class="pro-receipt-line"><span>Recibo</span><strong>' + esc(p.id) + '</strong></div>'
      + '<div class="pro-receipt-line"><span>Cliente</span><strong>' + esc(p.clientName || c?.name || 'Cliente') + '</strong></div>'
      + '<div class="pro-receipt-line"><span>Produto</span><strong>' + esc(p.purchaseName || sale?.productName || 'Produto não informado') + '</strong></div>'
      + '<div class="pro-receipt-line"><span>Data</span><strong>' + dateOf(p.createdAt) + '</strong></div>'
      + '<div class="pro-receipt-line"><span>Saldo após pagamento</span><strong>' + balanceAfter + '</strong></div>'
      + '<div class="pro-receipt-total"><span>Valor recebido</span><strong>' + money.format(amount(p.applied ?? p.amount)) + '</strong></div>'
      + '<div class="small text-center mt-4">JV Perfumes · Registro de pagamento</div></div>';
    bootstrap.Modal.getOrCreateInstance('#proReceiptModal').show();
  }

  document.addEventListener('click', e => {
    const tab = e.target.closest('[data-collection-filter]');
    if (tab) { collectionFilter = tab.dataset.collectionFilter; renderCollections(); }
    const whatsapp = e.target.closest('[data-pro-whatsapp]');
    if (whatsapp) sendWhatsApp(whatsapp.dataset.proClient, whatsapp.dataset.proWhatsapp);
    const receipt = e.target.closest('[data-pro-receipt]');
    if (receipt) showReceipt(receipt.dataset.proReceipt);
    if (e.target.closest('[data-payment-submit]')) setTimeout(renderHistory, 0);
  });
  document.getElementById('collectionSearch')?.addEventListener('input', renderCollections);
  document.getElementById('reportMonth')?.addEventListener('change', () => { renderReports(); renderFinance(); });
  document.getElementById('reportPrintBtn')?.addEventListener('click', () => { document.body.classList.add('pro-print-report'); window.print(); });
  window.addEventListener('afterprint', () => document.body.classList.remove('pro-print-receipt','pro-print-report'));
  document.getElementById('clientModal')?.addEventListener('show.bs.modal', () => {
    fillStockDropdown();
    const purchase = document.getElementById('clientPurchaseProduct'), total = document.getElementById('clientTotal');
    if (purchase) delete purchase.dataset.stockFilled;
    if (total) delete total.dataset.stockFilled;
  });
  document.getElementById('clientStockProduct')?.addEventListener('change', () => updateStockHint(true));
  document.getElementById('clientStockQty')?.addEventListener('input', () => updateStockHint(true));
  document.getElementById('clientDetailsModal')?.addEventListener('show.bs.modal', renderHistory);
  document.getElementById('clientDetailsModal')?.addEventListener('shown.bs.modal', renderHistory);
  document.querySelectorAll('[data-page="reports"],[data-go-page="reports"]').forEach(b => b.addEventListener('click', renderReports));
  document.querySelectorAll('[data-page="collections"],[data-go-page="collections"]').forEach(b => b.addEventListener('click', renderCollections));
  window.addEventListener('jv:data-changed', () => { renderCollections(); renderFinance(); renderReports(); });
  const now = new Date();
  document.getElementById('reportMonth').value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  renderFinance();
  renderCollections();
  renderReports();
})();
