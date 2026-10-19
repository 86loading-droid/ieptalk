// IEP톡 v21 자료 만들기(브라우저·node 공용): 원문 hwp → 성취기준 JSON, 에듀에이블 차례 수집본 → units.json
// tools/curriculum-hwp2txt.py + tools/curriculum-parse.py 와 같은 결과를 내도록 옮긴 것(결과 SHA-256로 대조)
async function buildAll(hwpBuf, tocJson, inflateRaw) {
  // ---------- CFB(OLE) ----------
  const u8 = new Uint8Array(hwpBuf); const dv = new DataView(hwpBuf);
  const ss = 1 << dv.getUint16(30, true), mss = 1 << dv.getUint16(32, true);
  const nFat = dv.getUint32(44, true), dirStart = dv.getUint32(48, true), cutoff = dv.getUint32(56, true);
  const miniFatStart = dv.getUint32(60, true), difatStart = dv.getUint32(68, true);
  const secOff = (n) => (n + 1) * ss;
  const fatSecs = [];
  for (let i = 0; i < 109 && fatSecs.length < nFat; i++) fatSecs.push(dv.getUint32(76 + i * 4, true));
  let d = difatStart;
  while (fatSecs.length < nFat && d < 0xFFFFFFFA) { const o = secOff(d); for (let i = 0; i < ss / 4 - 1 && fatSecs.length < nFat; i++) fatSecs.push(dv.getUint32(o + i * 4, true)); d = dv.getUint32(o + ss - 4, true); }
  const fat = []; for (const s of fatSecs) { const o = secOff(s); for (let i = 0; i < ss / 4; i++) fat.push(dv.getUint32(o + i * 4, true)); }
  const chain = (start, f) => { const out = []; let x = start; while (x < 0xFFFFFFFA && out.length < 1e6) { out.push(x); x = f[x]; } return out; };
  const readChain = (start, size) => { const c = chain(start, fat); const out = new Uint8Array(c.length * ss); c.forEach((s, i) => out.set(u8.subarray(secOff(s), secOff(s) + ss), i * ss)); return size == null ? out : out.subarray(0, size); };
  const dirBytes = readChain(dirStart);
  const ents = [];
  for (let o = 0; o + 128 <= dirBytes.length; o += 128) {
    const nl = new DataView(dirBytes.buffer, dirBytes.byteOffset + o, 128);
    const len = nl.getUint16(64, true); let name = '';
    for (let i = 0; i < Math.max(0, len / 2 - 1); i++) name += String.fromCharCode(nl.getUint16(i * 2, true));
    ents.push({ name, type: nl.getUint8(66), left: nl.getUint32(68, true), right: nl.getUint32(72, true), child: nl.getUint32(76, true), start: nl.getUint32(116, true), size: nl.getUint32(120, true) });
  }
  const root = ents[0];
  const miniStream = readChain(root.start, root.size);
  const miniFat = []; { const b = readChain(miniFatStart); const v = new DataView(b.buffer, b.byteOffset, b.length); for (let i = 0; i < b.length / 4; i++) miniFat.push(v.getUint32(i * 4, true)); }
  const readStream = (e) => {
    if (e.size >= cutoff) return readChain(e.start, e.size);
    const c = chain(e.start, miniFat); const out = new Uint8Array(c.length * mss); c.forEach((s, i) => out.set(miniStream.subarray(s * mss, s * mss + mss), i * mss)); return out.subarray(0, e.size);
  };
  const kids = (e) => { const out = []; const walk = (i) => { if (i === 0xFFFFFFFF || i >= ents.length) return; const x = ents[i]; walk(x.left); out.push(x); walk(x.right); }; walk(e.child); return out; };
  const top = kids(root);
  const fh = readStream(top.find((e) => e.name === 'FileHeader'));
  const compressed = fh[36] & 1;
  const body = top.find((e) => e.name === 'BodyText');
  const secs = kids(body).filter((e) => /^Section\d+$/.test(e.name)).sort((a, b) => Number(a.name.slice(7)) - Number(b.name.slice(7)));
  const lines = [];
  const dec = new TextDecoder('utf-16le');
  for (const se of secs) {
    let data = readStream(se); if (compressed) data = await inflateRaw(data);
    const v = new DataView(data.buffer, data.byteOffset, data.length);
    let i = 0;
    while (i < data.length) {
      const h = v.getUint32(i, true); i += 4;
      const tag = h & 0x3ff; let size = (h >>> 20) & 0xfff;
      if (size === 0xfff) { size = v.getUint32(i, true); i += 4; }
      const rec = data.subarray(i, i + size); i += size;
      if (tag !== 67) continue;
      const parts = []; let j = 0; const rv = new DataView(rec.buffer, rec.byteOffset, rec.length);
      const EXT = [1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23], INL = [4, 5, 6, 7, 8, 9, 19, 20];
      while (j < rec.length) {
        const c = rv.getUint16(j, true);
        if (c < 32) {
          if (EXT.includes(c)) { j += 16; continue; }
          if (INL.includes(c)) { if (c === 9) parts.push(9); j += 16; continue; }
          if (c === 24) parts.push(45); else if (c === 30 || c === 31) parts.push(32);
          j += 2; continue;
        }
        parts.push(c); j += 2;
      }
      const b = new Uint8Array(parts.length * 2); const bv = new DataView(b.buffer); parts.forEach((c, k) => bv.setUint16(k * 2, c, true));
      lines.push(dec.decode(b));
    }
  }
  const text = lines.join('\n') + '\n';
  // ---------- 성취기준 파싱 ----------
  const L = text.replace(/\r\n?/g, '\n').split('\n'); if (L[L.length - 1] === '') L.pop();
  const SUBJ = { '바생': '바른 생활', '슬생': '슬기로운 생활', '건생': '건강한 생활', '즐생': '즐거운 생활', '국어': '국어', '사회': '사회', '수학': '수학', '과학': '과학', '실과': '실과', '진로': '진로와 직업', '체육': '체육', '음악': '음악', '미술': '미술', '정통': '정보통신활용', '생영': '생활영어', '보건': '보건' };
  const GR = { 2: '초1~2', 4: '초3~4', 6: '초5~6', 9: '중1~3', 12: '고1~3' };
  const CODE = '\\[(\\d{1,2})([가-힣]{2})(\\d\\d)-(\\d\\d)\\]';
  const reCodeLine = new RegExp('^\\s*((?:' + CODE + '[\\s,･·∙]*)+)\\s*(.*)$', 'u');
  const reArea = /^\s*\((\d{1,2})\)\s*(\S.{0,24})$/u;
  const reGrade = /^\s*\[(초등학교|중학교|고등학교)\s*([0-9]\s*[~∼]\s*[0-9])학년\]\s*$/u;
  const SEV = /중도중복|중도･중복|중도·중복|장애 정도가 심한|장애에 따른 특별한 지원/u;
  const LABELS = ['성취기준의 설정 취지 및 의미', '교수⋅학습의 주안점', '장애에 따른 특별한 지원 안내', '평가 시 고려 사항', '다른 통합교과 및 범교과와의 연계 안내', '다른 통합교과 및 범교과와의 연계', '교사 수준의 성취기준 재구성 안내'];
  const pyStrip = (s) => s.replace(/^[\s\u001c-\u001f\u0085]+|[\s\u001c-\u001f\u0085]+$/gu, '');
  const findAll = (re, s) => [...s.matchAll(new RegExp(re, 'gu'))];
  const data = new Map(); const stds = new Map(); const areas = [];
  let inSec = false, mode = null, block = [], curArea = null, parentNo = 0, parentName = '';
  const newArea = (no, name) => { curArea = { no, name: pyStrip(name), intro: '', stds: [], con: [], _grade: null, _subj: null }; areas.push(curArea); };
  for (const l0 of L) {
    let s = pyStrip(l0);
    if (s === '나. 성취기준') { inSec = true; mode = 'std'; curArea = null; continue; }
    if (!inSec) continue;
    if (/^3\.\s*교수/u.test(s) || /^다\.\s/u.test(s)) { inSec = false; mode = null; continue; }
    if (!s) continue;
    if (reGrade.test(s)) { mode = 'std'; curArea = null; continue; }
    const ms = s.match(/^[\u{F02B1}-\u{F02B9}]\s*(\S.{0,24})$/u);
    if (ms) { newArea(parentNo, parentName + ' > ' + pyStrip(ms[1])); mode = 'intro'; block = []; continue; }
    s = pyStrip(s.replace(/[\u{F0000}-\u{FFFFF}\uF000-\uF8FF]/gu, ''));
    if (!s) continue;
    const m = s.match(reArea);
    if (m && !s.startsWith('(가)') && !s.startsWith('(나)') && [...s].length < 30 && !/다\.$|한다/u.test(s)) {
      newArea(Number(m[1]), m[2]); parentNo = Number(m[1]); parentName = pyStrip(m[2]); mode = 'intro'; block = []; continue;
    }
    if (s.startsWith('(가)') && s.includes('해설')) { mode = 'exp'; continue; }
    if (s.startsWith('(나)') && s.includes('고려')) { mode = 'con'; continue; }
    const cm = s.match(reCodeLine);
    if (cm) {
      const last = cm[6] ?? '';
      const cs = findAll(CODE, cm[1]).map((t) => `${t[1]}${t[2]}${t[3]}-${t[4]}`);
      if (cs.length) {
        const gp = cs[0].match(/^(\d{1,2})/)[1];
        for (const t of findAll('\\[([가-힣]{2})(\\d\\d)-(\\d\\d)\\]', cm[1] + ' ' + [...last].slice(0, 40).join(''))) cs.push(`${gp}${t[1]}${t[2]}-${t[3]}`);
      }
      const text2 = pyStrip(last.replace(/^(?:[,\s]*\[[가-힣]{2}\d\d-\d\d\])+[,\s]*/u, ''));
      const restate = cs.length === 1 && stds.has(cs[0]) && pyStrip(text2) === pyStrip(stds.get(cs[0]).t);
      if (restate && ['exp', 'con', 'std'].includes(mode)) { mode = 'std'; block = [cs[0]]; continue; }
      if (mode === 'std' || mode === 'intro' || (['exp', 'con'].includes(mode) && cs.length === 1 && !stds.has(cs[0]))) {
        if (mode === 'exp' || mode === 'con') block = [];
        mode = 'std';
        const c = cs[0];
        if (stds.has(c)) { block = [c]; continue; }
        const g = c.match(/^(\d{1,2})([가-힣]{2})/u);
        const st = { c, t: text2, exp: [], con: [] }; stds.set(c, st);
        if (curArea === null) newArea(0, '');
        curArea.stds.push(c); curArea._subj = g[2]; curArea._grade = g[1];
        block.push(c); continue;
      }
      if (mode === 'exp' || mode === 'con') {
        const key = mode === 'exp' ? 'exp' : 'con';
        const item = { x: text2, s: SEV.test(text2) };
        for (const c of cs) if (stds.has(c)) stds.get(c)[key].push(item);
        continue;
      }
    }
    if (mode === 'std') continue;
    if (mode === 'intro') { if (curArea !== null) curArea.intro += (curArea.intro ? ' ' : '') + s; continue; }
    if (mode === 'exp' || mode === 'con') {
      const key = mode === 'exp' ? 'exp' : 'con';
      let lab = '', txt = s;
      for (const LB of LABELS) {
        if (s.startsWith(LB + ' ') || s.startsWith(LB + '\t')) { lab = LB; txt = pyStrip(s.slice(LB.length)); if (txt.startsWith('안내 ')) txt = txt.slice(3); break; }
      }
      const item = { x: txt, s: SEV.test(s) }; if (lab) item.l = lab;
      if (block.length === 1 && stds.has(block[0])) stds.get(block[0])[key].push(item);
      else if (curArea !== null) { if (key === 'con') curArea.con.push(item); else (curArea.exp = curArea.exp || []).push(item); }
    }
  }
  for (const a of areas) {
    if (!a.stds.length) continue;
    if (!data.has(a._subj)) data.set(a._subj, { abbr: a._subj, name: SUBJ[a._subj] || a._subj, groups: new Map() });
    const sj = data.get(a._subj); const gk = GR[Number(a._grade)];
    if (!sj.groups.has(gk)) sj.groups.set(gk, []);
    sj.groups.get(gk).push({ no: a.no, name: a.name, intro: a.intro, con: a.con, stds: a.stds.map((c) => stds.get(c)) });
  }
  const ID = { '바생': 'bs', '슬생': 'ss', '건생': 'hl', '즐생': 'jl', '국어': 'kor', '사회': 'soc', '수학': 'math', '과학': 'sci', '실과': 'prac', '진로': 'career', '체육': 'pe', '음악': 'music', '미술': 'art', '정통': 'ict', '생영': 'eng', '보건': 'health' };
  const files = {}; const idx = [];
  for (const [ab, v] of data) {
    const groups = {};
    for (const [g, ars] of v.groups) groups[g] = ars.map((a) => ({ no: a.no, name: a.name, intro: a.intro, con: a.con, stds: a.stds.map((s) => ({ c: s.c, t: s.t, exp: s.exp.map((x) => { const o = { x: x.x }; if ('l' in x) o.l = x.l; return o; }), con: s.con })) }));
    files[`cur/${ID[ab]}.json`] = JSON.stringify({ id: ID[ab], abbr: ab, name: v.name, groups });
    const cnt = {}; for (const [g, ars] of v.groups) cnt[g] = ars.reduce((n, a) => n + a.stds.length, 0);
    idx.push({ id: ID[ab], name: v.name, groups: cnt });
  }
  // 일상생활 활동 영역·내용 요소
  const i0 = text.indexOf('가. 영역의 구성과 내용 요소'); const seg = [...text.slice(i0)].slice(0, 1500).join('');
  const dlAreas = [];
  for (const m of seg.matchAll(/\((\d)\) (.+?) 영역의 내용 요소는 (.+?)(?:으로|로) 구성한다/gu)) {
    const els = [...m[3].matchAll(/‘([^’]+)’/gu)].map((x) => x[1]);
    dlAreas.push({ no: Number(m[1]), name: m[2], intro: '', con: [], stds: els.map((e, j) => ({ c: `일상${m[1]}-${j + 1}`, t: e, exp: [], con: [], el: true })) });
  }
  const bands = ['초1~2', '초3~4', '초5~6', '중1~3', '고1~3'];
  const dlGroups = {}; bands.forEach((b) => { dlGroups[b] = dlAreas; });
  files['cur/dl.json'] = JSON.stringify({ id: 'dl', abbr: '일상', name: '일상생활 활동', elements: true, groups: dlGroups });
  const dlCnt = {}; bands.forEach((b) => { dlCnt[b] = dlAreas.reduce((n, a) => n + a.stds.length, 0); });
  idx.push({ id: 'dl', name: '일상생활 활동', elements: true, groups: dlCnt });
  const src = { title: '2022 개정 특수교육 교육과정 [별책 3] 기본 교육과정', notice: '교육부 고시 제2022-34호(국가교육위원회 고시 제2026-2호 일부개정 포함)', from: '국가교육과정정보센터(NCIC) 원문 hwp·pdf, 2026-10-19 내려받음' };
  files['cur/index.json'] = JSON.stringify({ source: src, subjects: idx });
  // ---------- 단원·차시 ----------
  const units = {};
  for (const x of tocJson.items) {
    if (x.n.includes('도움말')) continue;
    const s = x.s; const n = pyStrip(x.n.replace('(2022 개정)', ''));
    const m = n.match(/^(\d)학년\s*(\d+)단원_(.+)/u);
    let key;
    if (['국어', '사회', '과학'].includes(s) && m) key = `${x.lv}${m[1]}|${s}`;
    else if (s === '진로와 직업') key = '고|진로와 직업';
    else if (s === '일상생활 활동') key = '공통|일상생활 활동';
    else key = `${x.lv}|${s}`;
    const t = x.toc; let title = t.t;
    if (s === '일상생활 활동') { const mm = n.match(/^\d+단원_(.+?)-(.+)/u); if (mm) title = `${mm[1]} · ${mm[2]}`; }
    const subs = [];
    for (const c of t.c) { if (!c.c.length && c.t === '단원 도입') continue; subs.push({ t: c.t, l: c.c.map((g) => g.t) }); }
    const lst = units[key] || (units[key] = []);
    if (lst.some((u) => u.u === title)) continue;
    lst.push({ u: title, s: subs });
  }
  const unitNo = (u) => { const mm = u.u.match(/^(\d+)\./u); return mm ? Number(mm[1]) : 999; };
  for (const k of Object.keys(units)) if (!k.includes('일상')) units[k].sort((a, b) => unitNo(a) - unitNo(b));
  const meta = { source: '국립특수교육원 에듀에이블 멀티미디어북·디지털 교과서 차례(2022 개정 기본 교육과정), 2026-10-19 확인', note: '공개된 디지털 자료가 있는 교과·학년만 들어 있습니다.' };
  files['units.json'] = JSON.stringify({ meta, units });
  return { files, text, nStd: stds.size };
}
if (typeof module !== 'undefined') module.exports = { buildAll };
