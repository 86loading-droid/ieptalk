// 공통 도구
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const pad = (n) => String(n).padStart(2, '0');
export const todayStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const timeStr = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const dateOf = (ms) => todayStr(new Date(ms));
export const parseDate = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
export const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return todayStr(d); };
export const diffDays = (a, b) => Math.round((parseDate(a) - parseDate(b)) / 864e5);
const WD = ['일', '월', '화', '수', '목', '금', '토'];
export const fmtDate = (s) => { if (!s) return ''; const d = parseDate(s); return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`; };
export const fmtDateTime = (ms) => { const d = new Date(ms); return `${d.getMonth() + 1}/${d.getDate()} ${timeStr(d)}`; };
export const fmtClock = (ms) => timeStr(new Date(ms));
export const fmtDur = (sec) => { sec = Math.max(0, Math.round(sec)); const m = Math.floor(sec / 60), s = sec % 60; return m ? `${m}분 ${s}초` : `${s}초`; };
export const relTime = (ms) => {
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (dateOf(ms) === todayStr()) return fmtClock(ms);
  return fmtDateTime(ms);
};
export const toMs = (date, time) => { const d = parseDate(date); const [h, m] = String(time || '00:00').split(':').map(Number); d.setHours(h || 0, m || 0, 0, 0); return d.getTime(); };

// 통계
export const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
export const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const slope = (ys) => { const n = ys.length; if (n < 2) return 0; const xs = ys.map((_, i) => i); const mx = mean(xs), my = mean(ys); let num = 0, den = 0; for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; } return den ? num / den : 0; };
export const round1 = (x) => Math.round(x * 10) / 10;

// 알림 띠
let toastTimer;
export function toast(msg, action) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
  el.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button type="button" class="toast-act">${esc(action.label)}</button>` : '');
  el.classList.add('show');
  if (action) el.querySelector('.toast-act').onclick = () => { el.classList.remove('show'); action.run(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 6000 : 2600);
}

// 대화상자
export function openModal(html, { onSubmit, onOpen, wide } = {}) {
  closeModal();
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(back);
  const modal = back.firstElementChild;
  const prev = document.activeElement;
  back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) closeModal(); });
  back.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  const form = modal.querySelector('form');
  if (form && onSubmit) form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]');
    if (btn) btn.disabled = true;
    try { const ok = await onSubmit(new FormData(form), form); if (ok !== false) closeModal(); }
    catch (err) { console.error(err); toast('저장하지 못했습니다: ' + (err.message || err)); }
    finally { if (btn) btn.disabled = false; }
  });
  back._prev = prev;
  onOpen && onOpen(modal);
  const f = modal.querySelector('[autofocus], input, select, textarea, button');
  f && f.focus();
  return modal;
}
export function closeModal() {
  const b = $('.modal-back');
  if (b) { const p = b._prev; b.remove(); p && p.focus && p.focus(); }
}

export const googleCalUrl = (m) => {
  const s = new Date(toMs(m.date, m.start));
  const e = new Date(s.getTime() + (Number(m.minutes) || 30) * 60000);
  const f = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const p = new URLSearchParams({ action: 'TEMPLATE', text: `[IEP톡] ${m.title}`, dates: `${f(s)}/${f(e)}`, details: m.memo || '', ctz: 'Asia/Seoul' });
  return `https://calendar.google.com/calendar/render?${p}`;
};
