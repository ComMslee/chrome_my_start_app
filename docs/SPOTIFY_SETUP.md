# Spotify API 설정

## 1. Spotify Developer App 생성

1. [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) 접속
2. **Create App** 클릭
3. App 정보 입력:
   - App name: `Spotify Controller` (자유)
   - App description: 임의
   - Redirect URI: `https://<extension-id>.chromiumapp.org/callback`
4. **Settings** > **Basic Information**에서 Client ID 복사

## 2. Extension ID 확인

- `chrome://extensions`에서 확장 프로그램 로드 후 표시되는 ID 사용
- Redirect URI 형식: `https://<ID>.chromiumapp.org/callback`

## 3. Client ID 설정

- `config.js`의 `CLIENT_ID` 상수를 발급받은 값으로 교체

## 4. 필요 스코프

| 스코프 | 용도 |
|--------|------|
| `user-read-playback-state` | 현재 재생 상태 조회 |
| `user-modify-playback-state` | 재생/정지/이전/다음/탐색 제어 |
| `user-read-currently-playing` | 현재 곡 정보 조회 |
| `user-library-read` | 좋아요 상태 확인 |
| `user-library-modify` | 좋아요 추가/제거 |
| `user-read-recently-played` | 최근 재생 기록 조회 |

## 5. 아이콘 생성

트레이 아이콘을 재생성하려면:

```bash
npm install sharp
node generate_icons.js
```

16/32/48/128px 크기의 PNG 파일이 `icons/` 폴더에 생성됩니다.
