// 학사일정 파일 읽기: 엑셀(xlsx·xls·csv), 한글(hwp·hwpx), PDF, 붙여 넣은 글.
// 파일은 이 브라우저 안에서만 읽고 어디에도 올리지 않는다. 읽은 결과는 미리보기에서 고친 뒤 넣는다.
import { HOLIDAYS } from './holidays.js';

const lib = () => import('./vendor/parsers.js');
const ext = (name) => (name.toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
export const ACCEPT = '.xlsx,.xls,.csv,.hwp,.hwpx,.pdf,.txt';

/* ---------- 1. 파일 → 글 줄(표는 한 행을 한 줄로) ---------- */
export async function fileToLines(file) {
  const e = ext(file.name);
  const buf = new Uint8Array(await file.arrayBuffer());
  if (['xlsx', 'xls', 'csv'].includes(e)) return { kind: '엑셀', ...(await excelLines(buf, e)) };
  if (e === 'hwpx') return { kind: '한글(hwpx)', lines: await hwpxLines(buf) };
  if (e === 'hwp') return { kind: '한글(hwp)', ...(await hwpLines(buf)) };
  if (e === 'pdf') return { kind: 'PDF', lines: await pdfLines(buf) };
  if (e === 'txt') return { kind: '글', lines: new TextDecoder().decode(buf).split(/\r?\n/) };
  throw new Error('엑셀(xlsx·xls·csv), 한글(hwp·hwpx), PDF 파일만 읽을 수 있습니다.');
}

// 엑셀: 양식 머리글(시작일·일정 이름 등)이 있으면 그대로, 달력 모양(3월·4월… 열)이면 칸별로, 아니면 행을 글로
async function excelLines(buf, e) {
  const { read, utils, SSF } = await lib();
  const opt = { cellNF: true, cellDates: false };
  const wb = e === 'csv' ? read(new TextDecoder().decode(buf), { type: 'string', ...opt }) : read(buf, { type: 'array', ...opt });
  const lines = [], rows = [];
  for (const name of wb.SheetNames) {
    // 날짜 칸(엑셀 일련번호)은 시간대 영향 없이 연·월·일로 바꾼다
    const ws = wb.Sheets[name];
    Object.keys(ws).forEach((k) => {
      const c = ws[k]; if (k[0] === '!' || !c || c.t !== 'n' || !c.z || !SSF.is_date(c.z)) return;
      const d = SSF.parse_date_code(c.v); if (!d) return;
      const isTime = c.v < 1;
      c.t = 's'; c.v = isTime ? `${pad(d.H)}:${pad(d.M)}` : `${d.y}-${pad(d.m)}-${pad(d.d)}${d.H || d.M ? ` ${pad(d.H)}:${pad(d.M)}` : ''}`; delete c.w;
    });
    const aoa = utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }).map((r) => r.map((c) => String(c ?? '').trim()));
    const st = structured(aoa); if (st) { rows.push(...st); continue; }
    const grid = monthGrid(aoa); if (grid) { lines.push(...grid); continue; }
    aoa.forEach((r) => { const t = r.filter(Boolean).join(' | '); if (t) lines.push(t); });
  }
  return { lines, rows };
}
const H = { date: /^(시작일|시작 날짜|날짜|일자|일시|시작)$/, endDate: /^(끝나는 날|종료일|끝 날짜|마감일|종료)$/, title: /^(일정 이름|일정명|일정|행사명|행사|내용|학사일정)$/, cat: /^(분류|구분|종류)$/, start: /^(시작 시각|시각|시간)$/, end: /^(끝 시각|종료 시각)$/, place: /^(장소)$/, memo: /^(메모|비고)$/ };
function structured(aoa) {
  const hi = aoa.findIndex((r) => r.some((c) => H.date.test(c)) && r.some((c) => H.title.test(c)));
  if (hi < 0 || hi > 10) return null;
  const col = Object.fromEntries(Object.entries(H).map(([k, re]) => [k, aoa[hi].findIndex((c) => re.test(c))]));
  return aoa.slice(hi + 1).filter((r) => r[col.date] && r[col.title]).map((r) => {
    const g = (k) => (col[k] >= 0 ? r[col[k]] : '');
    return { dateText: g('date'), endText: g('endDate'), title: g('title'), cat: catOf(g('cat'), g('title')), start: g('start'), end: g('end'), place: g('place'), memo: g('memo') };
  });
}
// 달력 모양 엑셀: 머리글 행에 「3월」「4월」…, 첫 열(또는 둘째 열)에 날짜 숫자
function monthGrid(aoa) {
  const hi = aoa.findIndex((r) => r.filter((c) => /^\d{1,2}\s*월$/.test(c)).length >= 3);
  if (hi < 0) return null;
  const months = aoa[hi].map((c) => (/^\d{1,2}\s*월$/.test(c) ? parseInt(c, 10) : 0));
  const out = [];
  aoa.slice(hi + 1).forEach((r) => {
    const di = [0, 1].find((i) => /^\d{1,2}$/.test(r[i]) && +r[i] >= 1 && +r[i] <= 31);
    if (di === undefined) return;
    months.forEach((m, j) => { const v = r[j]; if (m && v && !/^[월화수목금토일]$/.test(v)) out.push(`${m}월 ${r[di]}일 ${v}`); });
  });
  return out;
}

