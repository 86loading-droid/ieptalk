"""IEP톡 v22 점검: IEP 전체 흐름, 행동지원 시각자료, 둘러보기 링크(데모 모드)
실행: python3 -m http.server 8765 (저장소 폴더) 뒤 OUT=/tmp/shots python3 tools/v22-test.py"""
import asyncio, os
OUT = os.environ.get('OUT', '/tmp')
from playwright.async_api import async_playwright
B = 'http://127.0.0.1:8765/index.html'
errs = []; ok = []
def chk(c, m): (ok if c else errs).append(m)

async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch()
    for vw in [(1440, 900), (390, 844)]:
      ctx = await b.new_context(viewport={'width': vw[0], 'height': vw[1]}, locale='ko-KR')
      pg = await ctx.new_page()
      pg.on('pageerror', lambda e: errs.append(f'pageerror {e}'))
      # ---- 둘러보기 링크: 로그인 화면 없이 바로 가상 교사로 ----
      await pg.goto(B + '?demo=1&tour=1'); await pg.wait_for_selector('#tour-bar', timeout=8000)
      chk(await pg.locator('.user-pick').count() == 0, 'no login screen')
      chk(await pg.locator('.modal-back').count() == 0, 'no first guide modal')
      chk('둘러보기 1 /' in await pg.inner_text('#tour-bar'), 'tour step 1')
      await pg.click('#tour-bar [data-tour="1"]'); await pg.wait_for_timeout(500)
      chk('#/student/s1/flow' in pg.url and 'IEP 전체 흐름' in await pg.inner_text('#tour-bar'), 'tour → flow')
      # ---- IEP 전체 흐름 ----
      t = await pg.inner_text('#main')
      for k in ['학생 이해', '평가', 'IEP 목표', '교수·지원 계획', '행동 지원', '진전도 점검', '학기말 평가']:
        chk(k in t, 'step ' + k)
      chk(await pg.locator('.fl-st.ok').count() >= 4, 'statuses')
      chk('소리 지르기' in t and '기능 가설' in t, 'behavior in flow')
      chk(await pg.locator('.fl-spark').count() >= 1, 'sparkline')
      await pg.click('#tour-bar [data-tour="2"]'); await pg.wait_for_timeout(1200)
      chk(await pg.locator('.ig').count() == 1, 'tour opens iep generator')
      for k in ['3', '4', '5']: await pg.click(f'#tour-bar [data-tour="{k}"]'); await pg.wait_for_timeout(500)
      await pg.wait_for_timeout(900)
      chk(await pg.locator('.vis-modal').count() == 1, 'tour opens visual picker')
      # ---- 시각자료 고르기 ----
      chk(await pg.locator('.vis-modal [data-vc="sug"].on').count() == 1, 'suggest tab default')
      sug = await pg.locator('.vis-pick .vis-opt').count()
      chk(sug >= 5, f'suggested visuals {sug}')
      await pg.click('.vis-modal [data-vc="all"]'); chk(await pg.locator('.vis-pick .vis-opt').count() == 17, '17 visuals')
      await pg.click('.vis-modal [data-vt="break"]'); await pg.click('.vis-modal [data-vt="firstthen"]'); await pg.click('.vis-modal [data-vt="token"]')
      await pg.fill('.vis-modal [data-vcap="break"]', '쉬고 싶어요')
      await pg.select_option('.vis-modal [data-vtid="break"]', index=1)
      await pg.click('.vis-modal [data-vsave]'); await pg.wait_for_timeout(400)
      chk(await pg.locator('.fl .vis-card').count() == 3, 'visuals in flow')
      chk('쉬고 싶어요' in await pg.inner_text('.fl'), 'caption kept')
      await pg.evaluate('window.print=()=>{}')
      await pg.click('[data-act="vis-print"]'); await pg.wait_for_timeout(200)
      chk(await pg.locator('#print-root .vis-card.big').count() == 3, 'card print')
      await pg.evaluate("document.body.classList.remove('printing')")
      await pg.click('[data-act="fl-print"]'); await pg.wait_for_timeout(200)
      pr = await pg.inner_text('#print-root')
      chk('IEP 전체 흐름' in pr and '학기말 평가' in pr and await pg.locator('#print-root .vis-card').count() == 3, 'flow print with images')
      chk(await pg.locator('#print-root [data-act="vis-pick"]').count() == 0, 'no buttons in print')
      await pg.evaluate("document.body.classList.remove('printing')")
      await pg.click('[data-act="fl-go"][data-k="prog"]'); await pg.wait_for_timeout(500)
      ow = await pg.evaluate('document.documentElement.scrollWidth - window.innerWidth')
      chk(ow <= 1, f'no hscroll flow {ow}')
      await pg.screenshot(path=f'{OUT}/v22_flow_{vw[0]}.png', full_page=True)
      # 마지막 단계·끝내기
      for k in ['6', '7', '8', '9']: await pg.click(f'#tour-bar [data-tour="{k}"]'); await pg.wait_for_timeout(400)
      chk('#/chat' in pg.url and '마치기' in await pg.inner_text('#tour-bar'), 'last step')
      await pg.click('#tour-bar [data-tour="end"]'); await pg.wait_for_timeout(200)
      chk(await pg.locator('#tour-bar').count() == 0, 'tour ended')
      await ctx.close()
    # 보조인력 투어: IEP 자료가 보이지 않아야 함
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, locale='ko-KR'); pg = await ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(f'pageerror {e}'))
    await pg.goto(B + '?demo=1&tour=1&as=aide'); await pg.wait_for_selector('#tour-bar', timeout=8000)
    chk('보조인력' in await pg.inner_text('#tour-bar'), 'aide tour')
    chk('IEP 전체 흐름' not in await pg.inner_text('#app'), 'aide no iep')
    await ctx.close()
    await b.close()
asyncio.run(main())
print('OK', len(ok)) if not errs else print('FAIL', errs, 'ok', len(ok))
