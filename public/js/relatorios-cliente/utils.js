export function debounce(fn, wait = 300) {
  let timeoutId = null;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), wait);
  };
}

export function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function formatDatePtBr(value) {
  const text = String(value || '').trim();
  if (!text) return '—';
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const [y, m, d] = text.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  return text;
}

export function formatNumber(value) {
  return new Intl.NumberFormat('pt-BR').format(Number(value || 0));
}

export function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = String(value || '');
  return div.innerHTML;
}

export function toIsoDate(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getQuickRange(kind) {
  const now = new Date();
  const end = toIsoDate(now);
  if (kind === '7d') {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    return { dataInicio: toIsoDate(start), dataFim: end };
  }
  if (kind === '30d') {
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    return { dataInicio: toIsoDate(start), dataFim: end };
  }
  if (kind === '90d') {
    const start = new Date(now);
    start.setDate(start.getDate() - 89);
    return { dataInicio: toIsoDate(start), dataFim: end };
  }
  if (kind === 'mes') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { dataInicio: toIsoDate(start), dataFim: end };
  }
  if (kind === 'ano') {
    return { dataInicio: `${now.getFullYear()}-01-01`, dataFim: end };
  }
  return { dataInicio: '', dataFim: '' };
}

export function isValidRange(dataInicio, dataFim) {
  if (!dataInicio || !dataFim) return false;
  return dataInicio <= dataFim;
}