// 한글 hwpx: 압축 안의 Contents/section*.xml에서 글자를 꺼낸다(표는 행 단위)
async function hwpxLines(buf) {
  const { unzipSync, strFromU8 } = await lib();
  const files = unzipSync(buf);
  const secs = Object.keys(files).filter((k) => /Contents\/section\d+\.xml$/i.test(k)).sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)));
  if (!secs.length) throw new Error('hwpx 안에서 본문을 찾지 못했습니다.');
  const lines = [];
  for (const k of secs) {
    const doc = new DOMParser().parseFromString(strFromU8(files[k]), 'application/xml');
    const txt = (el) => [...el.getElementsByTagNameNS('*', 't')].map((t) => t.textContent).join('');
    const walk = (el) => {
      for (const ch of el.children) {
        if (ch.localName === 'tbl') { for (const tr of ch.getElementsByTagNameNS('*', 'tr')) { const cells = [...tr.children].filter((c) => c.localName === 'tc').map((c) => txt(c).trim()).filter(Boolean); if (cells.length) lines.push(cells.join(' | ')); } }
        else if (ch.localName === 'p' && !ch.getElementsByTagNameNS('*', 'tbl').length) { const t = txt(ch).trim(); if (t) lines.push(t); }
        else walk(ch);
      }
    };
    walk(doc.documentElement);
  }
  return lines;
}

