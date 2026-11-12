# 축의금 로그

경조사 축의금·부의금을 태블릿에서 기록하는 설치형 웹 앱(PWA)입니다. 접수는 오프라인으로 IndexedDB에 저장됩니다.

## 실행

```bash
npm install
npm run build
npm start
```

브라우저에서 http://localhost:8787 을 엽니다. 홈 화면에 추가하면 앱처럼 쓸 수 있습니다.

관리자 비밀번호는 행사 만들 때 정한 4~6자리입니다.

## 손님 영상 원격 업로드

다른 폰에서 QR로 영상을 올리려면 이 서버(`npm start`)가 공개 주소로 열려 있어야 합니다. 태블릿에서만 촬영하면 서버 없이 IndexedDB에 붙습니다.

## Capacitor

정적 빌드(`dist/`)를 Capacitor 웹 자산으로 감싸 앱 스토어에 올릴 수 있습니다.

## GitHub Pages

공개 주소: https://eunyulchoe-cyber.github.io/chukuigeum-log/

Pages용 빌드는 다음으로 만듭니다.

```bash
npm run build:pages
```

손님용 QR은 해시 경로(`#/g/...`)를 사용합니다. 로컬 `npm run build`와 `npm start`는 기존처럼 루트 경로(`/`)로 동작합니다.


## 구글 드라이브 영상편지

손님이 QR로 남긴 영상은 주최자의 구글 드라이브로 바로 올라갑니다. 이름과 축의금 목록은 서버로 보내지 않습니다.

구글 OAuth 클라이언트 설정은 `docs/google-oauth-setup.md` 를 따릅니다. 개인정보 처리방침은 앱의 `#/privacy` 페이지입니다.

클라우드 중계는 Supabase 프로젝트 `foimbsbpgvcftjxkxiur` (서울 `ap-northeast-2`)를 사용합니다. 비밀 값은 `.secrets/supabase.env` 와 Edge Function secrets에만 둡니다.
