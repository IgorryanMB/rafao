import { exportBackup, importBackup } from './storage.js';
import { renderDashboard } from './dashboard.js';
import { initClients, renderClients } from './clients.js';
import { initInventory, renderInventory } from './inventory.js';
import { initNotifications, renderAlerts, maybeNotifyDueItems } from './notifications.js';

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
