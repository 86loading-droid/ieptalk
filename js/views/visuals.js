// 행동지원 시각자료: 교사가 골라 학생 IEP(전체 흐름·인쇄)에 넣는 그림 카드.
// 그림은 IEP톡이 직접 그린 단순 그림(SVG)이다(상용 그림 상징을 쓰지 않음). 사진 올리기는 학생 얼굴 노출 위험이 있어 두지 않는다.
// 근거 틀: 시각적 지원·선행사건 중재·기능적 의사소통 훈련·강화·자기관리·사회적 이야기(NCAEP 근거기반 실제, Steinbrenner 외, 2020).
// 저장: students/{학생}/memos 에 kind: 'vis' 문서 하나(교사만 읽고 씀). items: [{ id, cap, tid }]
import { esc, openModal, closeModal, toast } from '../util.js';
import { S, on, student } from '../state.js';
import { profileFor } from './fba.js';

const C = { pre: '#E8F1FB', fct: '#FFF3D6', rein: '#E6F5EA', self: '#F1EAFB' };
const INK = '#1F2A37';
const svg = (bg, body) => `<svg viewBox="0 0 120 120" role="img" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="116" height="116" rx="18" fill="${bg}" stroke="${INK}" stroke-width="3"/>${body}</svg>`;
const S2 = `stroke="${INK}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"`;

export const CATS = [['pre', '예방(앞 상황)'], ['fct', '교체행동·의사소통'], ['rein', '강화(뒤 결과)'], ['self', '자기조절·자기관리']];
export const FN_LABEL = { esc: '회피·도피', att: '관심 끌기', tan: '선호 활동·물건', sens: '감각 추구' };

