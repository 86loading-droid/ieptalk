// 간격기록(부분간격·전체간격)과 순간표집 관찰 회기 화면
// 정해진 간격마다 진동·짧은 소리·화면 깜빡임으로 알려 주고, 간격별 예/아니오를 모아 한 회기 기록으로 저장한다.
import { esc, openModal, closeModal, toast } from '../util.js';
import { S, on } from '../state.js';
import { INT_LABEL } from '../charts.js';
import { baseEvent, saveEvent, isIoa } from './record.js';

const HOW = {
  partial: '간격 안에 행동이 한 번이라도 일어나면 큰 단추를 누르세요. 누른 간격은 「발생」으로 남습니다.',
  whole: '간격 내내 행동이 이어졌을 때만 큰 단추를 누르세요. 중간에 끊기면 다시 눌러 해제합니다.',
  momentary: '간격이 끝나는 순간 신호가 오면, 그 순간 행동을 하고 있었는지 예·아니오로 답하세요.'
};

let run = null; // { sid, tid, type, sec, n, start, results, timer, asked }

function beep() {
  try {
    const ctx = beep.ctx || (beep.ctx = new (window.AudioContext || window.webkitAudioContext)());
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 880; g.gain.value = 0.08; o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.09);
  } catch {}
}

function view() {
  const t = (S.targetsBy[run.sid] || []).find((x) => x.id === run.tid);
  const stu = S.students.find((s) => s.id === run.sid);
  // 순간표집은 마지막 간격이 끝난 순간에도 답을 받아야 하므로, 그 답(또는 건너뛰기)까지 기다린다
  const awaitingLast = run.type === 'momentary' && run.i >= run.n && run.asked != null && run.results[run.asked] === undefined;
  const done = run.i >= run.n && !awaitingLast;
  const cur = Math.min(run.i, run.n - 1);
  const left = done ? 0 : Math.max(0, Math.ceil((run.start + (run.i + 1) * run.sec * 1000 - Date.now()) / 1000));
  const cells = run.results.map((v, k) => `<span class="int-cell ${v === true ? 'yes' : v === false ? 'no' : ''} ${k === run.i && !done ? 'now' : ''}" title="${k + 1}번째 간격">${k + 1}</span>`).join('');
  const yes = run.results.filter((v) => v === true).length, answered = run.results.filter((v) => v === true || v === false).length;
  const momentaryAsk = run.type === 'momentary' && run.asked != null && run.results[run.asked] === undefined;
  return `<h2>${esc(stu?.alias || '')} · ${esc(t?.name || '')} <small class="muted">${INT_LABEL[run.type]} ${run.sec}초 × ${run.n}칸${isIoa(run.sid) ? ' · 두 번째 관찰자' : ''}</small></h2>
    <p class="small">${HOW[run.type]}</p>
    ${!run.start ? '' : done ? `<p class="int-sum" role="status">회기 끝 · 발생 ${yes}칸 / 답한 ${answered}칸 (${answered ? Math.round((yes / answered) * 100) : 0}%)</p>`
      : `<p class="int-now" role="status" aria-live="polite"><b>${cur + 1}</b> / ${run.n}번째 간격 · 남은 ${left}초</p>`}
    ${!run.start ? '' : done ? '' : run.type === 'momentary'
      ? (momentaryAsk ? `<div class="int-ask"><p><b>${run.asked + 1}번째 간격 끝 순간</b>, 행동 중이었나요?</p><div class="btns"><button type="button" class="rec-btn int-yes" data-int="yes">예</button><button type="button" class="rec-btn int-no" data-int="no">아니오</button></div>${awaitingLast ? '<button type="button" class="link sm" data-int="skip">못 봤음(답하지 않음)</button>' : ''}</div>`
        : '<p class="muted int-wait">다음 신호를 기다리는 중입니다.</p>')
      : `<button type="button" class="rec-btn int-tap ${run.results[run.i] ? 'on' : ''}" data-int="tap" aria-pressed="${!!run.results[run.i]}"><span class="rec-name">${run.results[run.i] ? '발생으로 표시됨' : run.type === 'whole' ? '간격 내내 이어짐' : '행동 있음'}</span><span class="rec-sub">${cur + 1}번째 간격 · 다시 누르면 해제</span></button>`}
    <div class="int-grid" aria-label="간격별 결과">${cells}</div>
    <div class="actions">${!run.start ? `<label class="small">간격(초)<input type="number" min="5" max="600" data-int-set="sec" value="${run.sec}" class="sm-input"></label><label class="small">칸 수<input type="number" min="2" max="120" data-int-set="n" value="${run.n}" class="sm-input"></label><span class="grow"></span><button type="button" class="ghost" data-int="cancel">닫기</button><button type="button" class="primary" data-int="start">회기 시작</button>`
      : done ? '<button type="button" class="ghost danger" data-int="discard">버리기</button><span class="grow"></span><button type="button" class="primary" data-int="save">회기 저장</button>'
      : '<button type="button" class="ghost danger" data-int="stop">중간에 끝내기</button>'}</div>`;
}

