# beat-note

악보 PDF를 글자와 박자만 보이는 연습용 HTML(박자 노트)로 바꾸는 웹사이트입니다.
악보를 서버로 보내지 않고, 변환을 모두 브라우저 안에서 합니다.

## 상태

개발 초기입니다. 사이트의 뼈대만 있고 변환 기능은 아직 없습니다.

- [PLAN.md](PLAN.md): 단계별 계획과 진행 상황
- [DEVLOG.md](DEVLOG.md): 단계마다 한 일, 측정 결과, 실패와 결정

## 실행

Node.js 24 이상이 필요합니다.

```sh
npm ci
npm run dev        # 개발 서버
npm run typecheck  # 타입 검사
npm run build      # out/에 정적 파일 만들기
npm test           # out/ 검사 (build 다음에 실행)
```

## 저작권

이 저장소에는 저작권이 있는 악보, 가사, 변환 결과를 넣지 않습니다. 자세한 규칙은 [PLAN.md의 5절](PLAN.md#5-저작권-규칙)에 있습니다.