// [id, 이름, 분류, 맞는 기능, 근거기반 실제, 쓰는 법, 그림]
export const VISUALS = [
  ['schedule', '그림 일과표', 'pre', ['esc', 'tan'], '시각적 지원', '하루·수업 순서를 그림으로 붙이고 끝난 활동은 떼거나 표시합니다.',
    svg(C.pre, `<rect x="30" y="20" width="60" height="22" rx="5" ${S2}/><rect x="30" y="49" width="60" height="22" rx="5" ${S2}/><rect x="30" y="78" width="60" height="22" rx="5" ${S2}/><path d="M37 31l5 5 9-10" ${S2}/><path d="M37 60l5 5 9-10" ${S2}/><path d="M58 31h24M58 60h24M42 89h40" ${S2}/>`)],
  ['firstthen', '먼저-다음 판', 'pre', ['esc', 'tan'], '선행사건 중재', '「먼저」에 해야 할 과제, 「다음」에 좋아하는 활동을 붙여 순서를 약속합니다.',
    svg(C.pre, `<rect x="14" y="34" width="38" height="52" rx="6" ${S2}/><rect x="68" y="34" width="38" height="52" rx="6" ${S2}/><path d="M55 60h10M61 54l6 6-6 6" ${S2}/><text x="33" y="28" font-size="13" text-anchor="middle" fill="${INK}" font-weight="700">먼저</text><text x="87" y="28" font-size="13" text-anchor="middle" fill="${INK}" font-weight="700">다음</text><path d="M24 52h18M24 62h18M24 72h12" ${S2}/><path d="M87 50l4 8 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1z" fill="${INK}"/>`)],
  ['timer', '시각 타이머', 'pre', ['esc', 'tan'], '시각적 지원', '남은 시간을 색으로 보여 주어 활동 끝과 전환을 예고합니다.',
    svg(C.pre, `<circle cx="60" cy="64" r="36" ${S2}/><path d="M60 64V28A36 36 0 0 1 91 82Z" fill="#E4572E" stroke="${INK}" stroke-width="3"/><path d="M52 16h16M60 16v10" ${S2}/><circle cx="60" cy="64" r="4" fill="${INK}"/>`)],
  ['choice', '선택판', 'pre', ['esc', 'tan', 'att'], '선행사건 중재(선택 기회)', '두세 가지 중 하나를 고르게 해 활동에 스스로 참여하게 합니다.',
    svg(C.pre, `<rect x="14" y="30" width="40" height="40" rx="6" ${S2}/><rect x="66" y="30" width="40" height="40" rx="6" ${S2}/><circle cx="34" cy="50" r="9" ${S2}/><path d="M78 58l8-16 8 16z" ${S2}/><path d="M60 98V84M60 84l-8 8M60 84l8 8" ${S2}/><text x="60" y="22" font-size="13" text-anchor="middle" fill="${INK}" font-weight="700">골라요</text>`)],
  ['rules', '규칙 카드', 'pre', ['att', 'esc'], '시각적 지원', '지킬 규칙을 2~3개만 그림과 짧은 말로 보여 주고 수업 전에 함께 읽습니다.',
    svg(C.pre, `<rect x="28" y="20" width="64" height="84" rx="8" ${S2}/><rect x="46" y="14" width="28" height="12" rx="4" fill="${C.pre}" ${S2}/><path d="M38 46l4 4 8-8M38 66l4 4 8-8M38 86l4 4 8-8" ${S2}/><path d="M58 46h24M58 66h24M58 86h18" ${S2}/>`)],
  ['story', '사회적 이야기', 'pre', ['att', 'esc', 'tan'], '사회적 이야기', '상황과 기대 행동을 학생 눈높이의 짧은 이야기와 그림으로 미리 읽습니다.',
    svg(C.pre, `<path d="M60 40c-12-8-28-8-40-4v56c12-4 28-4 40 4 12-8 28-8 40-4V36c-12-4-28-4-40 4z" ${S2}/><path d="M60 40v56" ${S2}/><path d="M28 54h22M28 66h22M70 54h22M70 66h16" ${S2}/><path d="M74 14h30v16H86l-6 6v-6h-6z" ${S2}/>`)],
  ['break', '「쉬어요」 카드', 'fct', ['esc', 'sens'], '기능적 의사소통 훈련', '힘들 때 문제행동 대신 카드를 내밀어 짧은 휴식을 요청하게 가르칩니다.',
    svg(C.fct, `<circle cx="60" cy="56" r="30" ${S2}/><path d="M50 42v28M70 42v28" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><text x="60" y="106" font-size="15" text-anchor="middle" fill="${INK}" font-weight="700">쉬어요</text>`)],
  ['help', '「도와주세요」 카드', 'fct', ['esc'], '기능적 의사소통 훈련', '어려운 과제 앞에서 도움을 요청하는 말·카드를 가르칩니다.',
    svg(C.fct, `<path d="M48 84V44a6 6 0 0 1 12 0v22M60 40a6 6 0 0 1 12 0v26M72 48a6 6 0 0 1 12 0v20c0 14-8 22-20 22h-4c-8 0-12-4-16-10L36 66a6 6 0 0 1 10-6l2 4" ${S2}/><text x="60" y="110" font-size="13" text-anchor="middle" fill="${INK}" font-weight="700">도와주세요</text>`)],
  ['attention', '「선생님」 관심 카드', 'fct', ['att'], '기능적 의사소통 훈련', '관심이 필요할 때 소리 대신 카드를 들거나 「선생님」이라고 부르게 가르칩니다.',
    svg(C.fct, `<path d="M18 26h84v50H56l-14 14V76H18z" ${S2}/><path d="M60 38v20" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><circle cx="60" cy="67" r="4" fill="${INK}"/><text x="60" y="110" font-size="13" text-anchor="middle" fill="${INK}" font-weight="700">선생님</text>`)],
  ['want', '「주세요」 요구 카드', 'fct', ['tan'], '기능적 의사소통 훈련', '원하는 물건·활동을 그림 카드나 말로 요구하게 가르칩니다.',
    svg(C.fct, `<path d="M22 70c10-4 22-4 30 2h22c6 0 6 8 0 8H58M22 70v24M22 94h36l34-14c6-2 4-10-2-9l-28 7" ${S2}/><path d="M74 20l6 12 13 2-10 9 3 13-12-7-12 7 3-13-10-9 13-2z" ${S2}/><text x="60" y="112" font-size="13" text-anchor="middle" fill="${INK}" font-weight="700">주세요</text>`)],
  ['wait', '「기다려요」 카드', 'fct', ['tan', 'att'], '선행사건 중재·강화', '카드를 쥐고 짧게 기다리면 원하는 것을 받게 하고, 기다리는 시간을 조금씩 늘립니다.',
    svg(C.fct, `<path d="M42 16h36M42 90h36M46 16c0 18 28 18 28 37S46 72 46 90M74 16c0 18-28 18-28 37s28 19 28 37" ${S2}/><path d="M52 82h16l-8-9z" fill="${INK}"/><text x="60" y="110" font-size="13" text-anchor="middle" fill="${INK}" font-weight="700">기다려요</text>`)],
  ['token', '토큰판', 'rein', ['esc', 'att', 'tan', 'sens'], '강화(토큰 체계)', '바른 행동마다 토큰을 붙이고 다 모이면 고른 강화제를 받습니다.',
    svg(C.rein, `<rect x="12" y="28" width="96" height="64" rx="10" ${S2}/><circle cx="32" cy="50" r="10" fill="${INK}"/><circle cx="60" cy="50" r="10" fill="${INK}"/><circle cx="88" cy="50" r="10" ${S2}/><circle cx="32" cy="76" r="10" ${S2}/><circle cx="60" cy="76" r="10" ${S2}/><path d="M86 70l2 4 5 1-4 3 1 5-4-3-4 3 1-5-4-3 5-1z" fill="${INK}"/>`)],
  ['praise', '칭찬 카드', 'rein', ['att'], '강화(대체행동 차별강화)', '바른 행동을 하면 바로 구체적인 말과 함께 보여 줍니다.',
    svg(C.rein, `<path d="M40 56h-14v40h14zM40 58l14-24c2-6 12-4 12 4l-2 14h20c6 0 10 6 8 12l-6 24c-2 6-6 8-12 8H40" ${S2}/><path d="M92 20l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" fill="${INK}"/>`)],
  ['thermo', '감정 온도계', 'self', ['esc', 'att', 'sens'], '자기관리', '지금 감정 단계를 가리키게 하고 단계마다 할 진정 방법을 함께 정합니다.',
    svg(C.self, `<path d="M52 20a8 8 0 0 1 16 0v52a16 16 0 1 1-16 0z" ${S2}/><rect x="56" y="58" width="8" height="18" fill="#E4572E"/><circle cx="60" cy="86" r="10" fill="#E4572E"/><path d="M76 30h16M76 46h16M76 62h16" ${S2}/><circle cx="98" cy="30" r="4" fill="#E4572E"/><circle cx="98" cy="46" r="4" fill="#F2C14E"/><circle cx="98" cy="62" r="4" fill="#3E9C5D"/>`)],
  ['breathe', '진정 단계 카드', 'self', ['esc', 'sens', 'att'], '자기관리', '「멈추기-숨 쉬기-쉬는 자리」처럼 진정 순서를 그림으로 보고 따라 합니다.',
    svg(C.self, `<circle cx="34" cy="46" r="14" ${S2}/><path d="M28 46h12" ${S2}/><path d="M58 40c8 0 8 6 16 6s8-6 16-6M58 52c8 0 8 6 16 6s8-6 16-6" ${S2}/><path d="M24 80h72" ${S2}/><text x="30" y="102" font-size="14" text-anchor="middle" fill="${INK}" font-weight="700">1</text><text x="60" y="102" font-size="14" text-anchor="middle" fill="${INK}" font-weight="700">2</text><text x="90" y="102" font-size="14" text-anchor="middle" fill="${INK}" font-weight="700">3</text>`)],
  ['volume', '목소리 크기 척도', 'self', ['att', 'sens'], '시각적 지원·자기관리', '0(조용히)~3(운동장) 중 지금 맞는 목소리 크기를 가리켜 알려 줍니다.',
    svg(C.self, `<rect x="18" y="80" width="14" height="14" rx="3" ${S2}/><rect x="40" y="66" width="14" height="28" rx="3" ${S2}/><rect x="62" y="50" width="14" height="44" rx="3" fill="${INK}"/><rect x="84" y="32" width="14" height="62" rx="3" ${S2}/><text x="25" y="108" font-size="11" text-anchor="middle" fill="${INK}">0</text><text x="47" y="108" font-size="11" text-anchor="middle" fill="${INK}">1</text><text x="69" y="108" font-size="11" text-anchor="middle" fill="${INK}">2</text><text x="91" y="108" font-size="11" text-anchor="middle" fill="${INK}">3</text>`)],
  ['selfcheck', '자기점검표', 'self', ['att', 'esc'], '자기관리(자기 점검)', '정한 시간마다 스스로 행동을 체크하고, 교사와 맞추어 보며 강화합니다.',
    svg(C.self, `<rect x="22" y="16" width="76" height="88" rx="8" ${S2}/><rect x="31" y="31" width="16" height="16" rx="3" ${S2}/><rect x="31" y="55" width="16" height="16" rx="3" ${S2}/><rect x="31" y="79" width="16" height="16" rx="3" ${S2}/><path d="M34 39l3 4 7-8M34 63l3 4 7-8" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M56 39h32M56 63h32M56 87h24" ${S2}/>`)]
];
export const visualById = (id) => VISUALS.find((v) => v[0] === id);