function paint() { const m = document.querySelector('.modal.int-modal'); if (m) m.innerHTML = view(); }

function tick() {
  if (!run || !run.start) return;
  if (!document.querySelector('.modal.int-modal')) { stopTimer(); run = null; toast('회기 화면을 닫아 간격기록을 멈췄습니다(저장 안 함)'); return; }
  const elapsed = Date.now() - run.start;
  const idx = Math.floor(elapsed / (run.sec * 1000));
  while (run.i < Math.min(idx, run.n)) {
    // 간격 하나가 끝남
    if (run.type === 'momentary') { if (run.asked != null && run.results[run.asked] === undefined) run.results[run.asked] = null; run.asked = run.i; }
    else if (run.results[run.i] !== true) run.results[run.i] = false;
    run.i += 1;
    if (navigator.vibrate) navigator.vibrate(run.type === 'momentary' ? [60, 40, 60] : 40);
    beep();
    const m = document.querySelector('.modal.int-modal'); if (m) { m.classList.remove('flash'); void m.offsetWidth; m.classList.add('flash'); }
  }
  if (run.i >= run.n) { clearInterval(run.timer); run.timer = null; }
  paint();
}

function stopTimer() { if (run?.timer) clearInterval(run.timer); }

on('int-open', (el) => {
  const { sid, tid } = el.dataset;
  const t = (S.targetsBy[sid] || []).find((x) => x.id === tid);
  stopTimer();
  run = { sid, tid, type: t?.intType || 'partial', sec: Number(t?.intervalSec) || 10, n: Number(t?.intervals) || 30, start: 0, i: 0, results: [], asked: null, timer: null };
  run.results = Array(run.n).fill(undefined);
  const m = openModal(view(), { wide: true });
  m.classList.add('int-modal');
  m.addEventListener('input', (e) => {
    const k = e.target.dataset.intSet; if (!k || run.start) return;
    run[k] = Math.max(Number(e.target.min), Math.min(Number(e.target.max), Number(e.target.value) || 0));
    if (k === 'n') run.results = Array(run.n).fill(undefined);
  });
  m.addEventListener('click', (e) => {
    const b = e.target.closest('[data-int]'); if (!b) return;
    const a = b.dataset.int;
    if (a === 'start') {
      m.querySelectorAll('[data-int-set]').forEach((inp) => { const k = inp.dataset.intSet; run[k] = Math.max(Number(inp.min), Math.min(Number(inp.max), Number(inp.value) || Number(inp.min))); });
      run.results = Array(run.n).fill(undefined); beep(); run.start = Date.now(); run.timer = setInterval(tick, 250); paint(); }
    if (a === 'tap' && run.i < run.n) { run.results[run.i] = run.results[run.i] ? undefined : true; paint(); }
    if (a === 'yes' || a === 'no') { run.results[run.asked] = a === 'yes'; paint(); }
    if (a === 'skip') { run.results[run.asked] = null; paint(); }
    if (a === 'stop') { stopTimer(); if (run.type !== 'momentary' && run.i < run.n && run.results[run.i] !== true) run.results[run.i] = false; run.n = Math.max(1, run.i + (run.type === 'momentary' ? 0 : 1)); run.results = run.results.slice(0, run.n); run.i = run.n; paint(); }
    if (a === 'cancel' || a === 'discard') { stopTimer(); run = null; closeModal(); }
    if (a === 'save') {
      const ev = baseEvent(run.sid, run.tid, 'int', run.start);
      Object.assign(ev, { end: run.start + run.n * run.sec * 1000, intType: run.type, intervalSec: run.sec, results: run.results.map((v) => (v === true ? true : v === false ? false : null)) });
      saveEvent(ev); stopTimer(); run = null; closeModal(); toast('간격기록 회기를 저장했습니다');
    }
  });
});

// 회기 도중 창을 닫으려 하면 알림
window.addEventListener('beforeunload', (e) => { if (run?.timer) { e.preventDefault(); e.returnValue = ''; } });
