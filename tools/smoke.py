"""IEP톡 데모 모드 점검: 화면별 오류, 휴대폰 보조인력 기록, 교사 간 실시간 메시지·예약"""
import asyncio, sys, os
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:8765/index.html?demo=1'
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/shots'
os.makedirs(OUT, exist_ok=True)
errors = []

def watch(page, tag):
    page.on('console', lambda m: errors.append(f'[{tag}] console.{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: errors.append(f'[{tag}] pageerror: {e}'))

async def login(page, uid):
    await page.goto(BASE)
    await page.wait_for_selector('.user-pick')
    await page.click(f'[data-uid="{uid}"]')
    await page.wait_for_selector('#main .page-head, #main .chat', timeout=8000)

async def no_hscroll(page, tag):
    w = await page.evaluate('document.documentElement.scrollWidth - window.innerWidth')
    if w > 1: errors.append(f'[{tag}] horizontal overflow {w}px')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # 교사(데스크톱)
        ctx = await b.new_context(viewport={'width': 1280, 'height': 860}, locale='ko-KR')
        t1 = await ctx.new_page(); watch(t1, 'admin')
        await t1.goto(BASE); await t1.evaluate('localStorage.clear()')
        await login(t1, 'u-admin')
        for r in ['today', 'students', 'student/s1/goals', 'student/s1/behavior', 'student/s1/memo', 'behavior', 'chat', 'chat/r-s1', 'calendar', 'admin']:
            await t1.goto(BASE + '#/' + r); await t1.wait_for_timeout(500)
            await no_hscroll(t1, 'admin ' + r)
            await t1.screenshot(path=f'{OUT}/desk_{r.replace("/", "_")}.png', full_page=True)
        # 진전도 경고 확인(하람 의사소통 목표)
        await t1.goto(BASE + '#/student/s1/goals'); await t1.wait_for_timeout(300)
        warn = await t1.locator('.alert.warn').count()
        print('progress warnings on s1:', warn)
        # 두 번째 교사(다른 탭) 실시간 메시지
        t2 = await ctx.new_page(); watch(t2, 'teacher2')
        await login(t2, 'u-t2')
        await t2.goto(BASE + '#/chat/r-s1'); await t2.wait_for_selector('.composer textarea')
        await t2.fill('.composer textarea', '@김하늘 선생님, 내일 3교시에 관찰 가능합니다.')
        await t2.keyboard.press('Enter')
        await t1.goto(BASE + '#/chat/r-s1'); await t1.wait_for_timeout(800)
        got = await t1.locator('.msg >> text=내일 3교시').count()
        print('realtime message received by admin:', got)
        # 전화 예약: 받는 사람만 고르면 끝(제목·시각 없음)
        await t1.click('[data-act="call-new"]'); await t1.wait_for_selector('.notice-form')
        await t1.screenshot(path=f'{OUT}/desk_call_modal.png')
        await t1.click('.notice-form [type=submit]'); await t1.wait_for_timeout(600)
        # 회의 예약: admin → t2
        await t1.click('[data-act="room-meet"]'); await t1.wait_for_selector('.mt-form')
        await t1.click('.mt-form [type=submit]'); await t1.wait_for_timeout(600)
        await t2.goto(BASE + '#/calendar'); await t2.wait_for_timeout(600)
        pend = await t2.locator('.card.attn .mcard').count()
        print('pending invites for t2:', pend)
        if pend:
            await t2.locator('.card.attn [data-v="accepted"]').first.click(); await t2.wait_for_timeout(500)
        await t2.screenshot(path=f'{OUT}/desk_t2_calendar.png', full_page=True)
        # 행동 즉시 기록(교사)
        await t1.goto(BASE + '#/behavior'); await t1.wait_for_timeout(400)
        before = await t1.locator('.rows li .row-btn').count()
        await t1.locator('[data-act="rec-tap"]').first.click(); await t1.wait_for_timeout(500)
        after = await t1.locator('.rows li .row-btn').count()
        print('teacher quick record rows', before, '->', after)
        # 보조인력(휴대폰)
        mctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, locale='ko-KR')
        a = await mctx.new_page(); watch(a, 'aide')
        await login(a, 'u-a1')
        await a.screenshot(path=f'{OUT}/mob_aide_record.png', full_page=True)
        await no_hscroll(a, 'aide record')
        studs = await a.locator('.rec-card').count()
        print('aide sees student cards:', studs)
        await a.locator('[data-act="rec-tap"]').first.tap(); await a.wait_for_timeout(500)
        await a.goto(BASE + '#/mine'); await a.wait_for_timeout(400)
        mine = await a.locator('.row-btn').count()
        print('aide own records:', mine)
        await a.locator('.row-btn').first.tap(); await a.wait_for_selector('.modal')
        await a.locator('.modal .chip:has-text("과제 제시")').first.tap()
        await a.screenshot(path=f'{OUT}/mob_aide_edit.png')
        await a.click('.modal [type=submit]'); await a.wait_for_timeout(400)
        await a.screenshot(path=f'{OUT}/mob_aide_mine.png', full_page=True)
        # 보조인력은 메신저·학생 화면에 갈 수 없음
        await a.goto(BASE + '#/chat'); await a.wait_for_timeout(300)
        h1 = await a.locator('h1').first.inner_text()
        print('aide redirected heading:', h1)
        # 교사 휴대폰 화면
        tm = await mctx.new_page(); watch(tm, 'teacher-mobile')
        await login(tm, 'u-t3')
        for r in ['today', 'chat', 'chat/r-all', 'calendar', 'student/s2/behavior']:
            await tm.goto(BASE + '#/' + r); await tm.wait_for_timeout(400)
            await no_hscroll(tm, 'mobile ' + r)
            await tm.screenshot(path=f'{OUT}/mob_{r.replace("/", "_")}.png', full_page=True)
        await b.close()
    print('ERRORS:', len(errors))
    for e in errors: print(' ', e)

asyncio.run(main())
