# Chrome 웹 스토어 등록

확장 프로그램을 Chrome 웹 스토어에 공개 배포하는 절차입니다.

## A. 사전 준비

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

## B. 등록 절차

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

## C. 심사 및 게시

- **제출** 클릭 후 Google 심사 진행 (보통 1~3 영업일)
- 심사 통과 시 자동 게시
- 거부 시 사유 확인 후 수정하여 재제출

## D. 업데이트

1. `manifest.json`의 `version` 번호 증가 (예: `1.0.0` → `1.1.0`)
2. 새 ZIP 파일 생성
3. 개발자 대시보드에서 기존 항목 선택 → **패키지** 탭 → 새 ZIP 업로드
4. 재심사 후 자동 업데이트 배포

## E. 참고 사항

- Spotify API를 사용하므로 **Spotify Developer Terms of Service** 준수 필요
- 개인정보처리방침 페이지가 없으면 심사에서 거부될 수 있음
- `host_permissions`에 외부 도메인이 포함되면 심사가 더 엄격할 수 있음
- 비공개 배포(unlisted)로 등록하면 링크를 가진 사용자만 설치 가능
