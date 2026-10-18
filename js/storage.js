import { addMonths, isoDate, uid } from './utils.js';

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

export function getData() {
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

export function saveData(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
  window.dispatchEvent(new CustomEvent('jv:data-changed'));
}

export function updateData(mutator) {
  const data = getData();
  mutator(data);
  saveData(data);
  return data;
}

export function exportBackup() {
  const blob = new Blob([JSON.stringify(getData(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `jv-perfumes-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export async function importBackup(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (!parsed || !Array.isArray(parsed.clients) || !Array.isArray(parsed.installments) || !Array.isArray(parsed.products)) throw new Error('Backup inválido');
  saveData(parsed);
}
