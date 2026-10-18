import { brl, escapeHtml, uid } from './utils.js';
import { getData, updateData } from './storage.js';

let productModal, moveModal;

export function initInventory(showToast) {
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

export function renderInventory() {
  const data = getData();
  const query = document.getElementById('productSearch')?.value.trim().toLowerCase() || '';
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
  let products = data.products.filter(p=>`${p.name} ${p.category} ${p.brand} ${p.sku}`.toLowerCase().includes(query));
  if(filter==='low')products=products.filter(p=>p.qty<=p.minStock); if(filter==='out')products=products.filter(p=>p.qty<=0);
  document.getElementById('productsTable').innerHTML = products.length ? products.map(p=>row(p)).join('') : `<tr><td colspan="8"><div class="empty-state"><i class="bi bi-box-seam"></i>Nenhum produto encontrado.</div></td></tr>`;
}

function row(p){const status=p.qty<=0?['out','Sem estoque']:p.qty<=p.minStock?['low','Estoque baixo']:['paid','Normal'];return `<tr><td><strong>${escapeHtml(p.name)}</strong><div class="small text-secondary">${escapeHtml(p.brand||'')} ${p.sku?`• ${escapeHtml(p.sku)}`:''}</div></td><td>${escapeHtml(p.category||'—')}</td><td><strong>${p.qty}</strong></td><td>${p.minStock}</td><td>${brl.format(p.cost||0)}</td><td>${brl.format(p.price||0)}</td><td><span class="status-pill status-${status[0]}">${status[1]}</span></td><td class="text-end"><div class="btn-group btn-group-sm"><button class="btn btn-outline-light" data-move-product="${p.id}" title="Movimentar"><i class="bi bi-arrow-left-right"></i></button><button class="btn btn-outline-secondary" data-edit-product="${p.id}" title="Editar"><i class="bi bi-pencil"></i></button><button class="btn btn-outline-danger" data-delete-product="${p.id}" title="Excluir"><i class="bi bi-trash"></i></button></div></td></tr>`}
function resetProductForm(){document.getElementById('productForm').reset();document.getElementById('productId').value='';document.getElementById('productQty').value=0;document.getElementById('productMin').value=2;document.getElementById('productModalTitle').textContent='Novo produto'}
function openProduct(id){const p=getData().products.find(x=>x.id===id);if(!p)return;document.getElementById('productId').value=p.id;document.getElementById('productName').value=p.name;document.getElementById('productCategory').value=p.category||'';document.getElementById('productBrand').value=p.brand||'';document.getElementById('productSku').value=p.sku||'';document.getElementById('productQty').value=p.qty;document.getElementById('productMin').value=p.minStock;document.getElementById('productCost').value=p.cost||0;document.getElementById('productPrice').value=p.price||0;document.getElementById('productModalTitle').textContent='Editar produto';productModal.show()}
function saveProduct(e,showToast){e.preventDefault();const id=document.getElementById('productId').value;const payload={name:document.getElementById('productName').value.trim(),category:document.getElementById('productCategory').value.trim(),brand:document.getElementById('productBrand').value.trim(),sku:document.getElementById('productSku').value.trim(),qty:Number(document.getElementById('productQty').value)||0,minStock:Number(document.getElementById('productMin').value)||0,cost:Number(document.getElementById('productCost').value)||0,price:Number(document.getElementById('productPrice').value)||0};updateData(data=>{if(id){const ix=data.products.findIndex(p=>p.id===id);data.products[ix]={...data.products[ix],...payload,updatedAt:new Date().toISOString()}}else data.products.push({id:uid('prd'),...payload,createdAt:new Date().toISOString()})});productModal.hide();showToast(id?'Produto atualizado.':'Produto cadastrado.')}
function openMove(id){const p=getData().products.find(x=>x.id===id);if(!p)return;document.getElementById('moveProductId').value=id;document.getElementById('moveProductName').textContent=`${p.name} • atual: ${p.qty} un.`;document.getElementById('moveQty').value=1;document.getElementById('moveNote').value='';moveModal.show()}
function saveMove(e,showToast){e.preventDefault();const id=document.getElementById('moveProductId').value;const type=document.getElementById('moveType').value;const qty=Math.max(1,Number(document.getElementById('moveQty').value)||1);const note=document.getElementById('moveNote').value.trim();updateData(data=>{const p=data.products.find(x=>x.id===id);if(!p)return;const delta=type==='in'?qty:-qty;p.qty=Math.max(0,p.qty+delta);data.movements.push({id:uid('mov'),productId:id,type,qty,note,createdAt:new Date().toISOString()})});moveModal.hide();showToast('Estoque atualizado.')}
function deleteProduct(id,showToast){const p=getData().products.find(x=>x.id===id);if(!p)return;if(!confirm(`Excluir ${p.name}?`))return;updateData(d=>{d.products=d.products.filter(x=>x.id!==id);d.movements=d.movements.filter(x=>x.productId!==id)});showToast('Produto excluído.')}
