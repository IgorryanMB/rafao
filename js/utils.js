export const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const shortDate = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function parseLocalDate(value) {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function isoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addMonths(date, months) {
  const result = new Date(date);
  const originalDay = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(originalDay, lastDay));
  return result;
}

export function daysUntil(dateStr) {
  const target = parseLocalDate(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  return Math.ceil((target - today) / 86400000);
}


export function calculateLateAmounts(inst, settings = {}) {
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
export function installmentStatus(inst, dueSoonDays = 5) {
  if (inst.paidAt) return { key: 'paid', label: 'Pago' };
  const days = daysUntil(inst.dueDate);
  if (days < 0) return { key: 'overdue', label: `Atrasada ${Math.abs(days)}d` };
  if (days <= dueSoonDays) return { key: 'soon', label: days === 0 ? 'Vence hoje' : `Vence em ${days}d` };
  return { key: 'open', label: 'Em aberto' };
}

export function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('') || 'JV';
}

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[c]));
}

export function normalizePhone(phone = '') {
  let digits = phone.replace(/\D/g, '');
  if (digits && !digits.startsWith('55')) digits = `55${digits}`;
  return digits;
}
