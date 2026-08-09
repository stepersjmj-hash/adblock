# MJ AdBlock

모든 사이트에서 동작하는 범용 광고 차단 크롬 확장프로그램.

## 기능

1. **네트워크 차단** (`rules.json`) — ExoClick, TrafficStars, JuicyAds, Adsterra,
   PopAds, HilltopAds, Google Ads 등 광고 네트워크 40여 개 도메인의 요청을
   브라우저 차원에서 차단.
2. **팝업/팝언더 차단** (`popup-guard.js`) — 페이지 스크립트보다 먼저 실행되어
   `window.open`을 가로챔.
   - 기본: 알려진 광고 도메인으로의 팝업만 차단 (로그인 팝업 등 정상 기능은 통과)
   - 광고 팝업 시도가 한 번이라도 감지된 사이트는 **엄격 모드**로 전환 →
     외부 도메인 팝업 전부 차단 (팝언더는 매번 랜덤 도메인을 쓰기 때문)
3. **광고 요소 제거** (`cleaner.js` + `hide.css`) — 배너, 광고 iframe,
   화면을 덮는 투명 클릭 함정 오버레이를 실시간 감시해서 삭제.
4. **우클릭 차단 해제** — 우클릭/드래그/복사를 막는 사이트에서 차단을 무력화.
   `user-select: none`으로 텍스트 선택을 막은 경우도 해제.
   자체 우클릭 메뉴를 쓰는 정상 서비스(구글 문서, Figma, Notion 등)는
   예외 목록으로 제외됨.

5. **영상 다운로드 버튼** (`downloader.js`) — KVS(kt_player) 계열 동영상
   사이트의 재생 페이지에 "⬇ 영상 다운로드" 버튼을 플레이어 바로 아래에
   삽입. 클릭하면 현재 영상을 파일(영상 제목.mp4)로 바로 저장.
   플레이어가 해석한 실제 재생 URL(`window.flashvars.video_url`)을 그대로
   사용하므로 재생되는 화질 그대로 받아짐.

## 설치 방법

1. 크롬 주소창에 `chrome://extensions` 입력
2. 오른쪽 위 **개발자 모드** 켜기
3. **압축해제된 확장 프로그램을 로드합니다** 클릭
4. 이 폴더(`adblock`) 선택

수정 후에는 `chrome://extensions`에서 새로고침(↻) 버튼을 누르고
사이트 탭도 새로고침(F5)해야 적용됨.

## 사이트별 강화 규칙

광고 도메인을 수시로 바꿔가며 차단을 피하는 사이트(랜덤 영단어 도메인을 쓰는
HilltopAds 계열 등)는 도메인 목록만으로는 못 막는다. 이런 사이트는 반대로
**"허용된 CDN 외 모든 외부 스크립트 차단"** 방식을 쓴다:

- `rules.json`의 `initiatorDomains` 규칙 — 해당 사이트에서 시작된 외부
  스크립트/iframe/XHR 요청 중 허용 목록(`excludedRequestDomains`)에 없는
  것을 전부 차단. 광고 도메인이 뭘로 바뀌든 상관없이 막힘.
- `popup-guard.js`의 `STRICT_POPUP_HOSTS` — 해당 사이트에서는 처음부터
  엄격 모드로 시작 (같은 사이트 팝업 외 전부 차단).

> 주의: 이 화이트리스트 방식은 영상 파일 호스트(예: kissjav → `tubegifs.com`)도
> 막을 수 있으므로, 영상이 재생/다운로드되는 CDN을 반드시 허용 목록에 넣어야 함.
> (영상이 안 나오거나 다운로드가 안 되면 F12 네트워크 탭에서 영상 요청 도메인을
> 확인해 `excludedRequestDomains`에 추가)

새 사이트를 추가하려면:

1. `rules.json`의 `initiatorDomains` 규칙을 복사해 새 규칙(id 증가)으로 추가,
   해당 사이트 도메인과 그 사이트가 정상 동작에 쓰는 CDN을 허용 목록에 기입
2. `popup-guard.js`의 `STRICT_POPUP_HOSTS`에 도메인 추가

## 광고가 새로 뜨는 경우

광고 네트워크가 바뀌면 뚫릴 수 있음. 새 광고의 도메인을 확인하려면:

1. F12 → **네트워크** 탭에서 광고 요청의 도메인 확인
2. `rules.json`의 `requestDomains` 배열에 도메인 추가
3. `popup-guard.js`와 `cleaner.js`의 `AD_HINTS` 정규식에도 키워드 추가 (선택)
4. `chrome://extensions`에서 새로고침

## 정상 사이트가 오작동하는 경우

- 자체 우클릭 메뉴가 안 뜨는 사이트 → `popup-guard.js`의
  `RIGHTCLICK_EXCLUDED` 배열에 도메인 추가
- 광고가 아닌 요소가 사라지는 사이트 → `cleaner.js`의 `AD_SELECTORS`에서
  해당 선택자 제거