// 학생의 시각자료 문서(하나)
export const visDoc = (sid) => (S.memosBy[sid] || []).find((m) => m.kind === 'vis');
export const visItems = (sid) => (visDoc(sid)?.items || []).filter((x) => visualById(x.id));

// 기능평가 결과로 추천(표적행동별 주된 기능)
export function suggested(sid) {
  const fns = new Set();
  (S.targetsBy[sid] || []).forEach((t) => { const p = profileFor(sid, t.id); if (p.top) { fns.add(p.top); if (p.mixed && p.second) fns.add(p.second); } });
  return { fns: [...fns], ids: VISUALS.filter((v) => v[3].some((f) => fns.has(f))).map((v) => v[0]) };
}

export function visCard(it, { big = false } = {}) {
  const v = visualById(it.id); if (!v) return '';
  return `<figure class="vis-card ${big ? 'big' : ''}">${v[6]}<figcaption><b>${esc(it.cap || v[1])}</b>${big ? '' : `<small>${esc(v[4])}</small>`}</figcaption></figure>`;
}

export function visSection(sid, { edit = true } = {}) {
  const items = visItems(sid);
  const tname = (tid) => (S.targetsBy[sid] || []).find((t) => t.id === tid)?.name || '';
  return `<div class="vis-sec">${items.length ? `<div class="vis-grid">${items.map((it) => `<div class="vis-item">${visCard(it)}${it.tid ? `<span class="tiny muted">${esc(tname(it.tid))}</span>` : ''}</div>`).join('')}</div>`
    : '<p class="small muted">아직 고른 시각자료가 없습니다.</p>'}
    ${edit ? `<div class="bar"><button type="button" class="ghost sm" data-act="vis-pick" data-sid="${sid}">시각자료 고르기</button>${items.length ? `<button type="button" class="ghost sm" data-act="vis-print" data-sid="${sid}">카드로 인쇄</button>` : ''}</div>` : ''}</div>`;
}

