# 함께 넣은 라이브러리

학사일정 파일 읽기(관리 → 학사일정 파일로 넣기)에서만, 필요할 때 불러온다. 파일은 브라우저 안에서만 읽는다.

| 파일 | 라이브러리 | 판 | 사용 허가 |
|---|---|---|---|
| parsers.js | SheetJS xlsx (엑셀 읽기·양식 만들기) | 0.18.5 | Apache-2.0 |
| parsers.js | SheetJS cfb (한글 hwp 복합 문서) | 1.2.2 | Apache-2.0 |
| parsers.js | fflate (hwp 압축 풀기, hwpx 열기) | 0.8.3 | MIT |
| pdfjs/ | Mozilla pdf.js legacy build (PDF 글자 읽기, 한국어 CMap만 포함) | 4.10.38 | Apache-2.0 (pdfjs/LICENSE) |
| firebase.js | Firebase JS SDK | 12.x | Apache-2.0 |

다시 만들기: `npx esbuild tools/parse-entry.js --bundle --format=esm --minify --platform=browser --outfile=js/vendor/parsers.js`
