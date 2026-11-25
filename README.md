# beat-note

악보 PDF를 글자와 박자만 보이는 연습용 HTML(박자 노트)로 바꾸는 웹사이트입니다.
악보를 서버로 보내지 않고, 변환을 모두 브라우저 안에서 합니다.

## 상태

공개 주소: https://beat-note.vercel.app

PLAN.md의 단계를 모두 마쳤습니다. main에 push하면 자동으로 배포됩니다.

- [PLAN.md](PLAN.md): 단계별 계획과 진행 상황
- [DEVLOG.md](DEVLOG.md): 단계마다 한 일, 측정 결과, 실패와 결정

## 실행

Node.js 24 이상이 필요합니다.

```sh
npm ci
npm run dev        # 개발 서버
npm run typecheck  # 타입 검사
npm run build      # out/에 정적 파일 만들기
npm run licenses   # 배포물의 라이선스 검사 (build 다음에 실행)
npm test           # 단위 테스트와 out/ 검사 (build 다음에 실행)
# 공개 사이트 시험: BEAT_NOTE_URL=https://beat-note.vercel.app npm run e2e
npm run e2e        # 브라우저 테스트 (npx playwright install chromium webkit 필요)
```

## 저작권

이 저장소에는 저작권이 있는 악보, 가사, 변환 결과를 넣지 않습니다. 자세한 규칙은 [PLAN.md의 5절](PLAN.md#5-저작권-규칙)에 있습니다.

## 라이선스

이 저장소의 코드와 직접 지은 시험 악보는 [MIT 라이선스](LICENSE)입니다. 함께 들어 있는 다음 자료는 각자의 라이선스를 따릅니다.

- `public/models/`: PaddleOCR 한국어 인식 모델 (Apache-2.0)
- `src/components/noteGlyphs.ts`: Bravura 글꼴의 음표·쉼표 윤곽 (OFL-1.1)
- `tests/scores/*.pdf`에 포함된 글꼴 (OFL-1.1)
- `public/licenses/`: 제3자 라이선스 원문

배포물에 들어가는 것의 전체 목록은 [라이선스 페이지](https://beat-note.vercel.app/licenses/)에 있습니다.
