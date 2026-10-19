"""IEP톡 관찰 메모 점검(데모 모드): 빠른 기록, 자동 교과, 모아 보기, 거르기, 고치기, 지우기, 복사, 버튼 고치기"""
import asyncio, sys, os
OUT = os.environ.get('OUT', '/tmp')
from playwright.async_api import async_playwright
U='http://127.0.0.1:8765/index.html?demo=1'
errs=[]; ok=[]
def chk(c,m): (ok if c else errs).append(m)
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch()
    for vw in [(1440,900),(390,844)]:
      ctx=await b.new_context(viewport={'width':vw[0],'height':vw[1]},locale='ko-KR',permissions=['clipboard-read','clipboard-write'])
      pg=await ctx.new_page()
      pg.on('pageerror',lambda e: errs.append(f'pageerror {e}'))
      await pg.goto(U); await pg.evaluate('localStorage.clear()'); await pg.goto(U)
      await pg.click('[data-uid="u-admin"]'); await pg.wait_for_timeout(500); await pg.keyboard.press('Escape')
      await pg.goto(U+'#/student/s1/note'); await pg.wait_for_timeout(700); await pg.keyboard.press('Escape')
      main=pg.locator('#main')
      chk(await pg.locator('.nt-item').count()>=5, 'seed notes shown')
      chk('관찰 메모' in await pg.inner_text('.tabs'), 'tab exists')
      # 공유 메모 탭에 관찰 메모가 섞이지 않음
      await pg.goto(U+'#/student/s1/memo'); await pg.wait_for_timeout(400)
      chk('받아쓰기 10문항' not in await main.inner_text(), 'shared memo excludes notes')
      await pg.goto(U+'#/student/s1/note'); await pg.wait_for_timeout(400)
      # 빠른 기록
      await pg.fill('[data-nt-text="s1"]', '수학 학습지 3쪽 중 2쪽 완성')
      await pg.click('[data-act="nt-chip"][data-k="subj"][data-v="수학"]')
      chk(await pg.input_value('[data-nt-text="s1"]')=='수학 학습지 3쪽 중 2쪽 완성', 'draft kept after chip click')
      await pg.click('[data-act="nt-chip"][data-k="sit"][data-v="수업 중"]')
      await pg.click('[data-act="nt-chip"][data-k="tag"][data-v="학습 반응"]')
      await pg.click('[data-act="nt-chip"][data-k="tag"][data-v="잘한 점·성장"]')
      await pg.fill('[data-nt-text="s1"]', '수학 학습지 3쪽 중 2쪽 완성, 나머지는 「쉬어도 돼요?」라고 물음')
      await pg.press('[data-nt-text="s1"]', 'Control+Enter'); await pg.wait_for_timeout(400)
      t=await main.inner_text()
      chk('나머지는 「쉬어도 돼요?」' in t, 'ctrl+enter saved')
      chk(await pg.input_value('[data-nt-text="s1"]')=='', 'textarea cleared')
      chk(await pg.locator('[data-act="nt-chip"][data-k="subj"][data-v="수학"].on').count()==1, 'subject kept for next note')
      # 모아 보기
      await pg.click('[data-act="nt-view"][data-v="subj"]'); await pg.wait_for_timeout(200)
      ghs=[x.strip() for x in await pg.locator('.nt-gh').all_inner_texts()]
      chk(any(h.startswith('수학') for h in ghs), f'subject grouping {ghs}')
      await pg.click('[data-act="nt-view"][data-v="sit"]'); await pg.wait_for_timeout(200)
      ghs=[x.strip() for x in await pg.locator('.nt-gh').all_inner_texts()]
      chk(any(h.startswith('수업 중') for h in ghs), 'situation grouping')
      # 거르기
      await pg.select_option('select[data-f="subj"]', '수학'); await pg.wait_for_timeout(200)
      chk(await pg.locator('.nt-item').count()==2, 'filter by subject')
      await pg.select_option('select[data-f="subj"]', ''); await pg.wait_for_timeout(200)
      await pg.check('input[data-f="star"]'); await pg.wait_for_timeout(200)
      chk(await pg.locator('.nt-item').count()==2, 'star filter')
      await pg.uncheck('input[data-f="star"]'); await pg.wait_for_timeout(200)
      await pg.fill('input[data-f="q"]', '물 줄까'); await pg.press('input[data-f="q"]', 'Enter'); await pg.wait_for_timeout(200)
      chk(await pg.locator('.nt-item').count()==1, 'text search')
      # 복사
      await pg.click('[data-act="nt-copy"]'); await pg.wait_for_timeout(200)
      clip=await pg.evaluate('navigator.clipboard.readText()')
      chk(clip.startswith('관찰 메모 1건') and '물 줄까' in clip and '[점심·급식/사회성·또래]' in clip, 'copy text')
      await pg.fill('input[data-f="q"]', ''); await pg.press('input[data-f="q"]', 'Enter'); await pg.wait_for_timeout(200)
      # 고치기
      n0=await pg.locator('.nt-item').count()
      await pg.locator('[data-act="nt-edit"]').first.click(); await pg.wait_for_selector('.modal')
      await pg.fill('.modal textarea[name="text"]', '고친 내용 확인')
      await pg.click('.modal [type=submit]'); await pg.wait_for_timeout(300)
      chk('고친 내용 확인' in await main.inner_text(), 'edit saved')
      # 지우기(두 번 누름)
      d=pg.locator('[data-act="nt-del"]').first; await d.click(); await d.click(); await pg.wait_for_timeout(300)
      chk(await pg.locator('.nt-item').count()==n0-1, 'delete')
      # 버튼 고치기
      await pg.click('[data-act="nt-chips-edit"]'); await pg.wait_for_selector('.modal textarea[name="sit"]')
      v=await pg.input_value('.modal textarea[name="sit"]'); await pg.fill('.modal textarea[name="sit"]', v+'\n특별실(음악실)')
      await pg.click('.modal [type=submit]'); await pg.wait_for_timeout(300)
      chk(await pg.locator('[data-act="nt-chip"][data-k="sit"][data-v="특별실(음악실)"]').count()==1, 'custom situation chip')
      ow=await pg.evaluate('document.documentElement.scrollWidth - window.innerWidth')
      chk(ow<=1, f'no hscroll {ow}')
      await pg.screenshot(path=f'{OUT}/notes_{vw[0]}.png', full_page=False)
      await ctx.close()
    await b.close()
asyncio.run(main())
print('OK',len(ok)); print('\n'.join('FAIL '+e for e in errs)); sys.exit(1 if errs else 0)
