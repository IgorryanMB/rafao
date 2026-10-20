import { addMonths, brl, calculateLateAmounts, escapeHtml, initials, installmentStatus, isoDate, normalizePhone, parseLocalDate, shortDate, uid } from './utils.js';
import { getData, updateData } from './storage.js';

let clientModal, detailsModal, purchaseClientId = null;

export function initClients(showToast) {
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

export function renderClients() {
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

export function openClientDetails(id, showToast = ()=>{}) {
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
