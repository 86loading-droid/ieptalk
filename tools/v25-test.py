"""IEP톡 v25 점검: 교사용 지도서 단원·차시·단원 성취기준이 IEP 생성기에 들어오는지
실행: python3 -m http.server 8765 (저장소 폴더) 뒤 OUT=/tmp/shots python3 tools/v25-test.py"""
import asyncio, os, json
OUT = os.environ.get('OUT', '/tmp')
from playwright.async_api import async_playwright
B = 'http://127.0.0.1:8765/index.html'
errs = []; ok = []
def chk(c, m): (ok if c else errs).append(m)
IDX = json.load(open(os.path.join(os.path.dirname(__file__), '..', 'data', 'guide', 'index.json')))
chk(len(IDX['keys']) >= 40, f"guide keys {len(IDX['keys'])}")
CASES = [('초5', 'kor', '6국어01-05', '바르고 고운 말'), ('초3', 'soc', '4사회01-01', '소중한 나'), ('초1', 'bs', None, None), ('중1', 'career', None, None),
         ('고2', 'kor', None, None), ('초6', 'prac', None, None), ('중2', 'sci', None, None), ('고1', 'music', None, None)]

async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch()
    for vw in [(1440, 900), (390, 844)]:
      pg = await b.new_page(viewport={'width': vw[0], 'height': vw[1]})
      pg.on('pageerror', lambda e: errs.append(f'pageerror {e}'))
      await pg.goto(B + '?demo=1&as=admin#/student/s1/goals'); await pg.wait_for_timeout(1200); await pg.keyboard.press('Escape')
      await pg.click('[data-act="iep-gen"]'); await pg.wait_for_selector('.ig [data-ig="grade"]')
      for g, sj, code, unit in CASES:
        await pg.click(f'.ig [data-ig="grade"][data-v="{g}"]'); await pg.wait_for_timeout(200)
        await pg.click(f'.ig [data-ig="subj"][data-v="{sj}"]'); await pg.wait_for_selector('.ig [data-igin="unit"]', timeout=8000)
        units = await pg.locator('.ig [data-igin="unit"] option').all_inner_texts()
        chk(len(units) >= 4, f'{g} {sj} units {len(units) - 2}')
        if unit: chk(any(unit in u for u in units), f'{g} {sj} unit title {unit}')
        await pg.select_option('.ig [data-igin="unit"]', index=1); await pg.wait_for_timeout(300)
        chk(await pg.locator('.ig-unit').count() == 1, f'{g} {sj} unit panel')
        v = await pg.eval_on_selector('.ig [data-igin="code"]', 'e=>e.value')
        if code: chk(v == code, f'{g} {sj} auto code {v}')
        n = await pg.locator('.ig [data-igin="lesson"] option').count()
        chk(n >= 3, f'{g} {sj} lessons {n - 2}')
        await pg.select_option('.ig [data-igin="lesson"]', index=1); await pg.wait_for_timeout(300)
        if not v:
          await pg.select_option('.ig [data-igin="code"]', index=1); await pg.wait_for_timeout(300)
        doc = await pg.input_value('.ig-edit')
        chk('이 차시(지도서)' in doc, f'{g} {sj} lesson in draft')
        chk('교사용 지도서에서' in doc, f'{g} {sj} source note')
      # 지도서 성취기준 단추 누르면 성취기준이 바뀜
      await pg.click('.ig [data-ig="grade"][data-v="초5"]'); await pg.click('.ig [data-ig="subj"][data-v="kor"]'); await pg.wait_for_selector('.ig [data-igin="unit"]')
      await pg.select_option('.ig [data-igin="unit"]', index=1); await pg.wait_for_timeout(300)
      chips = pg.locator('.ig-unit [data-ig="code"]')
      if await chips.count() > 1:
        v2 = await chips.nth(1).get_attribute('data-v'); await chips.nth(1).click(); await pg.wait_for_timeout(200)
        chk(await pg.eval_on_selector('.ig [data-igin="code"]', 'e=>e.value') == v2, 'chip sets code')
      # 지도서가 없는 교과는 직접 입력
      await pg.click('.ig [data-ig="grade"][data-v="중1"]'); await pg.click('.ig [data-ig="subj"][data-v="ict"]'); await pg.wait_for_timeout(400)
      chk(await pg.locator('.ig [data-igin="unitFree"]').count() == 1, 'no guide → free input')
      ow = await pg.evaluate('document.documentElement.scrollWidth - window.innerWidth')
      chk(ow <= 1, f'no hscroll {ow}')
      await pg.screenshot(path=f'{OUT}/v25_gen_{vw[0]}.png')
      await pg.close()
    await b.close()
asyncio.run(main())
print('OK', len(ok)) if not errs else print('FAIL', errs, 'ok', len(ok))
