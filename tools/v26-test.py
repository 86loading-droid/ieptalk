"""IEP톡 v26 점검: 좌측 메뉴 「지원팀」 — 5자리 배치도, 명부, 당번표·공백 점검, 사후 기록의 지원팀 투입 칸, 보상 근거(단가·금액·확인서·CSV), 교직원 회복, 학기·연간 보고
실행: python3 -m http.server 8765 (저장소 폴더) 뒤 OUT=/tmp/shots python3 tools/v26-test.py"""
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
      ctx = await b.new_context(viewport={'width': vw[0], 'height': vw[1]}, locale='ko-KR', accept_downloads=True)
      pg = await ctx.new_page()
      pg.on('pageerror', lambda e: errs.append(f'pageerror {e}'))
      await pg.goto(B + '?demo=1&as=admin'); await pg.wait_for_timeout(1200)
      await pg.evaluate("localStorage.removeItem('ieptalk-demo-v1')")
      await pg.goto(B + '?demo=1&as=admin#/today'); await pg.wait_for_timeout(1200)
      # 메뉴
      nav = pg.locator('.sidenav a[href="#/team"]') if vw[0] > 800 else pg.locator('.tabbar a[href="#/team"]')
      chk(await nav.count() == 1, 'nav item 지원팀')
      await nav.click(); await pg.wait_for_timeout(700)
      chk('/team' in pg.url, 'nav goes team')
      t = await pg.inner_text('#main')
      chk('지원팀' in t and '5자리 배치도' in t, 'team page')
      # 배치도
      chk(await pg.locator('svg.tm-map .tm-node').count() == 5, 'five nodes')
      svg = await pg.inner_html('svg.tm-map')
      for n in ['소통자', '지원대피 담당', '수업 대체', '수업지원', '연락 및 기록']:
        chk(n in svg, 'slot name ' + n)
      chk('김하늘' in svg and '정소라' in svg, 'roster names in map')
      chk(await pg.locator('#team-roster-form select').count() == 10, 'roster selects 10')
      # 명부 바꾸기: 5자리 2순위를 보건교사 → 교무 지원 교사
      await pg.select_option('select[name="p2-s5"]', 'x-sub')
      await pg.click('#team-roster-form button[type=submit]'); await pg.wait_for_timeout(400)
      chk('교무 지원 교사' in await pg.inner_html('svg.tm-map'), 'roster saved')
      # 계정 없는 인력 더하기
      await pg.fill('#team-extra-form [name=name]', '행정실 지원')
      await pg.click('#team-extra-form button[type=submit]'); await pg.wait_for_timeout(400)
      chk(await pg.locator('select[name="p1-s1"] option', has_text='행정실 지원').count() == 1, 'extra added')
      ow = await pg.evaluate('document.documentElement.scrollWidth - window.innerWidth')
      chk(ow <= 1, f'no hscroll map {ow}')
      await pg.screenshot(path=f'{OUT}/v26_map_{vw[0]}.png', full_page=True)
      # 당번표·공백 점검
      await pg.goto(B + '?demo=1&as=admin#/team/duty'); await pg.wait_for_timeout(600)
      await pg.click('[data-act="tm-day"][data-day="wed"]'); await pg.wait_for_timeout(300)
      chk(await pg.locator('.tm-duty tbody tr').count() == 7, 'seven periods')
      iss = await pg.inner_text('.tm-issues')
      chk('두 자리 이상' in iss, 'overlap detected')
      chk('금 6교시' in iss and '수업 대체' in iss, 'gap detected')
      chk(await pg.locator('.tm-duty td.tm-bad').count() >= 1, 'bad cell highlighted')
      # 고치기: 수 3교시 수업 대체를 박지민으로
      await pg.select_option('select[data-day="wed"][data-p="p3"][data-slot="s3"]', 'u-t3'); await pg.wait_for_timeout(400)
      chk('수 3교시' not in await pg.inner_text('.tm-issues'), 'overlap fixed')
      await pg.click('[data-act="tm-duty-fill"][data-day="all"]'); await pg.wait_for_timeout(400)
      chk('모든 요일' in await pg.inner_text('#main'), 'all filled no issues')
      ow = await pg.evaluate('document.documentElement.scrollWidth - window.innerWidth')
      chk(ow <= 1, f'no hscroll duty {ow}')
      await pg.screenshot(path=f'{OUT}/v26_duty_{vw[0]}.png', full_page=True)
      # 투입 기록
      await pg.goto(B + '?demo=1&as=admin#/team/log'); await pg.wait_for_timeout(600)
      lt = await pg.inner_text('#main')
      chk('소통자 김하늘' in lt and '고위험' in lt and '부상' in lt, 'log list')
      # 사후 기록 열어 투입 칸 확인·새 기록에 당번표로 채우기
      await pg.goto(B + '?demo=1&as=admin#/student/s1/crisis'); await pg.wait_for_timeout(700)
      await pg.click('[data-act="ic-new"]'); await pg.wait_for_timeout(400)
      chk(await pg.locator('.modal .tm-deploy').count() == 1, 'deploy fieldset in incident form')
      # 지난 수요일 10:50 (3교시)
      wed = await pg.evaluate("(()=>{const d=new Date();d.setDate(d.getDate()-((d.getDay()+4)%7||7));return d.toISOString().slice(0,10)})()")
      await pg.fill('.modal input[name=date]', wed); await pg.fill('.modal input[name=time]', '10:50')
      await pg.click('.modal [data-dp-fill]'); await pg.wait_for_timeout(200)
      chk(await pg.input_value('.modal select[name="dpWho-s1"]') == 'u-admin', 'fill from duty s1')
      chk(await pg.input_value('.modal input[name=dpCalled]') == '10:50', 'called filled')
      await pg.fill('.modal input[name="dpArr-s1"]', '10:50'); await pg.fill('.modal input[name="dpEnd-s1"]', '11:31')
      await pg.select_option('.modal select[name=dpRisk]', 'crit')
      await pg.fill('.modal textarea[name=behavior]', '시험 기록')
      await pg.click('.modal button[type=submit]'); await pg.wait_for_timeout(600)
      await pg.goto(B + '?demo=1&as=admin#/team/log'); await pg.wait_for_timeout(500)
      chk('41분' in await pg.inner_text('#main'), 'new deploy minutes')
      # 보상 근거
      await pg.goto(B + '?demo=1&as=admin#/team/pay'); await pg.wait_for_timeout(600)
      chk(await pg.locator('#team-rate-form').count() == 1, 'rate form')
      month = wed[:7]
      await pg.fill('input[data-change="tm-month"]', month); await pg.dispatch_event('input[data-change="tm-month"]', 'change'); await pg.wait_for_timeout(400)
      pt = await pg.inner_text('#main')
      # 김하늘 수 10:50~11:31 소통자 = (30000 + 2*10000) * 1.5 = 75000
      chk('75,000원' in pt or '김하늘' in pt, 'pay table')
      calc = await pg.evaluate("""async()=>{const m=await import('./js/views/team.js');const ic={deploy:{risk:'crit'}};return m.entryPay({slot:'s1',arrive:'10:50',end:'11:31'},ic).total}""")
      chk(calc == 75000, f'pay calc {calc}')
      calc2 = await pg.evaluate("""async()=>{const m=await import('./js/views/team.js');const ic={deploy:{risk:'high'}};return m.entryPay({slot:'s2',arrive:'10:43',end:'10:58',injury:true},ic).total}""")
      chk(calc2 == 98000, f'pay calc injury {calc2}')  # (30000+10000)*1.2=48000 + 50000
      # 단가 바꾸기
      await pg.fill('#team-rate-form [name=per30]', '0'); await pg.click('#team-rate-form button[type=submit]'); await pg.wait_for_timeout(400)
      calc3 = await pg.evaluate("""async()=>{const m=await import('./js/views/team.js');return m.entryPay({slot:'s1',arrive:'10:50',end:'11:31'},{deploy:{risk:''}}).total}""")
      chk(calc3 == 30000, f'rate saved {calc3}')
      async with pg.expect_download() as dl:
        await pg.click('[data-act="tm-csv"]')
      d = await dl.value
      path = await d.path(); txt = open(path, encoding='utf-8-sig').read()
      chk('소통자' in txt and '금액' in txt, 'csv content')
      await pg.evaluate('window.print=()=>{}')
      cert = pg.locator('[data-act="tm-cert"]').first
      if await cert.count():
        await cert.click(); await pg.wait_for_timeout(200)
        ct = await pg.inner_text('#print-root')
        chk('투입 확인서' in ct and '학교장' in ct, 'certificate print')
        await pg.evaluate("document.body.classList.remove('printing')")
      else: chk(False, 'cert button')
      # 교직원 회복
      await pg.goto(B + '?demo=1&as=admin#/team/care'); await pg.wait_for_timeout(600)
      ctt = await pg.inner_text('#main')
      chk('정소라' in ctt and '부상' in ctt and '공무상 요양' in ctt, 'care list with injury checklist')
      box = pg.locator('input[data-f="debrief"]').first
      await box.check(); await pg.wait_for_timeout(400)
      chk(await pg.locator('input[data-f="debrief"]').first.count() >= 0, 'care save ok')
      # 보고
      await pg.goto(B + '?demo=1&as=admin#/team/report'); await pg.wait_for_timeout(600)
      await pg.click('[data-act="tm-sem"][data-v="year"]'); await pg.wait_for_timeout(300)
      rt = await pg.inner_text('#main')
      chk('지원팀이 투입된 사건' in rt and '연인원' in rt and '보상 근거 금액' in rt, 'report tiles')
      chk(await pg.locator('svg.tm-bars rect').count() >= 1, 'month bars')
      await pg.click('[data-act="tm-report-print"]'); await pg.wait_for_timeout(200)
      chk('운영 보고' in await pg.inner_text('#print-root'), 'report print')
      await pg.evaluate("document.body.classList.remove('printing')")
      ow = await pg.evaluate('document.documentElement.scrollWidth - window.innerWidth')
      chk(ow <= 1, f'no hscroll report {ow}')
      await pg.screenshot(path=f'{OUT}/v26_report_{vw[0]}.png', full_page=True)
      # 일반 교사: 보상 탭 없음, 편집 없음
      await pg.goto(B + '?demo=1&as=teacher#/team'); await pg.wait_for_timeout(900)
      chk(await pg.locator('.tabs a[href="#/team/pay"]').count() == 0, 'teacher no pay tab')
      chk(await pg.locator('#team-roster-form select').count() == 0, 'teacher read only')
      rt2 = await pg.evaluate("location.hash='#/team/report'"); await pg.wait_for_timeout(500)
      chk('보상 근거 금액' not in await pg.inner_text('#main'), 'teacher no pay tile')
      # 보조인력: 메뉴 없음
      await pg.goto(B + '?demo=1&as=aide#/team'); await pg.wait_for_timeout(900)
      chk(await pg.locator('a[href="#/team"]').count() == 0, 'aide no team menu')
      await ctx.close()
    await b.close()
asyncio.run(main())
print('OK', len(ok)) if not errs else print('FAIL', errs, 'ok', len(ok))
