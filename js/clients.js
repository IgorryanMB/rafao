import { addMonths, brl, calculateLateAmounts, escapeHtml, initials, installmentStatus, isoDate, normalizePhone, parseLocalDate, shortDate, uid } from './utils.js';
import { getData, updateData } from './storage.js';

let clientModal, detailsModal, purchaseClientId = null;

export function initClients(showToast) {
  clientModal = bootstrap.Modal.getOrCreateInstance('#clientModal');
  detailsModal = bootstrap.Modal.getOrCreateInstance('#clientDetailsModal');

  document.querySelectorAll('[data-open-client-modal]').forEach(btn => btn.addEventListener('click', () => openClientModal()));
  document.getElementById('clientForm').addEventListener('submit', e => saveClient(e, showToast));
  document.getElementById('purchaseEditForm').addEventListener('submit', e => saveEditedPurchase(e, showToast));
  document.getElementById('clientSearch').addEventListener('input', renderClients);
  document.getElementById('clientStatusFilter').addEventListener('change', renderClients);

  document.addEventListener('click', e => {
    const open = e.target.closest('[data-open-client]');
    if (open) openClientDetails(open.dataset.openClient, showToast);
    const edit = e.target.closest('[data-edit-client]');
    if (edit) closeClientDetailsThen(() => openClientModal(edit.dataset.editClient));
    const newPurchase = e.target.closest('[data-new-purchase]');
    if (newPurchase) { const clientId = newPurchase.dataset.newPurchase; closeClientDetailsThen(() => openPurchaseModal(clientId)); }
    const editPurchase = e.target.closest('[data-edit-purchase]');
    if (editPurchase) { const clientId = editPurchase.dataset.clientId, purchaseKey = editPurchase.dataset.editPurchase; closeOrderParentThen(() => openPurchaseEditor(clientId, purchaseKey)); }
    const editOrders = e.target.closest('[data-edit-orders]');
    if (editOrders) { const id = editOrders.dataset.editOrders, groups = clientOrderGroups(id); if (groups.length === 1) closeOrderParentThen(() => openPurchaseEditor(id, groups[0][0])); else openClientDetails(id, showToast); }
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
  const principalPaid = ins.reduce((sum,i)=>sum+Math.min(Number(i.amount||0),Number(i.paidAmount ?? (i.paidAt ? i.amount : 0))),0);
  const progress = total > 0 ? Math.min(100,Math.round((principalPaid/total)*100)) : 0;
  const hasOverdue = ins.some(i=>installmentStatus(i,dueDays).key==='overdue');
  const status = open <= .001 ? ['paid','Quitado'] : hasOverdue ? ['overdue','Em atraso'] : ['open','Em aberto'];
  const ordersCount = new Set(ins.map(i => i.purchaseId || 'legacy-purchase')).size;
  return `<div class="col-12 col-md-6 col-xxl-4"><div class="client-card"><div class="client-top"><div class="d-flex gap-3"><div class="client-avatar">${initials(client.name)}</div><div><div class="client-name">${escapeHtml(client.name)}</div><div class="client-meta">${escapeHtml(client.phone || client.email || 'Sem contato')}</div></div></div><span class="status-pill status-${status[0]}">${status[1]}</span></div><div class="money-row"><div class="money-block"><small>Contrato</small><strong>${brl.format(total)}</strong></div><div class="money-block text-end"><small>Saldo atualizado</small><strong>${brl.format(open)}</strong></div></div><div class="d-flex justify-content-between small text-secondary mt-3"><span>${paidCount}/${ins.length} parcelas quitadas</span><span>${progress}% do valor pago</span></div><div class="progress mt-2"><div class="progress-bar" style="width:${progress}%"></div></div><div class="client-actions"><button type="button" class="btn btn-sm btn-outline-light" data-open-client="${client.id}"><i class="bi bi-eye me-1"></i>Ver pedidos</button><button type="button" class="btn btn-sm btn-outline-gold" data-edit-orders="${client.id}"><i class="bi bi-pencil-square me-1"></i>${ordersCount === 1 ? 'Editar pedido' : 'Editar pedidos'}</button><button type="button" class="btn btn-sm btn-outline-secondary" data-edit-client="${client.id}"><i class="bi bi-person-gear me-1"></i>Dados</button>${client.phone ? `<button type="button" class="btn btn-sm btn-outline-success" data-whatsapp-client="${client.id}" aria-label="WhatsApp de ${escapeHtml(client.name)}"><i class="bi bi-whatsapp"></i></button>` : ''}</div></div></div>`;
}
function closeClientDetailsThen(callback) {
  const el = document.getElementById('clientDetailsModal');
  if (el && el.classList.contains('show')) {
    el.addEventListener('hidden.bs.modal', callback, { once: true });
    detailsModal.hide();
  } else callback();
}
function setClientModalMode(editing) {
  const sale = document.getElementById('clientSaleFields');
  const hint = document.getElementById('clientEditHint');
  sale.classList.toggle('d-none', editing);
  hint.classList.toggle('d-none', !editing);
  document.getElementById('clientOrdersInEdit').classList.toggle('d-none', !editing);
  ['clientTotal','clientInstallments','clientFirstDue','clientPurchaseProduct','clientStockProduct','clientStockQty'].forEach(fieldId => {
    document.getElementById(fieldId).disabled = editing;
  });
  document.getElementById('clientSaveButton').textContent = editing ? 'Salvar dados do cliente' : 'Salvar compra';
}


function purchaseRows(data, clientId, key) {
  return data.installments.filter(i => i.clientId === clientId && (i.purchaseId || 'legacy-purchase') === key)
    .sort((a,b) => Number(a.number || 0) - Number(b.number || 0));
}

function clientOrderGroups(clientId) {
  const data = getData(), groups = new Map();
  for (const i of data.installments.filter(i => i.clientId === clientId)) {
    const key = i.purchaseId || 'legacy-purchase';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  }
  return [...groups.entries()];
}

function renderOrdersInClientEditor(clientId) {
  const list = document.getElementById('clientOrdersList');
  if (!list) return;
  const groups = clientOrderGroups(clientId);
  list.innerHTML = groups.length ? groups.map(([key, rows], index) => {
    const name = rows.find(i => i.purchaseName)?.purchaseName || 'Produto não informado';
    const total = rows.reduce((s,i) => s + Number(i.amount || 0), 0);
    const paid = rows.filter(i => i.paidAt).length;
    return '<div class="stack-item"><div class="flex-grow-1"><div class="stack-item-title">Pedido ' + (index + 1) + ' — ' + escapeHtml(name) + '</div>'
      + '<div class="stack-item-meta">' + brl.format(total) + ' · ' + paid + '/' + rows.length + ' parcela(s) quitada(s)</div></div>'
      + '<button type="button" class="btn btn-sm btn-outline-gold flex-shrink-0" data-edit-purchase="' + escapeHtml(key) + '" data-client-id="' + escapeHtml(clientId) + '"><i class="bi bi-pencil-square me-1"></i>Editar pedido</button></div>';
  }).join('') : '<div class="small text-secondary">Este cliente ainda não possui pedidos.</div>';
}

function closeOrderParentThen(callback) {
  const visible = [document.getElementById('clientDetailsModal'), document.getElementById('clientModal')]
    .find(el => el?.classList.contains('show'));
  if (!visible) { callback(); return; }
  visible.addEventListener('hidden.bs.modal', callback, { once: true });
  bootstrap.Modal.getOrCreateInstance(visible).hide();
}

function fillPurchaseStockSelector(productId, qty) {
  const data = getData(), select = document.getElementById('purchaseEditStockProduct');
  select.innerHTML = '<option value="">Venda sem vínculo de estoque</option>' + data.products
    .slice().sort((a,b) => String(a.name).localeCompare(String(b.name), 'pt-BR'))
    .map(p => '<option value="' + escapeHtml(p.id) + '">' + escapeHtml(p.name) + ' (' + p.qty + ' un.)</option>').join('');
  if (productId && !data.products.some(p => p.id === productId)) {
    select.insertAdjacentHTML('beforeend','<option value="' + escapeHtml(productId) + '">Produto original removido do estoque</option>');
  }
  select.value = productId || '';
  document.getElementById('purchaseEditStockQty').value = Number(qty) > 0 ? String(qty) : '1';
  updatePurchaseStockHint();
}

function updatePurchaseStockHint(autoName = false) {
  const clientId = document.getElementById('purchaseEditClientId').value;
  const key = document.getElementById('purchaseEditId').value;
  const rows = purchaseRows(getData(), clientId, key);
  const old = rows[0] || {};
  const selected = document.getElementById('purchaseEditStockProduct').value;
  const qty = Number(document.getElementById('purchaseEditStockQty').value);
  const product = getData().products.find(p => p.id === selected);
  const label = document.getElementById('purchaseEditStockHint');
  label.classList.remove('text-danger');
  if (!selected) {
    label.textContent = old.stockProductId ? 'Ao salvar, as unidades originalmente baixadas retornarão ao estoque.' : 'Pedido avulso, sem movimentação de estoque.';
    return;
  }
  if (!product) {
    label.textContent = 'O produto original não está mais cadastrado. Recrie-o antes de alterar o vínculo.';
    label.classList.add('text-danger');
    return;
  }
  const available = Number(product.qty || 0) + (old.stockProductId === selected ? Number(old.stockQty || 0) : 0);
  const valid = Number.isInteger(qty) && qty >= 1 && qty <= available;
  label.textContent = valid
    ? 'Disponível para este pedido: ' + available + ' un. · Quantidade selecionada: ' + qty + ' un.'
    : 'Quantidade inválida ou insuficiente. Disponíveis para este pedido: ' + available + ' un.';
  if (!valid) label.classList.add('text-danger');
  if (autoName && product) document.getElementById('purchaseEditName').value = product.name;
}

function openPurchaseEditor(clientId, purchaseKey) {
  const data = getData(), client = data.clients.find(c => c.id === clientId);
  const items = purchaseRows(data, clientId, purchaseKey);
  if (!client || !items.length) return;
  const paid = items.filter(i => i.paidAt);
  const first = items[0];
  document.getElementById('purchaseEditClientId').value = clientId;
  document.getElementById('purchaseEditId').value = purchaseKey;
  document.getElementById('purchaseEditName').value = items.find(i => i.purchaseName)?.purchaseName || '';
  document.getElementById('purchaseEditTotal').value = items.reduce((sum,i) => sum + Number(i.amount || 0),0).toFixed(2);
  document.getElementById('purchaseEditCount').value = items.length;
  document.getElementById('purchaseEditDue').value = first.dueDate;
  document.getElementById('purchaseEditTitle').textContent = 'Editar pedido — ' + client.name;
  ['purchaseEditTotal','purchaseEditCount','purchaseEditDue'].forEach(id => document.getElementById(id).disabled = false);
  fillPurchaseStockSelector(first.stockProductId || '', first.stockQty || 1);
  document.getElementById('purchaseEditHint').textContent = paid.length
    ? paid.length + ' parcela(s) já quitada(s). Você pode editar o pedido e redistribuir o saldo restante, mas valores e datas de parcelas quitadas serão preservados. Não é possível reduzir o total abaixo do que já foi pago.'
    : 'Altere perfume, valor, quantidade, parcelas e vencimento. Pagamentos parciais existentes continuarão vinculados ao pedido.';
  bootstrap.Modal.getOrCreateInstance('#purchaseEditModal').show();
}

function editPurchaseSchedule(items, total, count, firstDue, name, stockMeta) {
  const moneyToCents = value => Math.round(Number(value || 0) * 100);
  const paidRows = items.filter(i => Boolean(i.paidAt));
  const partiallyPaid = items.filter(i => !i.paidAt && Number(i.paidAmount || 0) > 0);
  const protectedRows = [...paidRows, ...partiallyPaid];
  const highestProtectedNumber = protectedRows.reduce((max, i) => Math.max(max, Number(i.number || 0)), 0);
  if (count < highestProtectedNumber) throw new Error('Existem pagamentos até a parcela ' + highestProtectedNumber + '. Não é possível reduzir a quantidade abaixo disso.');
  const settledNumbers = new Set(paidRows.map(i => Number(i.number)));
  const fixedCents = paidRows.reduce((sum,i) => sum + moneyToCents(i.amount), 0);
  const partiallyPaidCents = partiallyPaid.reduce((sum,i) => sum + moneyToCents(i.paidAmount), 0);
  const editableNumbers = Array.from({length: count}, (_, n) => n + 1).filter(n => !settledNumbers.has(n));
  const totalCents = moneyToCents(total);
  const remainderCents = totalCents - fixedCents - partiallyPaidCents;
  if (!editableNumbers.length && totalCents !== fixedCents)
    throw new Error('Pedido quitado: mantenha o valor total ou aumente o número de parcelas para adicionar saldo.');
  if (remainderCents < editableNumbers.length)
    throw new Error('O novo total precisa cobrir os pagamentos já recebidos e manter pelo menos R$ 0,01 em cada parcela ainda aberta.');
  const oldByNumber = new Map(items.map(i => [Number(i.number), i]));
  const each = editableNumbers.length ? Math.floor(remainderCents / editableNumbers.length) : 0;
  let remainder = editableNumbers.length ? remainderCents % editableNumbers.length : 0;
  const next = [];
  for (let number = 1; number <= count; number++) {
    const old = oldByNumber.get(number);
    if (settledNumbers.has(number)) {
      next.push({...old, purchaseName: name, ...stockMeta});
      continue;
    }
    const hasPartial = Number(old?.paidAmount || 0) > 0;
    const prepaid = hasPartial ? moneyToCents(old.paidAmount) : 0;
    const delta = each + (remainder-- > 0 ? 1 : 0);
    const newAmount = (prepaid + delta) / 100;
    const dueDate = isoDate(addMonths(firstDue, number - 1));
    const details = { id: old?.id || uid('par'), clientId: items[0].clientId,
      number, amount: newAmount, dueDate, paidAt: null,
      ...(old?.purchaseId ? { purchaseId: old.purchaseId } : {}),
      purchaseName: name, ...stockMeta,
      createdAt: old?.createdAt || items[0].createdAt || new Date().toISOString() };
    if (hasPartial) details.paidAmount = Number(old.paidAmount);
    next.push(details);
  }
  return next;
}

function planStockChange(data, current, newProductId, newQty) {
  const oldProductId = current.stockProductId || '';
  const oldQty = oldProductId ? Number(current.stockQty || 0) : 0;
  const changed = oldProductId !== newProductId || (newProductId && oldQty !== newQty);
  const oldProduct = data.products.find(p => p.id === oldProductId);
  const newProduct = data.products.find(p => p.id === newProductId);
  if (!changed) return {changed: false, stockMeta: oldProductId ? {
    stockProductId: oldProductId, stockQty: oldQty,
    saleCostTotal: Number(current.saleCostTotal || 0)
  } : {}};
  if (oldProductId && !oldProduct)
    throw new Error('Produto original não encontrado no estoque. Cadastre-o novamente antes de alterar o vínculo.');
  if (newProductId && !newProduct) throw new Error('Selecione um produto válido do estoque.');
  if (newProductId && (!Number.isInteger(newQty) || newQty < 1))
    throw new Error('Informe uma quantidade válida de unidades.');
  const available = newProduct ? Number(newProduct.qty || 0) + (oldProductId === newProductId ? oldQty : 0) : 0;
  if (newProduct && newQty > available)
    throw new Error('Estoque insuficiente. Disponível para este pedido: ' + available + ' unidade(s).');
  return {changed:true, oldProduct, oldQty, newProduct, newQty,
    stockMeta: newProduct ? {stockProductId:newProduct.id, stockQty:newQty, saleCostTotal:+(Number(newProduct.cost || 0)*newQty).toFixed(2)} : {} };
}

function saveEditedPurchase(e, showToast) {
  e.preventDefault();
  const clientId = document.getElementById('purchaseEditClientId').value;
  const key = document.getElementById('purchaseEditId').value;
  const name = document.getElementById('purchaseEditName').value.trim();
  const total = Number(document.getElementById('purchaseEditTotal').value);
  const count = Number(document.getElementById('purchaseEditCount').value);
  const firstDue = parseLocalDate(document.getElementById('purchaseEditDue').value);
  const newStockId = document.getElementById('purchaseEditStockProduct').value;
  const newStockQty = Number(document.getElementById('purchaseEditStockQty').value);
  if (!name || !Number.isFinite(total) || total <= 0 || !Number.isInteger(count) || count < 1 || count > 60 || !firstDue) {
    showToast('Confira perfume, valor, parcelas e vencimento.'); return;
  }
  const snapshot = getData();
  const original = purchaseRows(snapshot, clientId, key);
  if (!original.length) { showToast('Pedido não encontrado.'); return; }
  let plan, change;
  try {
    change = planStockChange(snapshot, original[0], newStockId, newStockQty);
    plan = editPurchaseSchedule(original, total, count, firstDue, name, change.stockMeta);
  } catch (err) {
    showToast(err.message || 'Não foi possível alterar o pedido.');
    return;
  }
  updateData(data => {
    if (change.changed) {
      const originalProduct = data.products.find(p => p.id === original[0].stockProductId);
      const selectedProduct = data.products.find(p => p.id === newStockId);
      data.movements ||= [];
      if (originalProduct && change.oldQty) {
        originalProduct.qty = Number(originalProduct.qty || 0) + change.oldQty;
        data.movements.push({id:uid('mov'), productId:originalProduct.id, type:'in', qty:change.oldQty,
          note:'Correção de pedido: estorno da baixa anterior', clientId, purchaseId:key, createdAt:new Date().toISOString()});
      }
      if (selectedProduct) {
        selectedProduct.qty = Number(selectedProduct.qty || 0) - newStockQty;
        data.movements.push({id:uid('mov'), productId:selectedProduct.id, type:'out', qty:newStockQty,
          note:'Correção de pedido: ' + name, clientId, purchaseId:key, createdAt:new Date().toISOString()});
      }
    }
    const removedIds = new Set(original.map(i => i.id));
    data.installments = data.installments.filter(i => !removedIds.has(i.id)).concat(plan);
    data.purchaseEdits ||= [];
    data.purchaseEdits.push({id:uid('edit'), clientId, purchaseId:key,
      oldTotal:original.reduce((s,i) => s + Number(i.amount || 0),0), newTotal:total,
      oldCount:original.length, newCount:count, productName:name,
      date:new Date().toISOString()});
  });
  const editor = document.getElementById('purchaseEditModal');
  editor.addEventListener('hidden.bs.modal', () => openClientDetails(clientId, showToast), { once: true });
  bootstrap.Modal.getOrCreateInstance(editor).hide();
  showToast('Pedido atualizado. Pagamentos anteriores preservados.');
}

function openClientModal(id = null) {
  const form = document.getElementById('clientForm');
  purchaseClientId = null;
  form.reset();
  resetSaleStockControls();
  setClientModalMode(Boolean(id));
  document.getElementById('clientId').value = '';
  document.getElementById('clientInstallments').value = 1;
  const d = new Date(); d.setDate(d.getDate() + 7);
  document.getElementById('clientFirstDue').value = isoDate(d);
  document.getElementById('clientModalTitle').textContent = id ? 'Editar cliente' : 'Novo cliente';
  if (id) {
    const c = getData().clients.find(x => x.id === id);
    if (!c) return;
    document.getElementById('clientId').value = c.id;
    document.getElementById('clientName').value = c.name;
    document.getElementById('clientPhone').value = c.phone || '';
    document.getElementById('clientEmail').value = c.email || '';
    document.getElementById('clientNotes').value = c.notes || '';
    renderOrdersInClientEditor(id);
  }
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
  setClientModalMode(false);
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
  const paid = ins.reduce((sum,i)=>sum+Number(i.paidAmount ?? (i.paidAt ? i.amount : 0)),0);
  const openUpdated = ins.filter(i=>!i.paidAt).reduce((sum,i)=>sum+calculateLateAmounts(i,data.settings).total,0);
  const additions = ins.filter(i=>!i.paidAt).reduce((sum,i)=>{const x=calculateLateAmounts(i,data.settings);return sum+x.interest+x.fee},0);
  document.getElementById('detailsClientName').textContent = client.name;
  document.getElementById('clientDetailsBody').innerHTML = `<div class="row g-3 mb-4"><div class="col-6 col-lg"><div class="detail-stat"><small>Contrato</small><strong>${brl.format(contracted)}</strong></div></div><div class="col-6 col-lg"><div class="detail-stat"><small>Já pago</small><strong>${brl.format(paid)}</strong></div></div><div class="col-6 col-lg"><div class="detail-stat"><small>Acréscimos atuais</small><strong>${brl.format(additions)}</strong></div></div><div class="col-6 col-lg"><div class="detail-stat"><small>Saldo atualizado</small><strong>${brl.format(openUpdated)}</strong></div></div><div class="col-6 col-lg"><div class="detail-stat"><small>Parcelas</small><strong>${ins.filter(i=>i.paidAt).length}/${ins.length}</strong></div></div></div><div class="small text-secondary mb-3"><i class="bi bi-percent me-1"></i>Juros configurados: ${Number(data.settings.lateInterestMonthly ?? 20).toLocaleString('pt-BR')}% ao mês proporcional aos dias de atraso + multa de ${Number(data.settings.lateFeePercent ?? 2).toLocaleString('pt-BR')}%.</div><div class="d-flex flex-wrap gap-2 mb-4">${client.phone?`<button type="button" class="btn btn-outline-success" data-whatsapp-client="${client.id}"><i class="bi bi-whatsapp me-1"></i>WhatsApp</button>`:''}<button class="btn btn-outline-light" data-edit-client="${client.id}"><i class="bi bi-pencil me-1"></i>Editar</button><button class="btn btn-gold" data-new-purchase="${client.id}"><i class="bi bi-bag-plus me-1"></i>Nova compra</button><button class="btn btn-outline-danger ms-md-auto" data-delete-client="${client.id}"><i class="bi bi-trash me-1"></i>Excluir</button></div><h3 class="h6 mb-3">Compras e parcelas</h3>${renderPurchaseSections(ins,data.settings,client.id)}${client.notes?`<div class="mt-4 p-3 rounded-3 border border-secondary-subtle"><small class="text-secondary d-block mb-1">Observações</small>${escapeHtml(client.notes)}</div>`:''}`;
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
    return '<section class="purchase-section mb-4"><div class="d-flex justify-content-between align-items-center flex-wrap gap-3 mb-2"><div><h3 class="h6 mb-1">Compra ' + (index + 1) + ' — ' + escapeHtml(productName) + '</h3><div class="small text-secondary">' + brl.format(total) + ' · ' + paid + '/' + group.items.length + ' parcelas quitadas</div></div>' + '<div class="d-flex flex-wrap gap-2"><button type="button" class="btn btn-sm btn-outline-light" data-edit-purchase="' + escapeHtml(group.items[0].purchaseId || 'legacy-purchase') + '" data-client-id="' + escapeHtml(clientId) + '"><i class="bi bi-pencil me-1"></i>Editar pedido</button>' + (firstOpen ? '<button class="btn btn-sm btn-outline-success" data-toggle-payment="' + firstOpen.id + '" data-client-id="' + clientId + '"><i class="bi bi-cash-coin me-1"></i>Abater valor desta venda</button>' : '<span class="small text-success"><i class="bi bi-check-circle me-1"></i>Venda quitada</span>') + '</div></div><div class="installment-list">' + group.items.map(item => installmentRow(item, settings, clientId)).join('') + '</div></section>';
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
    const related=(snapshot.paymentHistory||[]).filter(p=>!p.reversedAt&&Array.isArray(p.allocations)&&p.allocations.some(a=>a.installmentId===id));
    if(related.some(p=>p.allocations.some(a=>a.installmentId!==id))){
      showToast('Esta quitação abateu outras parcelas. Não é possível desfazer uma parcela isoladamente.');
      return;
    }
    if(!confirm('Desfazer o pagamento desta parcela? Os comprovantes vinculados serão cancelados.'))return;
    updateData(data=>{
      const i=data.installments.find(x=>x.id===id);
      if(i){i.paidAt=null;delete i.paidAmount;delete i.lateFeePaid;delete i.daysLatePaid;}
      for(const p of data.paymentHistory||[]){
        if(related.some(h=>h.id===p.id))p.reversedAt=new Date().toISOString();
      }
    });
    showToast('Pagamento desfeito e histórico ajustado.');openClientDetails(clientId,showToast);return;
  }
  document.getElementById('paymentEntryCard')?.remove();
  const due=calculateLateAmounts(selected,snapshot.settings).total;
  const targetButton=[...document.querySelectorAll('#clientDetailsBody .installment-list [data-toggle-payment]')].find(btn=>btn.dataset.togglePayment===id);
  const list=targetButton?.closest('.installment-list');
  if(!list)return;
  list.insertAdjacentHTML('beforebegin',`<div class="payment-entry-card" id="paymentEntryCard">
    <div class="d-flex justify-content-between align-items-start gap-3 mb-3"><div><span class="panel-kicker">Novo recebimento</span><h3 class="h5 mt-1 mb-1">${escapeHtml(selected.purchaseName || 'Produto não informado')} · Parcela #${selected.number}</h3><div class="small text-secondary">Saldo atual: ${brl.format(due)}. O excedente pode abater as próximas parcelas.</div></div><button type="button" class="btn-close btn-close-white" aria-label="Fechar" data-payment-cancel></button></div>
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
