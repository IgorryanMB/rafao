import { brl, calculateLateAmounts, installmentStatus, parseLocalDate, shortDate } from './utils.js';
import { getData, updateData } from './storage.js';

let swRegistration;

export async function initNotifications(showToast) {
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

export function renderAlerts() {
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

export async function maybeNotifyDueItems() {
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