export function openVisPicker(sid) {
  const s = student(sid);
  const sug = suggested(sid);
  const cur = new Map(visItems(sid).map((x) => [x.id, { ...x }]));
  let cat = sug.ids.length ? 'sug' : 'all';
  const targets = S.targetsBy[sid] || [];
  const body = () => {
    const list = VISUALS.filter((v) => (cat === 'all' ? true : cat === 'sug' ? sug.ids.includes(v[0]) : v[2] === cat));
    return `<div class="nt-chips" role="group" aria-label="분류">${[['sug', `추천${sug.fns.length ? `(${sug.fns.map((f) => FN_LABEL[f]).join('·')})` : ''}`], ['all', '전체'], ...CATS].map(([k, l]) => `<button type="button" class="pr-chip sm ${cat === k ? 'on' : ''}" aria-pressed="${cat === k}" data-vc="${k}">${esc(l)}</button>`).join('')}</div>
      ${cat === 'sug' && !sug.ids.length ? '<p class="small muted">기능평가 결과가 아직 없어 추천이 없습니다. 「전체」에서 고르세요.</p>' : ''}
      <div class="vis-pick">${list.map((v) => { const on = cur.has(v[0]); const it = cur.get(v[0]) || {};
        return `<div class="vis-opt ${on ? 'on' : ''}"><button type="button" class="vis-tog" data-vt="${v[0]}" aria-pressed="${on}" aria-label="${esc(v[1])} ${on ? '빼기' : '넣기'}">${v[6]}<span class="vis-check" aria-hidden="true">${on ? '✓' : '+'}</span></button>
          <p class="small"><b>${esc(v[1])}</b> <span class="tag">${esc(v[4])}</span></p><p class="tiny muted">${esc(v[5])}</p>
          ${on ? `<label class="tiny">카드 문구<input data-vcap="${v[0]}" value="${esc(it.cap || v[1])}" maxlength="20"></label>
            ${targets.length ? `<label class="tiny">표적행동<select data-vtid="${v[0]}"><option value="">공통</option>${targets.map((t) => `<option value="${t.id}" ${it.tid === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>` : ''}` : ''}</div>`; }).join('')}</div>`;
  };
  openModal(`<div class="vis-modal"><div class="pr-top"><h2>행동지원 시각자료 <small class="muted">${esc(s?.alias || '')}</small></h2><span class="grow"></span><button type="button" class="ghost" data-close>닫기</button></div>
    <p class="small muted">그림을 눌러 넣거나 뺍니다. 고른 그림은 「IEP 전체 흐름」과 인쇄본에 들어갑니다. 그림은 IEP톡이 그린 단순 그림이며, 학생 사진은 올리지 않습니다.</p>
    <div class="vis-body">${body()}</div>
    <div class="actions"><span class="tiny muted" data-vn>${cur.size}개 고름</span><span class="grow"></span><button type="button" class="ghost" data-close>취소</button><button type="button" class="primary" data-vsave>저장</button></div></div>`, {
    wide: true,
    onOpen: (m) => {
      const paint = () => { m.querySelector('.vis-body').innerHTML = body(); m.querySelector('[data-vn]').textContent = `${cur.size}개 고름`; };
      m.addEventListener('click', async (e) => {
        const c = e.target.closest('[data-vc]'); if (c) { cat = c.dataset.vc; return paint(); }
        const t = e.target.closest('[data-vt]'); if (t) { const id = t.dataset.vt; if (cur.has(id)) cur.delete(id); else cur.set(id, { id, cap: visualById(id)[1], tid: '' }); return paint(); }
        if (e.target.closest('[data-vsave]')) {
          const items = [...cur.values()].map((x) => ({ id: x.id, cap: (x.cap || '').trim() || visualById(x.id)[1], tid: x.tid || '' }));
          const d = visDoc(sid);
          if (d) await S.store.update('memos', { sid }, d.id, { items, updatedBy: S.me.uid, updatedAt: Date.now() });
          else await S.store.create('memos', { sid }, { kind: 'vis', items, title: '', blocks: [], createdBy: S.me.uid, updatedBy: S.me.uid, createdAt: Date.now(), updatedAt: Date.now() });
          closeModal(); toast('시각자료를 IEP에 넣었습니다');
        }
      });
      m.addEventListener('input', (e) => { const id = e.target.dataset.vcap; if (id && cur.has(id)) cur.get(id).cap = e.target.value; });
      m.addEventListener('change', (e) => { const id = e.target.dataset.vtid; if (id && cur.has(id)) cur.get(id).tid = e.target.value; });
    }
  });
}

on('vis-pick', (el) => openVisPicker(el.dataset.sid));
on('vis-print', (el) => {
  const sid = el.dataset.sid; const s = student(sid);
  let root = document.getElementById('print-root');
  if (!root) { root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root); }
  root.innerHTML = `<div class="vis-print"><p class="print-note">${esc(s?.alias || '')} 행동지원 시각자료 — 잘라서 코팅해 씁니다.</p><div class="vis-print-grid">${visItems(sid).map((it) => visCard(it, { big: true })).join('')}</div></div>`;
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done); setTimeout(() => window.print(), 50);
});
