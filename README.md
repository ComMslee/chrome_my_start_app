# Spotify Controller

Chrome 확장 프로그램 — 브라우저 툴바에서 Spotify 재생을 제어하고 좋아요(라이브러리)를 관리합니다.

## 주요 기능

- **재생 컨트롤**: 재생/일시정지, 이전곡, 다음곡
- **곡 정보 표시**: 제목, 아티스트, 현재 재생 시간 / 전체 시간
- **좋아요 토글**: 현재 곡을 Spotify 라이브러리에 저장/제거
- **트레이 아이콘 상태 표시**:
  - 초록 하트: 라이브러리에 저장된 곡
  - 회색 원(+): 미저장 곡
  - 회색 원(■): 재생 중인 곡 없음
- **자동 상태 동기화**: 백그라운드 폴링(~15초)으로 다른 기기의 재생 상태 반영

## 기술 스택

| 항목 | 상세 |
|------|------|
| 플랫폼 | Chrome Extension Manifest V3 |
| 인증 | Spotify OAuth 2.0 PKCE (클라이언트 시크릿 불필요) |
| API | Spotify Web API (2026-02 마이그레이션 대응) |
| 백그라운드 | Service Worker + `chrome.alarms` 기반 폴링 |
| 저장소 | `chrome.storage.local` (토큰, 재생 상태, 좋아요 캐시) |

## 프로젝트 구조

```
├── manifest.json        # 확장 프로그램 설정 (권한, 아이콘, 서비스 워커)
├── background.js        # OAuth 인증, Spotify API 호출, 상태 폴링, 아이콘 관리
├── popup.html           # 팝업 UI 레이아웃 (CSS Grid 4열 3행)
├── popup.css            # 팝업 스타일 (다크 테마)
├── popup.js             # 팝업 인터랙션 및 상태 업데이트
├── debug.html           # 디버그 도구 (토큰 상태, API 테스트)
├── debug.js             # 디버그 로직
├── generate_icons.js    # 아이콘 생성 스크립트 (sharp 사용)
└── icons/               # 트레이 아이콘
    ├── heart_green_*.png   # 좋아요 상태 (초록 원 + 흰색 체크)
    ├── heart_gray_*.png    # 미저장 상태 (회색 원 + 흰색 플러스)
    ├── icon_stop_*.png     # 재생 없음 (회색 원 + 흰색 사각형)
    └── icon*.png           # 기본 확장 아이콘
```

## 동작 방식

### 인증 흐름
1. 팝업에서 "Spotify 연결" 클릭
2. `chrome.identity.launchWebAuthFlow`로 OAuth PKCE 인증
3. Authorization Code → Access Token + Refresh Token 교환
4. 토큰을 `chrome.storage.local`에 저장
5. 토큰 만료 1분 전 자동 갱신

### 상태 폴링
- `chrome.alarms`로 약 15초마다 `pollPlaybackState` 실행
- 현재 재생 중인 곡 정보를 `chrome.storage.local`에 저장
- 좋아요 상태는 **곡이 변경될 때만** API 호출 (Rate Limit 방지)
- 좋아요 캐시(`_favCache`)는 `chrome.storage.local`에 영속 저장 → 서비스 워커 재시작 시에도 유지

### 팝업 UI
- 4열 3행 CSS Grid 레이아웃
  - 1열: 로그아웃 버튼 (3행 스팬)
  - 2열: 곡 제목 / 아티스트 / 시간
  - 3열: 재생 컨트롤러 (3행 스팬)
  - 4열: 좋아요 버튼 (3행 스팬)
- `chrome.storage.onChanged` 리스너로 실시간 상태 반영

## 개발자 설치 (로컬)

1. 이 저장소를 클론 또는 다운로드
2. `chrome://extensions` 접속
3. 우측 상단 **개발자 모드** 활성화
4. **"압축해제된 확장 프로그램을 로드합니다"** 클릭
5. 프로젝트 폴더 선택
6. 툴바에 Spotify Controller 아이콘 확인

## Spotify API 설정

