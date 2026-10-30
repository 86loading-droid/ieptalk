"""배포 판 번호 붙이기: python3 tools/stamp.py 29
index.html의 css·app.js 판 번호를 바꾸고, js 폴더의 모든 모듈(외부 라이브러리 js/vendor 제외)을
가져오기 지도(import map)로 같은 판 번호에 묶는다. 그러면 새 판을 올린 직후에도 브라우저가 옛 화면 파일을 붙잡지 않는다.
(js/views/*.js 처럼 판 번호 없이 서로 불러오는 파일도 지도에 따라 ?v=판 으로 받아 온다.)"""
import json, pathlib, re, sys
root = pathlib.Path(__file__).resolve().parent.parent
v = sys.argv[1]
files = sorted(p.relative_to(root).as_posix() for p in (root / 'js').rglob('*.js') if 'vendor' not in p.parts)
imap = {'imports': {f'./{f}': f'./{f}?v={v}' for f in files}}
block = '<script type="importmap">\n' + json.dumps(imap, ensure_ascii=False, indent=1) + '\n  </script>'
html = (root / 'index.html').read_text(encoding='utf-8')
html = re.sub(r'<script type="importmap">.*?</script>\s*', '', html, flags=re.S)
html = re.sub(r'(css/app\.css|js/app\.js)\?v=\d+', lambda m: f'{m.group(1)}?v={v}', html)
html = html.replace('<script type="module" src=', block + '\n  <script type="module" src=', 1)
(root / 'index.html').write_text(html, encoding='utf-8')
print('stamped', v, len(files), 'modules')
