// 날씨·급식 위젯: 외부 공개 자료를 브라우저에서 바로 불러온다(학생 정보는 보내지 않음).
// - 날씨: Open-Meteo(열쇠 없이 쓰는 공개 예보 API). 미세먼지는 같은 곳의 대기질 모델 추정값(측정소 실측 아님).
// - 급식: NEIS 교육정보 개방 포털 급식식단정보(열쇠 없이 하루 단위 조회). 학교는 관리 화면에서 정한다.
import { esc, todayStr, fmtDate, addDays, parseDate } from '../util.js';
import { S, on } from '../state.js';
import { HOLIDAYS } from '../holidays.js';

export const DEFAULT_PLACE = { wxName: '포항 북구', wxLat: 36.05, wxLon: 129.36, mealOffice: 'R10', mealSchool: '8750361', mealSchoolName: '포항명도학교' };
const conf = () => ({ ...DEFAULT_PLACE, ...Object.fromEntries(Object.entries(S.school || {}).filter(([k, v]) => k in DEFAULT_PLACE && v !== '' && v != null)) });

/* ---------- 날씨 ---------- */
const WMO = { 0: '맑음', 1: '대체로 맑음', 2: '구름 조금', 3: '흐림', 45: '안개', 48: '서리 안개', 51: '약한 이슬비', 53: '이슬비', 55: '강한 이슬비', 56: '어는 이슬비', 57: '어는 이슬비', 61: '약한 비', 63: '비', 65: '강한 비', 66: '어는 비', 67: '어는 비', 71: '약한 눈', 73: '눈', 75: '강한 눈', 77: '싸락눈', 80: '소나기', 81: '소나기', 82: '강한 소나기', 85: '눈 소나기', 86: '강한 눈 소나기', 95: '뇌우', 96: '우박 동반 뇌우', 99: '강한 우박 뇌우' };
const ICON = (c, day = true) => (c === 0 ? (day ? '☀' : '☾') : c <= 2 ? '⛅' : c === 3 ? '☁' : c <= 48 ? '🌫' : c <= 67 || (c >= 80 && c <= 82) ? '☂' : c <= 77 || c >= 85 && c <= 86 ? '❄' : '⚡');
// 환경부 예보 등급(PM10: 30/80/150, PM2.5: 15/35/75)
const grade = (v, cut) => (v == null ? null : v <= cut[0] ? ['좋음', 'g1'] : v <= cut[1] ? ['보통', 'g2'] : v <= cut[2] ? ['나쁨', 'g3'] : ['매우 나쁨', 'g4']);

let wx = { at: 0, data: null, air: null, err: '', key: '', busy: false };
async function loadWeather(force = false) {
  const c = conf(); const key = `${c.wxLat},${c.wxLon}`;
  if (wx.busy) return;
  if (!force && wx.key === key && Date.now() - wx.at < 15 * 60000 && (wx.data || wx.err)) return;
  wx.key = key; wx.at = Date.now(); wx.busy = true;
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${c.wxLat}&longitude=${c.wxLon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=Asia%2FSeoul&forecast_days=2&wind_speed_unit=ms`;
    const a = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${c.wxLat}&longitude=${c.wxLon}&current=pm10,pm2_5&timezone=Asia%2FSeoul`;
    const [r1, r2] = await Promise.all([fetch(u).then((r) => r.json()), fetch(a).then((r) => r.json()).catch(() => null)]);
    wx.data = r1; wx.air = r2; wx.err = '';
  } catch (e) { wx.err = '날씨를 불러오지 못했습니다(인터넷 연결 확인)'; }
  wx.busy = false;
  fill('weather');
}
export function weatherBody() {
  const c = conf();
  if (!wx.data) { loadWeather(); return `<p class="muted small">${wx.err ? esc(wx.err) : '날씨를 불러오는 중…'}</p>`; }
  const cur = wx.data.current || {}, d = wx.data.daily || {};
  const code = cur.weather_code ?? 0;
  const pm10 = wx.air?.current?.pm10, pm25 = wx.air?.current?.pm2_5;
  const g10 = grade(pm10, [30, 80, 150]), g25 = grade(pm25, [15, 35, 75]);
  const tmr = d.weather_code?.[1] != null ? `내일 ${WMO[d.weather_code[1]] || ''} ${Math.round(d.temperature_2m_min[1])}° / ${Math.round(d.temperature_2m_max[1])}°` : '';
  return `<div class="wx-main"><span class="wx-ico" aria-hidden="true">${ICON(code, cur.is_day !== 0)}</span>
      <span><span class="wx-temp">${Math.round(cur.temperature_2m)}°</span><span class="wx-desc">${esc(WMO[code] || '')}</span></span></div>
    <p class="wx-sub">${esc(c.wxName)} · 최저 ${Math.round(d.temperature_2m_min?.[0])}° 최고 ${Math.round(d.temperature_2m_max?.[0])}° · 강수확률 ${d.precipitation_probability_max?.[0] ?? '-'}%</p>
    <p class="wx-sub">체감 ${Math.round(cur.apparent_temperature)}° · 습도 ${cur.relative_humidity_2m}% · 바람 ${cur.wind_speed_10m}m/s</p>
    ${g10 || g25 ? `<p class="wx-air">${g10 ? `<span class="air ${g10[1]}">미세먼지 ${g10[0]}</span>` : ''}${g25 ? `<span class="air ${g25[1]}">초미세먼지 ${g25[0]}</span>` : ''}</p>` : ''}
    ${tmr ? `<p class="wx-sub">${esc(tmr)}</p>` : ''}
    <p class="tiny muted">Open-Meteo 예보 · 미세먼지는 모델 추정값(에어코리아 실측과 다를 수 있음)</p>`;
}

