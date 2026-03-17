# Spotify Controller

Chrome 확장 프로그램 — 브라우저 툴바에서 Spotify 재생을 제어하고 좋아요(라이브러리)를 관리합니다.

## 주요 기능

- **재생 컨트롤**: 재생/일시정지, 이전곡, 다음곡, 프로그레스바 탐색
- **좋아요 토글**: 현재 곡을 Spotify 라이브러리에 저장/제거
- **이전 리스트**: 최근 재생 5곡 + 곡별 즐겨찾기 토글
- **다음 리스트**: 재생 대기열 표시
- **트레이 아이콘**: 좋아요 상태 실시간 반영
- **자동 동기화**: ~20초 폴링 + 곡 끝 즉시 전환

## 프로젝트 구조

```
├── manifest.json        # 확장 프로그램 설정
├── config.js            # 공용 상수 (Client ID, API URL, 폴링 간격)
├── spotify-auth.js      # OAuth 2.0 PKCE 인증 + 토큰 관리
├── spotify-api.js       # Spotify API 호출 + 즐겨찾기 캐시
├── background.js        # 메인 서비스 워커 (폴링, 아이콘, 메시지 핸들러)
├── popup.html/css/js    # 팝업 UI (5열 CSS Grid, 다크 테마)
├── debug.html/js        # 디버그 도구
└── icons/               # 트레이 아이콘
```

## 설치

1. 이 저장소를 클론
2. `chrome://extensions` → **개발자 모드** 활성화
3. **압축해제된 확장 프로그램을 로드합니다** → 프로젝트 폴더 선택

## 문서

- [Spotify API 설정](docs/SPOTIFY_SETUP.md) — Developer App 생성, Client ID, 스코프
- [Chrome 웹 스토어 등록](docs/CHROME_STORE.md) — 패키징, 심사, 배포
