# Spotify Controller

Chrome 확장 프로그램 — 브라우저에서 Spotify 재생을 제어하고 좋아요를 관리합니다.

## 기능

- 재생/일시정지, 이전곡, 다음곡 컨트롤
- 현재 재생 중인 곡 정보 표시 (제목, 아티스트, 재생 시간)
- 좋아요(라이브러리 저장) 토글
- 트레이 아이콘으로 좋아요 상태 표시 (초록: 저장됨 / 회색: 미저장)
- 재생 중이 아닐 때 정지 아이콘 표시

## 기술 스택

- Chrome Extension Manifest V3
- Spotify Web API (OAuth 2.0 PKCE)
- Service Worker 기반 백그라운드 폴링 (~15초)

## 구조

```
├── manifest.json      # 확장 프로그램 설정
├── background.js      # OAuth, API 호출, 상태 폴링
├── popup.html/css/js  # 팝업 UI
├── debug.html/js      # 디버그 도구
└── icons/             # 트레이 아이콘 (heart_green, heart_gray, icon_stop)
```

## 설치

1. `chrome://extensions` 접속
2. 개발자 모드 활성화
3. "압축해제된 확장 프로그램을 로드합니다" 클릭
4. 이 폴더 선택

## Spotify API 설정

- Client ID: Spotify Developer Dashboard에서 발급
- Redirect URI: `https://<extension-id>.chromiumapp.org/callback`
- 필요 스코프: `user-read-playback-state`, `user-modify-playback-state`, `user-read-currently-playing`, `user-library-read`, `user-library-modify`