/* ---------- 급식 ---------- */
const meals = new Map(); // 'YYYYMMDD' → { status, rows }
const ymd = (d) => d.replaceAll('-', '');
const isSchoolDay = (d) => { const w = parseDate(d).getDay(); return w !== 0 && w !== 6 && !HOLIDAYS[d]; };
export function mealDate() {
  if (S.ui.mealDate) return S.ui.mealDate;
  let d = todayStr(); let k = 0;
  // 오후 2시 이후에는 다음 수업일 식단을 먼저 보여 준다
  if (new Date().getHours() >= 14) d = addDays(d, 1);
  while (!isSchoolDay(d) && k++ < 10) d = addDays(d, 1);
  return d;
}
async function loadMeal(d) {
  const c = conf(); const key = `${c.mealSchool}:${ymd(d)}`;
  if (meals.has(key)) return;
  meals.set(key, { status: 'loading' });
  try {
    const u = `https://open.neis.go.kr/hub/mealServiceDietInfo?Type=json&pIndex=1&pSize=5&ATPT_OFCDC_SC_CODE=${encodeURIComponent(c.mealOffice)}&SD_SCHUL_CODE=${encodeURIComponent(c.mealSchool)}&MLSV_YMD=${ymd(d)}`;
    const j = await (await fetch(u)).json();
    const rows = j.mealServiceDietInfo?.[1]?.row || [];
    meals.set(key, { status: rows.length ? 'ok' : 'none', rows });
  } catch { meals.set(key, { status: 'err' }); }
  fill('meal');
}
const dish = (s) => {
  const m = s.match(/^(.*?)\s*\(([\d.]+)\)\s*$/);
  const name = (m ? m[1] : s).replace(/[*$]+/g, '').replace(/\s+/g, ' ').trim();
  return `<li>${esc(name)}${m ? ` <span class="allergy" title="알레르기 유발 식품 번호">${esc(m[2])}</span>` : ''}</li>`;
};
export function mealBody() {
  const c = conf(); const d = mealDate(); const key = `${c.mealSchool}:${ymd(d)}`;
  const st = meals.get(key);
  if (!st || st.status === 'loading') { loadMeal(d); return mealFrame(d, '<p class="muted small">식단을 불러오는 중…</p>'); }
  if (st.status === 'err') return mealFrame(d, '<p class="muted small">식단을 불러오지 못했습니다(인터넷 연결 확인).</p>');
  if (st.status === 'none') return mealFrame(d, `<p class="muted small">${isSchoolDay(d) ? '이날 등록된 식단이 없습니다.' : '수업이 없는 날입니다.'}</p>`);
  const order = { 2: 0, 1: 1, 3: 2 };
  const rows = [...st.rows].sort((a, b) => (order[a.MMEAL_SC_CODE] ?? 9) - (order[b.MMEAL_SC_CODE] ?? 9));
  const pick = rows.find((r) => r.MMEAL_SC_NM === S.ui.mealKind) || rows[0];
  const tabs = rows.length > 1 ? `<div class="meal-tabs" role="tablist">${rows.map((r) => `<button type="button" role="tab" class="chip-btn ${r === pick ? 'on' : ''}" aria-selected="${r === pick}" data-act="meal-kind" data-k="${esc(r.MMEAL_SC_NM)}">${esc(r.MMEAL_SC_NM)}</button>`).join('')}</div>` : '';
  return mealFrame(d, `${tabs}<ul class="meal-list">${String(pick.DDISH_NM).split(/<br\s*\/?>/i).map((x) => x.trim()).filter(Boolean).map(dish).join('')}</ul>
    <p class="tiny muted">${esc(pick.CAL_INFO || '')} · 숫자는 알레르기 유발 식품 번호 · NEIS 급식식단정보</p>`);
}
const mealFrame = (d, inner) => `<div class="meal-head"><button type="button" class="ghost sm" data-act="meal-day" data-d="-1" aria-label="이전 날">‹</button><b>${esc(fmtDate(d))}${d === todayStr() ? ' 오늘' : ''}</b><button type="button" class="ghost sm" data-act="meal-day" data-d="1" aria-label="다음 날">›</button></div>${inner}`;

on('meal-day', (el) => { let d = addDays(mealDate(), Number(el.dataset.d)); let k = 0; while (!isSchoolDay(d) && k++ < 10) d = addDays(d, Number(el.dataset.d)); S.ui.mealDate = d; fill('meal'); });
on('meal-kind', (el) => { S.ui.mealKind = el.dataset.k; fill('meal'); });

/* ---------- 제자리 갱신(화면 전체를 다시 그리지 않음) ---------- */
const BODY = { weather: weatherBody, meal: mealBody };
function fill(name) { document.querySelectorAll(`[data-fill="${name}"]`).forEach((el) => { el.innerHTML = BODY[name](); }); }
setInterval(() => { if (document.querySelector('[data-fill="weather"]')) loadWeather(); }, 5 * 60000);
export function resetPlaceCache() { wx = { at: 0, data: null, air: null, err: '', key: '', busy: false }; meals.clear(); }

// 관리 화면: 학교 이름으로 NEIS 학교 코드 찾기
export async function findSchool(name) {
  const j = await (await fetch(`https://open.neis.go.kr/hub/schoolInfo?Type=json&pIndex=1&pSize=5&SCHUL_NM=${encodeURIComponent(name)}`)).json();
  return (j.schoolInfo?.[1]?.row || []).map((r) => ({ office: r.ATPT_OFCDC_SC_CODE, code: r.SD_SCHUL_CODE, name: r.SCHUL_NM, addr: r.ORG_RDNMA, kind: r.SCHUL_KND_SC_NM }));
}
