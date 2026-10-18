const CACHE='jv-perfumes-v3';
const ASSETS=['./','./index.html','./assets/css/styles.css','./assets/img/logo.png','./assets/img/icon-192.png','./assets/img/icon-512.png','./js/app.js','./js/storage.js','./js/utils.js','./js/dashboard.js','./js/clients.js','./js/inventory.js','./js/notifications.js'];
const DB='jv-perfumes-worker'; const STORE='alerts';
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(self.clients.claim())});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(fetch(e.request).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))))});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{for(const c of list){if('focus'in c)return c.focus()}return self.clients.openWindow('./')}))});
self.addEventListener('message',e=>{if(e.data?.type==='SYNC_ALERTS')e.waitUntil(saveAlerts(e.data.alerts||[]))});
self.addEventListener('periodicsync',e=>{if(e.tag==='jv-due-check')e.waitUntil(notifyFromStoredAlerts())});
function openDb(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE)};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function saveAlerts(alerts){const db=await openDb();await new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put({alerts,savedAt:Date.now()},'current');tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});db.close()}
async function readAlerts(){const db=await openDb();const value=await new Promise((res,rej)=>{const tx=db.transaction(STORE,'readonly');const r=tx.objectStore(STORE).get('current');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});db.close();return value?.alerts||[]}
async function notifyFromStoredAlerts(){const alerts=await readAlerts();if(!alerts.length)return;const overdue=alerts.filter(a=>a.status==='overdue').length;await self.registration.showNotification('JV Perfumes • Cobranças',{body:`${alerts.length} cobrança(s) exigem atenção. ${overdue} em atraso.`,icon:'./assets/img/icon-192.png',badge:'./assets/img/icon-192.png',tag:'jv-background-due'})}