### 1. Spotify Developer App 생성

1. [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) 접속
2. **Create App** 클릭
3. App 정보 입력:
   - App name: `Spotify Controller` (자유)
   - App description: 임의
   - Redirect URI: `https://<extension-id>.chromiumapp.org/callback`
4. **Settings** > **Basic Information**에서 Client ID 복사

### 2. Extension ID 확인

- `chrome://extensions`에서 확장 프로그램 로드 후 표시되는 ID 사용
- Redirect URI 형식: `https://<ID>.chromiumapp.org/callback`

### 3. Client ID 설정

- `background.js`의 `CLIENT_ID` 상수를 발급받은 값으로 교체

### 4. 필요 스코프

| 스코프 | 용도 |
|--------|------|
| `user-read-playback-state` | 현재 재생 상태 조회 |
| `user-modify-playback-state` | 재생/정지/이전/다음/탐색 제어 |
| `user-read-currently-playing` | 현재 곡 정보 조회 |
| `user-library-read` | 좋아요 상태 확인 |
| `user-library-modify` | 좋아요 추가/제거 |

## 아이콘 생성

트레이 아이콘을 재생성하려면:

```bash
npm install sharp
node generate_icons.js
```

16/32/48/128px 크기의 PNG 파일이 `icons/` 폴더에 생성됩니다.

---

## 부록: Chrome 웹 스토어 등록

확장 프로그램을 Chrome 웹 스토어에 공개 배포하는 절차입니다.

### A. 사전 준비

1. **Google 개발자 계정 등록**
   - [Chrome 웹 스토어 개발자 대시보드](https://chrome.google.com/webstore/devconsole) 접속
   - 최초 등록 시 **$5 일회성 등록비** 결제
   - Google 계정으로 로그인

2. **확장 프로그램 패키징**
   - 프로젝트 폴더에서 불필요한 파일 제거 (`node_modules/`, `.git/`, `generate_icons.js` 등)
   - 폴더를 **ZIP 파일**로 압축 (`.zip` 확장자)
   - `manifest.json`이 ZIP 루트에 위치해야 함

3. **스토어 리소스 준비**
   - 스토어 아이콘: **128x128px** PNG
   - 스크린샷: 최소 1장, **1280x800px** 또는 **640x400px** (PNG/JPEG)
   - 프로모션 타일 (선택): **440x280px**
   - 설명문 (한국어/영어)

### B. 등록 절차

1. [Chrome 웹 스토어 개발자 대시보드](https://chrome.google.com/webstore/devconsole) 접속
2. **새 항목** 클릭
3. ZIP 파일 업로드
4. **스토어 등록정보** 탭:
   - 이름, 설명, 카테고리 입력
   - 스크린샷 및 아이콘 업로드
5. **개인정보처리방침** 탭:
   - Spotify API 사용으로 인해 개인정보처리방침 URL 필요
   - 호스트 권한(`api.spotify.com`, `accounts.spotify.com`) 사유 설명
6. **배포** 탭:
   - 공개 범위 선택 (공개 / 비공개 / 신뢰할 수 있는 테스터)
   - 배포 지역 선택

### C. 심사 및 게시

- **제출** 클릭 후 Google 심사 진행 (보통 1~3 영업일)
- 심사 통과 시 자동 게시
- 거부 시 사유 확인 후 수정하여 재제출

### D. 업데이트

1. `manifest.json`의 `version` 번호 증가 (예: `1.0.0` → `1.1.0`)
2. 새 ZIP 파일 생성
3. 개발자 대시보드에서 기존 항목 선택 → **패키지** 탭 → 새 ZIP 업로드
4. 재심사 후 자동 업데이트 배포

### E. 참고 사항

- Spotify API를 사용하므로 **Spotify Developer Terms of Service** 준수 필요
- 개인정보처리방침 페이지가 없으면 심사에서 거부될 수 있음
- `host_permissions`에 외부 도메인이 포함되면 심사가 더 엄격할 수 있음
- 비공개 배포(unlisted)로 등록하면 링크를 가진 사용자만 설치 가능