// 한글 hwp(5.0 바이너리): 복합 문서 안 BodyText/Section* 레코드에서 문단 글자를 꺼낸다(표는 행 단위)
const TAG = { PARA_HEADER: 66, PARA_TEXT: 67, CTRL_HEADER: 71, LIST_HEADER: 72 };
async function hwpLines(buf) {
  const { CFB, inflateSync } = await lib();
  const cfb = CFB.read(buf, { type: 'array' });
  const get = (p) => CFB.find(cfb, p);
  const u8 = (c) => (c instanceof Uint8Array ? c : Uint8Array.from(c || []));
  const fh = get('/FileHeader');
  if (!fh) throw new Error('한글 파일 형식이 아닙니다(hwp 5.0 이상만 읽습니다).');
  const head = u8(fh.content);
  const sig = new TextDecoder().decode(head.slice(0, 17));
  if (sig !== 'HWP Document File') throw new Error('한글 파일 형식이 아닙니다.');
  const prop = head[36] | (head[37] << 8);
  if (prop & 2) throw new Error('암호가 걸린 한글 파일입니다. 암호를 풀어 저장한 뒤 올려 주세요.');
  // 배포용 문서는 본문이 잠겨 있어, 한글이 함께 넣어 두는 「미리보기 글」(앞부분)만 읽는다
  const prv = () => { const p = get('/PrvText'); if (!p) return null; const t = new TextDecoder('utf-16le').decode(u8(p.content)); return t.split(/\r?\n/).map((l) => l.replace(/></g, ' | ').replace(/[<>]/g, ' ').trim()).filter(Boolean); };
  if (prop & 4) { const l = prv(); if (l && l.length) return { lines: l, warn: '배포용 한글 파일이라 한글이 넣어 둔 미리보기 글(문서 앞부분)만 읽었습니다. 빠진 일정은 직접 더하거나 내용을 붙여 넣어 주세요.' }; throw new Error('배포용 한글 파일은 읽을 수 없습니다. 한글에서 「다른 이름으로 저장」 후 올리거나, 내용을 복사해 붙여 넣어 주세요.'); }
  const compressed = !!(prop & 1);
  const lines = [];
  for (let i = 0; ; i++) {
    const ent = get(`/BodyText/Section${i}`); if (!ent) break;
    let data = u8(ent.content);
    if (compressed) data = inflateSync(data);
    sectionLines(data, lines);
  }
  if (!lines.length) { const l = prv(); if (l && l.length) return { lines: l, warn: '본문을 읽지 못해 미리보기 글(문서 앞부분)만 읽었습니다.' }; throw new Error('한글 파일에서 글자를 찾지 못했습니다.'); }
  return { lines };
}
function paraText(d, s, n) {
  let out = '';
  for (let i = 0; i + 1 < n;) {
    const c = d[s + i] | (d[s + i + 1] << 8);
    if (c < 32) {
      if ([0, 10, 13, 24, 25, 26, 27, 28, 29, 30, 31].includes(c)) { if (c === 10) out += ' '; i += 2; }
      else { if (c === 9) out += ' '; i += 16; }
    } else { out += String.fromCharCode(c); i += 2; }
  }
  return out;
}
function sectionLines(d, lines) {
  let p = 0, table = null; // table: { level, rows: Map(row → [cells]), cell }
  const flush = () => { if (!table) return; [...table.rows.keys()].sort((a, b) => a - b).forEach((r) => { const cells = table.rows.get(r).map((c) => c.trim()).filter(Boolean); if (cells.length) lines.push(cells.join(' | ')); }); table = null; };
  while (p + 4 <= d.length) {
    const h = d[p] | (d[p + 1] << 8) | (d[p + 2] << 16) | (d[p + 3] << 24);
    const tag = h & 0x3ff, level = (h >>> 10) & 0x3ff; let size = (h >>> 20) & 0xfff; p += 4;
    if (size === 0xfff) { size = (d[p] | (d[p + 1] << 8) | (d[p + 2] << 16) | (d[p + 3] << 24)) >>> 0; p += 4; }
    if (table && level <= table.level) flush();
    if (tag === TAG.CTRL_HEADER && size >= 4 && !table) {
      const id = String.fromCharCode(d[p + 3], d[p + 2], d[p + 1], d[p]);
      if (id === 'tbl ') table = { level, rows: new Map(), cell: null };
    } else if (tag === TAG.LIST_HEADER && table && level === table.level + 1) {
      const off = size === 30 ? 6 : 8;
      const row = d[p + off + 2] | (d[p + off + 3] << 8);
      if (!table.rows.has(row)) table.rows.set(row, []);
      table.cell = { row, i: table.rows.get(row).push('') - 1 };
    } else if (tag === TAG.PARA_TEXT) {
      const t = paraText(d, p, size).trim();
      if (t) {
        if (table && table.cell) { const r = table.rows.get(table.cell.row); r[table.cell.i] = (r[table.cell.i] + ' ' + t).trim(); }
        else lines.push(t);
      }
    }
    p += size;
  }
  flush();
}

