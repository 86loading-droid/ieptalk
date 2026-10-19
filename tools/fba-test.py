"""IEP톡 기능평가·분석 솔루션·IEP 생성기 점검(데모 모드)"""
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
      chk('가상 학생 전용' in await pg.inner_text('.brand'), 'demo pill')
      # 기능평가 탭
      await pg.goto(U+'#/student/s1/fba'); await pg.wait_for_timeout(700); await pg.keyboard.press('Escape')
      t=await pg.inner_text('#main')
      chk('기능 종합' in t and '주된 기능: 회피·도피' in t, 'profile esc')
      chk('근거 4종' in t, 'four sources: '+ (t[t.find('근거'):t.find('근거')+20] if '근거' in t else ''))
      chk('문제행동으로 전하는 기능' in t and '휴식 요청' in t, 'comm summary')
      # 동기평가 새로
      await pg.click('[data-act="fa-mas"]:not([data-id])'); await pg.wait_for_selector('.fa-items')
      for i in range(16):
        await pg.locator(f'.fa-scale label:has(input[name="q{i}"][value="{4 if i%4==2 else 1}"]) span').first.click()
      chk('관심 끌기 4' in await pg.inner_text('.fa-live'), 'live score')
      await pg.click('.modal [type=submit]'); await pg.wait_for_timeout(300)
      chk(await pg.locator('.fa-list > li').count()==3, 'mas saved')
      # ABC 추가
      await pg.click('[data-act="fa-abc"]:not([data-id])'); await pg.wait_for_selector('.modal textarea[name=b]')
      await pg.click('.modal [data-fk="a"][data-v="요구 거절"]'); await pg.fill('.modal textarea[name=b]','바닥에 누워 소리 지름 약 1분')
      await pg.click('.modal [data-fk="c"][data-v="물건·활동 얻음"]')
      chk(await pg.locator('.modal [data-fk="fn"][data-v="tan"].on').count()==1, 'fn auto from C')
      await pg.click('.modal [type=submit]'); await pg.wait_for_timeout(300)
      chk('바닥에 누워 소리 지름' in await pg.inner_text('#main'), 'abc saved')
      # 의사소통
      await pg.click('[data-act="fa-comm"]'); await pg.wait_for_selector('.fa-cgrid')
      await pg.check('.modal input[name="call"][value="pb"]'); await pg.click('.modal [type=submit]'); await pg.wait_for_timeout(300)
      chk('관심 끌기(부르기)' in await pg.inner_text('.fa-comm-r.pb >> nth=0') or await pg.locator('.fa-comm-r.pb').count()>=4, 'comm saved')
      # 공유 메모 탭에서 섞이지 않음
      await pg.goto(U+'#/student/s1/memo'); await pg.wait_for_timeout(400)
      chk('바닥에 누워' not in await pg.inner_text('#main'), 'memo tab excludes fa')
      # 행동 탭 솔루션
      await pg.goto(U+'#/student/s1/behavior'); await pg.wait_for_timeout(600)
      t=await pg.inner_text('.sol')
      chk('시각적 분석' in t and '기초선' in t, 'sol analysis')
      chk('중재 전략 제안' in t, 'sol strategies')
      await pg.click('[data-act="sol-copy"]'); await pg.wait_for_timeout(200)
      clip=await pg.evaluate('navigator.clipboard.readText()')
      chk(clip.startswith('행동지원계획 초안') and '기능 가설' in clip, 'plan copy')
      # 중재 시작 후 B 자료가 있으면 효과 판단(데모 자료 b1에 중재 단계 설정)
      await pg.evaluate('''async()=>{const {S}=await import('./js/state.js'); const {todayStr,addDays}=await import('./js/util.js');
        const t=todayStr(); await S.store.update('targets',{sid:'s1'},'b1',{interventionStart:addDays(t,-3),phase:'intervention'});
        for (let k=3;k>=0;k--){ const d=addDays(t,-k); const at=new Date(d+'T10:00').getTime(); await S.store.create('bevents',{},{studentId:'s1',targetId:'b1',type:'session',at,date:d,createdBy:S.me.uid,createdAt:Date.now()}); }}''')
      await pg.wait_for_timeout(500)
      t=await pg.inner_text('.sol')
      chk('중재' in t and '중첩' in t and 'PND' in t, 'B-phase analysis')
      chk(await pg.locator('.chart .b-mean').count()>=1, 'B mean line')
      # IEP 생성기
      await pg.goto(U+'#/student/s1/goals'); await pg.wait_for_timeout(400)
      await pg.click('[data-act="iep-gen"]'); await pg.wait_for_selector('.ig')
      await pg.click('.ig [data-mode="life"]')
      await pg.click('.ig [data-ig="course"][data-v="e-basic"]'); await pg.click('.ig [data-ig="dis"][data-v="aut"]'); await pg.click('.ig [data-ig="dis"][data-v="int"]')
      await pg.click('.ig [data-ig="subj2"][data-v="수학"]'); await pg.click('.ig [data-ig="area"][data-v="생활 수학(돈·시간)"]')
      doc=await pg.input_value('.ig-edit')
      chk('장기 목표' in doc and '단기 목표' in doc and '동전과 지폐 구별하기를' in doc, 'iep built')
      chk('그림 일과표' in doc and '과제 분석' in doc, 'supports merged')
      await pg.click('.ig [data-ig="level"][data-v="2"]'); doc=await pg.input_value('.ig-edit')
      chk('물건 값만큼 돈 내기(1,000원 안)를' in doc, 'level change')
      await pg.click('.ig [data-ig-act="copy"]'); await pg.wait_for_timeout(200)
      chk((await pg.evaluate('navigator.clipboard.readText()')).startswith('IEP 초안'), 'iep copy')
      n0=await pg.locator('.card.goal').count()
      await pg.click('.ig [data-ig-act="save"]'); await pg.wait_for_timeout(300)
      await pg.click('.ig [data-close]'); await pg.wait_for_timeout(300)
      chk(await pg.locator('.card.goal').count()==n0+1, 'goal saved')
      chk('수학·생활 수학(돈·시간)' in await pg.inner_text('#main'), 'goal domain')
      await pg.click('[data-act="iep-gen"]'); await pg.wait_for_selector('.ig')
      await pg.click('.ig [data-mode="life"]')
      await pg.click('.ig [data-ig="course"][data-v="kinder"]')
      chk(await pg.locator('.ig [data-ig="subj2"][data-v="자연탐구"]').count()==1, 'kinder areas')
      ow=await pg.evaluate('document.documentElement.scrollWidth - window.innerWidth')
      chk(ow<=1, f'no hscroll {ow}')
      await pg.screenshot(path=f'{OUT}/iepgen_{vw[0]}.png')
      await pg.click('.ig [data-close]')
      await pg.goto(U+'#/student/s1/behavior'); await pg.wait_for_timeout(500)
      await pg.locator('.sol').scroll_into_view_if_needed(); await pg.screenshot(path=f'{OUT}/sol_{vw[0]}.png')
      await pg.goto(U+'#/student/s1/fba'); await pg.wait_for_timeout(500); await pg.screenshot(path=f'{OUT}/fba_{vw[0]}.png')
      await ctx.close()
    await b.close()
asyncio.run(main())
print('OK',len(ok)); print('\n'.join('FAIL '+e for e in errs)); sys.exit(1 if errs else 0)
