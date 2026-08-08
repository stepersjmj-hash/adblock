# KissJAV AdBlock

kissjav 사이트의 광고를 차단하는 크롬 확장프로그램.

## 동작 방식 (3중 차단)

1. **네트워크 차단** (`rules.json`) — ExoClick, TrafficStars, JuicyAds, Adsterra, PopAds, HilltopAds 등 성인 사이트에서 흔히 쓰는 광고 네트워크 40여 개 도메인의 요청을 브라우저 차원에서 차단. 모든 사이트에 적용됨.
2. **팝업/팝언더 차단** (`popup-guard.js`) — 페이지 스크립트보다 먼저 실행되어 `window.open`을 가로챔. 같은 사이트 URL만 허용하고 외부 광고 팝업은 전부 차단. kissjav 도메인에서만 동작.
3. **광고 요소 제거** (`cleaner.js` + `hide.css`) — 배너, 광고 iframe, 화면을 덮는 투명 클릭 유도 오버레이를 실시간으로 감시해서 삭제. kissjav 도메인에서만 동작.

## 설치 방법

1. 크롬 주소창에 `chrome://extensions` 입력
2. 오른쪽 위 **개발자 모드** 켜기
3. **압축해제된 확장 프로그램을 로드합니다** 클릭
4. 이 폴더(`adblock`) 선택

## 광고가 새로 뜨는 경우

광고 네트워크가 바뀌면 뚫릴 수 있음. 새 광고의 도메인을 확인하려면:

1. F12 → **네트워크** 탭에서 광고 요청의 도메인 확인
2. `rules.json`의 `requestDomains` 배열에 도메인 추가
3. `chrome://extensions`에서 새로고침(↻) 버튼 클릭

## 다른 미러 도메인 지원

kissjav이 `.li`, `.com` 외 다른 도메인으로 바뀌면 `manifest.json`의
`content_scripts` → `matches` 배열에 해당 도메인을 추가하면 됨.