// PDF: 쪽마다 같은 높이의 글자 조각을 한 줄로 모은다(스캔한 그림 PDF는 글자가 없어 읽지 못함)
async function pdfLines(buf) {
  const pdfjs = await import('./vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  const doc = await pdfjs.getDocument({ data: buf, cMapUrl: new URL('./vendor/pdfjs/cmaps/', import.meta.url).href, cMapPacked: true, isEvalSupported: false }).promise;
  const lines = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const tc = await (await doc.getPage(n)).getTextContent();
    const rows = [];
    tc.items.filter((it) => it.str && it.str.trim()).forEach((it) => {
      const y = it.transform[5], x = it.transform[4];
      let r = rows.find((q) => Math.abs(q.y - y) < Math.max(2, (it.height || 10) * 0.45));
      if (!r) rows.push(r = { y, parts: [] });
      r.parts.push({ x, w: it.width || 0, h: it.height || 10, s: it.str });
    });
    rows.sort((a, b) => b.y - a.y).forEach((r) => {
      r.parts.sort((a, b) => a.x - b.x);
      let t = '', lastEnd = null;
      r.parts.forEach((q) => { if (lastEnd !== null) { const g = q.x - lastEnd; t += g > Math.max(18, q.h * 1.6) ? ' | ' : g > Math.max(1.5, q.h * 0.22) ? ' ' : ''; } t += q.s; lastEnd = q.x + q.w; });
      if (t.trim()) lines.push(t.trim());
    });
  }
  if (!lines.length) throw new Error('PDF에서 글자를 찾지 못했습니다. 스캔한 그림 PDF라면 한글·엑셀 원본을 올리거나 내용을 붙여 넣어 주세요.');
  return lines;
}

/* ---------- 2. 글 줄 → 일정 ---------- */
const HOL_NAMES = new Set(Object.values(HOLIDAYS).map((n) => n.replace(/\(.*\)/, '')));
export function catOf(c = '', title = '') {
  const s = `${c} ${title}`;
  if (/방학|휴업|재량|개교기념/.test(s)) return 'vac';
  if (/연수|협의|회의|위원회|워크숍|컨설팅|장학|설명회|평가회/.test(s)) return 'meet';
  if (/평가|고사|시험|진단|성취도/.test(s)) return 'eval';
  return 'event';
}
const pad = (n) => String(n).padStart(2, '0');
const valid = (y, m, d) => { const t = new Date(y, m - 1, d); return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d; };
const yearFor = (sy, m) => (m >= 3 ? sy : sy + 1);
function normalize(s) {
  return s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 65248)).replace(/[∼〜～－–—]/g, '~').replace(/\s+/g, ' ').trim();
}
// 날짜 하나: 2026.10.12 / 2026-10-12 / 2026년 10월 12일 / 10.12. / 10월 12일 / 10/12  (+ 선택 (월))
const D_FULL = /(20\d{2})\s*(?:[.\-/]|년)\s*(\d{1,2})\s*(?:[.\-/]|월)\s*(\d{1,2})\s*(?:일|\.)?/y;
const D_MD = /(\d{1,2})\s*(?:\.|\/|월)\s*(\d{1,2})\s*(?:일|\.)?/y;
const D_D = /(\d{1,2})\s*(?:일|\.)?/y;
const WD = /\s*\(\s*[월화수목금토일](?:요일)?\s*\)/y;
function tryAt(re, s, i) { re.lastIndex = i; const m = re.exec(s); return m ? m : null; }
function dateAt(s, i, sy, prev) {
  let m = tryAt(D_FULL, s, i);
  if (m && valid(+m[1], +m[2], +m[3])) return { y: +m[1], mo: +m[2], d: +m[3], len: m[0].length, full: true };
  m = tryAt(D_MD, s, i);
  if (m && +m[1] >= 1 && +m[1] <= 12) { const y = prev ? (+m[1] < prev.mo ? prev.y + 1 : prev.y) : yearFor(sy, +m[1]); if (valid(y, +m[1], +m[2])) return { y, mo: +m[1], d: +m[2], len: m[0].length }; }
  if (prev) { m = tryAt(D_D, s, i); if (m && valid(prev.y, prev.mo, +m[1]) && +m[1] >= prev.d) return { y: prev.y, mo: prev.mo, d: +m[1], len: m[0].length }; }
  return null;
}
const iso = (x) => `${x.y}-${pad(x.mo)}-${pad(x.d)}`;
function tokens(s, sy) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    if (!/\d/.test(s[i]) || (i > 0 && /[\d:]/.test(s[i - 1]))) continue;
    const a = dateAt(s, i, sy, null); if (!a) continue;
    let j = i + a.len; const w = tryAt(WD, s, j); if (w) j += w[0].length;
    let b = null; const sep = /\s*~\s*/y; sep.lastIndex = j; const sm = sep.exec(s);
    if (sm) { const k = j + sm[0].length; b = dateAt(s, k, sy, a); if (b) { j = k + b.len; const w2 = tryAt(WD, s, j); if (w2) j += w2[0].length; } }
    // 1.5톤·3.5m처럼 소수에 글자가 바로 붙으면 날짜가 아니다
    if (/\d/.test(s[i + a.len - 1]) && !b && s[j] && !/[\s(~|),·]/.test(s[j])) continue;
    // 시각(15:00) 바로 앞 숫자, 쪽 번호, 개수(3명) 같은 것은 날짜로 보지 않는다
    if (/^\s*(시|분|명|개|교시|학년|반|회|차|쪽|%)(?![가-힣])/.test(s.slice(j))) continue;
    out.push({ from: i, to: j, a, b });
    i = j - 1;
  }
  return out;
}
const TIME = /(\d{1,2}):(\d{2})(?:\s*~\s*(\d{1,2}):(\d{2}))?/;
const LEAD_WD = /^\s*[(]?[월화수목금토일](?:요일)?(?:\s*~\s*[월화수목금토일](?:요일)?)?[)]?\s*(?:[|·,]|\s)\s*/;
function cleanTitle(t) {
  for (let k = 0; k < 2 && LEAD_WD.test(t.replace(/^[\s|:·,\-~)]+/, '')); k++) t = t.replace(/^[\s|:·,\-~)]+/, '').replace(LEAD_WD, '');
  return t.replace(/^[\s|:·,\-~)]+|[\s|:·,\-~(]+$/g, '').replace(/\s*\|\s*/g, ' · ').replace(/\s{2,}/g, ' ').trim();
}
export function majorityYear(evs, fallback) {
  const c = {}; evs.forEach((e) => { const y = +e.date.slice(0, 4), m = +e.date.slice(5, 7); const sy = m >= 3 ? y : y - 1; c[sy] = (c[sy] || 0) + 1; });
  const best = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
  return best ? +best[0] : fallback;
}
export function schoolYearOf(lines, fallback) {
  for (const l of lines) { const m = l.match(/(20\d{2})\s*학년도/); if (m) return +m[1]; }
  return fallback;
}
export function linesToEvents(lines, sy) {
  const out = [];
  const L = lines.map(normalize);
  L.forEach((s, li) => {
    const tk = tokens(s, sy); if (!tk.length) return;
    // 표 칸에서 줄이 바뀌어 괄호가 다음 줄로 넘어간 경우(PDF): 날짜 없는 다음 줄을 이어 붙인다
    const nx = L[li + 1];
    if ((s.match(/\(/g) || []).length > (s.match(/\)/g) || []).length && nx && nx.length < 40 && !tokens(nx, sy).length && nx.includes(')')) s = s + nx.slice(0, nx.indexOf(')') + 1);
    tk.forEach((t, k) => {
      const after = s.slice(t.to, k + 1 < tk.length ? tk[k + 1].from : s.length);
      const before = k === 0 ? s.slice(0, t.from) : '';
      if (/^(부터|까지|에|에는|에서|의|은|는|을|를|로|으로|과|와|이|가)(?![가-힣])/.test(after) || /^(부터|까지)/.test(after)) return; // 문장 속 날짜(…부터, …까지)
      let title = cleanTitle(after) || cleanTitle(before);
      if (title.length > 30 && /다\.?$/.test(title)) return; // 일정이 아니라 문장
      if (!title || /^[\d\s.()~월화수목금토일|·]+$/.test(title)) return;
      let start = '', end = '';
      const tm = title.match(TIME); if (tm) { start = `${pad(tm[1])}:${tm[2]}`; end = tm[3] ? `${pad(tm[3])}:${tm[4]}` : ''; title = cleanTitle(title.replace(TIME, '')); }
      if (!title || title.length > 80 || !/[가-힣A-Za-z].*[가-힣A-Za-z]/.test(title) || /^(부터|까지)/.test(title)) return;
      out.push({ date: iso(t.a), endDate: t.b ? iso(t.b) : iso(t.a), title, cat: catOf('', title), start, end, place: '', memo: '', yearGiven: !!t.a.full });
    });
  });
  return out;
}
export function rowsToEvents(rows, sy) {
  const one = (txt) => { const t = tokens(normalize(txt), sy)[0]; return t ? t.a : null; };
  return rows.map((r) => { const a = one(r.dateText); if (!a) return null; const b = r.endText ? one(r.endText) : null; return { date: iso(a), endDate: b ? iso(b) : iso(a), title: cleanTitle(r.title), cat: r.cat || catOf('', r.title), start: (r.start || '').slice(0, 5), end: (r.end || '').slice(0, 5), place: r.place || '', memo: r.memo || '', yearGiven: !!a.full }; }).filter(Boolean);
}
// 중복 정리 + 공휴일·이미 있는 일정 표시
export function finalize(evs, existing = [], sy = 0) {
  const lo = sy ? `${sy}-03-01` : '', hi = sy ? `${sy + 1}-02-28` : '';
  const seen = new Set(), have = new Set(existing.map((a) => a.date + '|' + a.title));
  return evs.filter((e) => { const k = e.date + '|' + e.title; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (a.date > b.date ? 1 : -1))
    .map((e) => {
      const hol = HOL_NAMES.has(e.title.replace(/\s/g, '')) || /^(공휴일|대체\s*공휴일|일요일|토요일)$/.test(e.title) || (HOLIDAYS[e.date] && e.title.includes(HOLIDAYS[e.date].replace(/\(.*\)/, '')));
      const dup = have.has(e.date + '|' + e.title);
      const out = sy && (e.date < lo || e.date > hi);
      return { ...e, note: dup ? '이미 있음' : hol ? '공휴일(달력에 자동 표시)' : out ? `${sy}학년도 밖` : '', on: !dup && !hol && !out };
    });
}

/* ---------- 3. 양식(엑셀) 만들기 ---------- */
export async function templateBlob() {
  const { utils, write } = await lib();
  const ws = utils.aoa_to_sheet([
    ['시작일', '끝나는 날', '일정 이름', '분류', '시작 시각', '끝 시각', '장소', '메모'],
    ['2027-03-02', '2027-03-02', '입학식·개학식', '학교 행사', '', '', '강당', ''],
    ['2027-03-16', '2027-03-20', '학부모 상담 주간', '학교 행사', '', '', '', '개별화교육 안내'],
    ['2027-03-25', '2027-03-25', '개별화교육지원팀 협의회', '연수·협의', '15:00', '16:00', '특수학급 교실', '']
  ]);
  ws['!cols'] = [12, 12, 28, 10, 9, 9, 14, 20].map((w) => ({ wch: w }));
  const wb = utils.book_new(); utils.book_append_sheet(wb, ws, '학사일정');
  return new Blob([write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
