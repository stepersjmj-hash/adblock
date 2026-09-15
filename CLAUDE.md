# CLAUDE.md — 개발/유지보수 노트

범용 광고 차단 + 영상 다운로드 버튼 크롬 확장프로그램 (Manifest V3).
사용자 문서는 [README.md](README.md), 이 파일은 개발 컨텍스트/함정 정리용.

## 파일 구조

| 파일 | world / 시점 | 역할 |
|------|--------------|------|
| `manifest.json` | — | MV3 매니페스트. action(팝업)·background·DNR 규칙 연결 |
| `background.js` | service worker | on/off 상태 관리 — DNR 룰셋 토글 + 콘텐트 스크립트 동적 등록/해제 + 툴바 아이콘/배지 |
| `popup.html` / `popup.js` | 확장 페이지 | 툴바 버튼 팝업. 토글 스위치로 `storage.local.enabled` 변경 |
| `icons/` | — | 툴바 아이콘. `icon<size>.png`(켜짐, 분홍) / `icon<size>-off.png`(꺼짐, 회색) |
| `rules.json` | declarativeNetRequest | 네트워크 차단 규칙 (도메인 목록 + 정규식 + 화이트리스트) |
| `popup-guard.js` | MAIN / document_start | 팝업·팝언더 차단 + 우클릭/복사 차단 해제 |
| `downloader.js` | MAIN / document_idle / all_frames | 영상 재생 페이지에 다운로드 버튼 삽입 |
| `ebs-downloader.js` | isolated / document_idle / all_frames / ebs.co.kr | EBS VOD 저장 버튼 (chrome.downloads 경유) |
| `cleaner.js` | isolated / document_end | 광고 DOM 요소·오버레이 실시간 제거 (MutationObserver) |
| `hide.css` | — | 광고 컨테이너 즉시 숨김 (cleaner.js 보조) |
| `_metadata/…/_ruleset1` | — | 크롬이 rules.json으로 자동 생성하는 인덱스 (직접 편집 X) |

## 적용 대상 사이트

- 전역: `<all_urls>` — 알려진 광고 네트워크 40여 개 도메인 차단 (rules.json id:1)
- kissjav 전용 강화: 도메인을 수시로 바꾸는 광고업체(HilltopAds 계열) 때문에
  "허용 CDN 외 모든 외부 스크립트 차단" 화이트리스트 방식 사용 (rules.json id:4)
- watchfreejavonline.co 전용 강화 (rules.json id:6): 같은 화이트리스트 방식.
  영상은 `xxembed.com` 외부 임베드 iframe이라 반드시 허용 목록에 있어야 재생됨
  (직접 열면 리퍼러 체크로 "Embeds disabled" — 반드시 사이트 안에서 재생 테스트).
  허용: watchfreejavonline.co, xxembed.com, cdnjs.cloudflare.com(jQuery),
  googleapis.com, gstatic.com. 실측 광고 도메인: aboundadmirermyself.com,
  illinformed-summer.com, portalfluently.com, vivodemisrentas.net,
  diagramjawlineunhappy.com, normal-place.com, thekav.co(myexo=ExoClick 래퍼),
  whitetrafsa.com(Stripchat 위젯). 플레이어 코드에 주석 처리된
  satisfactorilybewitchgreatness.com 팝업도 선제 차단.
  임베드 iframe 안 팝언더 대비로 popup-guard에 `all_frames: true` 적용 (v2.2.0).
  s23.watchfreejavonline.co 같은 서브도메인 미러도 id:6이 자동 커버함
  (DNR `initiatorDomains`/`excludedRequestDomains`는 서브도메인 포함 매칭).
  s23 실측 추가 광고/트래커: agonizingrest.com, dtscout.com, dtscdn.com,
  mrktmtrcs.net, crwdcntrl.net(Lotame), histats.com, rmhfrtnd.com(배너 리다이렉트).
  네트워크 차단으론 못 막는 자체 삽입 텔레그램 팝업(`#tg-popup` "최신 접속 주소
  안내" 오버레이)은 cleaner.js의 `SITE_SELECTORS`로 DOM에서 제거 (v2.4.0).
  "(1) New Message!" 탭 제목 변조는 thekav.co inpage 스크립트 짓 — id:6이
  스크립트를 차단하므로 확장 설치 환경에선 발생 안 함.
- nswpedia.com 전용 강화 (rules.json id:7, v2.3.0): 같은 화이트리스트 방식.
  jQuery·폰트·이미지 전부 자체 호스팅이라 허용 목록이 단순함
  (nswpedia.com, googleapis.com, gstatic.com — 뒤 둘은 안전용).
  실측 광고 도메인: xe.diapsidbuchloe.com(로더 스크립트, Monetag/PropellerAds
  계열), node.lib-net.dev, swordermislike.qpon, gp.mulmhitch.cfd.
  `.qpon`/`.cfd` 같은 TLD를 쓰는 로테이션 광고망이라 개별 차단만으론 부족 →
  화이트리스트 필수. 구글 애널리틱스/클라우드플레어 통계도 같이 차단됨(무해).
- bestjavporn.com 전용 강화 (rules.json id:8, v2.9.0): 같은 화이트리스트 방식.
  실측 광고 도메인: alaphoid.com(주 로더 — script/pixel/XHR 전부), tapioni.com
  (adgpt.js), nomandswitch.cc, nresystems.com(픽셀), flushpersist.com(픽셀),
  javhd-trk.com(배너 클릭 타겟). 여기에 기존 차단 대상인 portalfluently,
  vivodemisrentas, whitetrafsa(`go.whitetrafsa.com/smartpop` = 팝언더),
  magsrv(ExoClick)도 같이 뜸.
  **허용 목록 주의** — 영상이 여러 CDN에서 오고 서브도메인이 랜덤임:
  `z6v2p9a8.bkcdn.net`(현재 재생), `n19s.1024cdn.sx`, `video.pornfhd.com`.
  `pornfhd.com`은 썸네일(pics.)·CSS(cdn.)도 겸하므로 반드시 허용.
  `raw.githubusercontent.com`은 qtranslate 언어전환 국기 이미지라 정상 기능.
  단 `cdn.pornfhd.com/files/banner_300x250.html`은 사이트 자체 CDN에서 서빙되는
  광고 배너라 화이트리스트로 못 막음 → id:9 정규식 규칙으로 별도 차단.
  theporndude.com 배너는 stylesheet라 화이트리스트(script/frame만) 대상이 아님
  → AD_HINTS에 넣어 cleaner.js가 DOM에서 제거.
  **재생 버튼 클릭 납치** (v2.9.1에서 대응): 플레이 버튼을 누르면 재생 대신
  광고로 튄다. 확장 없는 브라우저에서 실측한 연쇄:
  1클릭 → `tesorf.com` 팝언더, 2클릭 → `grabyourluck.com` 리다이렉트 →
  `ko.stripchat.mov`로 페이지 자체가 이동. id:1에 전부 추가함.
  주의: 기존 id:5는 `stripchat.com`만 막고 있어서 `.mov` 미러는 안 걸렸음.
  `cdn.show-sb.com` / `cdn.bakestubborn.com`은 이름만 보면 영상 호스트 같지만
  경로가 `/sb/notifications/utility/...`이고 alaphoid가 `pixel/sbls`로 추적하는
  **알림 스팸 광고 위젯**이다 — 플레이어 아님. 화이트리스트로 막아도 무방.
  영상 소스는 `data-mpu`(광고 슬롯 데이터, Mid Page Unit)가 아니라 런타임에
  JS가 만들어 넣는다. 원본 HTML에는 `<video>`도 소스 URL도 없음(되는 편/안 되는
  편 모두 동일) → 재생 실패는 편별 소스 조회 실패이지 확장 탓이 아님.

## on/off 스위치 (v2.7.0)

툴바 버튼 → 토글 스위치. 상태는 `chrome.storage.local.enabled` (없으면 켜짐).
`background.js`가 `storage.onChanged`를 보고 세 가지를 한꺼번에 전환:

1. DNR 룰셋 — `updateEnabledRulesets({enable|disableRulesetIds: ["ad-domains"]})`
2. 콘텐트 스크립트 — `scripting.register/unregisterContentScripts`
3. 툴바 아이콘/배지 — 꺼짐이면 회색 아이콘 + "OFF" 배지

**콘텐트 스크립트를 매니페스트에서 빼고 동적 등록으로 바꾼 이유**:
popup-guard/downloader는 `world: "MAIN"`이라 `chrome.storage`를 못 읽는다
(페이지의 window에서 돌기 때문). 즉 "일단 실행된 뒤 플래그 보고 중단"이
불가능해서, 꺼짐 상태에서는 아예 등록을 해제하는 방식을 씀.
→ 그래서 `manifest.json`에 `content_scripts` 항목이 없다. 스크립트를
추가·수정할 때는 `background.js`의 `CONTENT_SCRIPTS` 배열을 고쳐야 한다.
동적 등록에는 `host_permissions: ["<all_urls>"]`가 필요함(매니페스트 정적
등록과 달리 호스트 권한이 요구됨).

함정:
- 등록은 `persistAcrossSessions: true`(기본값)라 브라우저를 재시작해도 남아있음.
  같은 id를 두 번 등록하면 에러 → `getRegisteredContentScripts`로 확인 후
  없는 것만 등록. onInstalled/onStartup/최초 실행이 겹칠 수 있어 `queue`
  프라미스 체인으로 순차 처리함.
- **정의를 고쳐도 반영이 안 되는 함정** — 위 "없는 것만 등록" 때문에,
  `CONTENT_SCRIPTS`의 `allFrames`/`matches` 등을 수정해도 같은 id가 이미
  등록돼 있으면 그냥 넘어가서 옛 설정이 계속 남는다. 확장을 새로고침해도
  마찬가지. → `onInstalled`에서 `resetAndSyncNow()`로 전부 해제 후 재등록함.
- `queue` 안에서 도는 함수가 다시 `applyState()`를 부르면 자기 뒤에 붙은
  작업을 기다리게 되어 **교착**이 생긴다. 그래서 큐를 거치지 않는
  `applyStateNow()`를 따로 두고 리셋 경로는 이쪽을 쓴다.
- 서비스 워커가 깨어날 때마다 `sync()`를 호출해 상태를 맞춤(자가 복구).
- DNR 룰셋 on/off는 새로고침 없이 즉시 반영되지만 콘텐트 스크립트는 다음
  페이지 로드부터 적용됨 → 팝업이 토글 후 현재 탭을 자동 새로고침함.

## EBS VOD 저장 (v2.8.0)

`anikids.ebs.co.kr` 등 EBS VOD 재생 페이지(`/vodCommon/show?...`)에
"⬇ 영상 저장" 플로팅 버튼을 띄운다.

**다른 사이트와 방식이 다른 이유** — 영상 CDN(`wstrotu.ebs.co.kr`)이 CORS
헤더를 주지 않아서 페이지 안에서 `fetch`가 실패한다(`Failed to fetch`).
파일 호스트가 페이지와 다른 도메인이라 `<a download>`의 download 속성도
무시됨. → 주소만 백그라운드로 넘겨 `chrome.downloads.download()`가 브라우저
차원에서 받게 함 (CORS와 무관하고 CloudFront 서명 주소도 그대로 유효).
그래서 이 스크립트만 **isolated world**(chrome.runtime 필요)이고,
매니페스트에 `downloads` 권한이 추가됨.

- 화질: 페이지 HTML에 `500k/1m/2m/5m` 서명 주소가 전부 들어있음. 플레이어는
  보통 2m로 재생하지만 버튼은 **5m(최고화질)** 을 고름. 서명이 경로마다
  따로라서 URL의 화질 부분만 바꿔치기하면 서명이 깨짐 — 반드시 페이지에
  들어있는 주소를 그대로 써야 함.
- 파일명: `.mpv-title-layout` 요소 (예: "한글용사 아이야 1화 아이야.mp4").
- **플레이어가 iframe 안에 뜬다** — 프로그램 상세 페이지
  (`/anikids/program/show/<id>`)에서 "바로보기"를 누르면 페이지 이동이 아니라
  같은 탭에 `/vodCommon/show` iframe이 덮인다. 그래서 `allFrames: true`가
  필수. (주소창에 `/vodCommon/show?...`를 직접 열면 top frame이라 없어도 됨 —
  이것만 보고 되는 줄 알았다가 놓쳤던 부분)
- 전체화면일 때는 fullscreen 요소와 그 자손만 렌더링되므로 body에 붙인
  fixed 버튼이 안 보임 → `fullscreenchange`마다 버튼을 옮겨 붙임.
- **구독 콘텐츠는 못 받음** — 유료 구독이 필요한 편(페파 피그, 고고다이노 등)은
  로그인해도 서버가 `end=60`이 붙은 60초 맛보기만 내려준다. 받아도 60초짜리라
  버튼이 `end=` 파라미터를 감지하면 저장을 막고 안내만 띄움.
  EBS 자체 제작물(한글용사 아이야 등)은 로그인만으로 전체가 재생됨(실측 13:07).

## 핵심 함정 (실제로 겪은 것)

1. **광고 도메인이 매 접속마다 바뀜** — kissjav의 광고는 `coverdistilltile.com`,
   `qfanakacp.in`, `alfalfaemployeeresource.com` 처럼 랜덤 영단어 도메인을 씀.
   개별 도메인 추가로는 못 막아서 → `initiatorDomains` 화이트리스트 규칙(id:4)으로
   kissjav에서 나가는 외부 스크립트를 CDN(`cdnhop.com`) 빼고 전부 차단.
   허용 목록: kissjav.li/com, cdnhop.com, googleapis.com, gstatic.com.

2. **다운로드 버튼이 영상에 가려졌었음** — `.player-wrap` 안에 버튼을 넣으니
   그 위에 그려지는 영상 캔버스에 완전히 가려짐. `getBoundingClientRect`는
   "크기 있음=보임"으로 나오지만 실제론 안 보임. → `document.elementFromPoint`로
   **가림(occlusion) 검사**를 하고, 가려지면 다음 후보 위치로 넘어가도록 함.
   최종 배치 위치: 영상 아래 액션 버튼 행(`.btn-holder` 중 "Video Details" 텍스트
   포함한 것 — 같은 클래스가 상단 메뉴에도 있어서 텍스트로 구분).

3. **flashvars는 MAIN world에만 있음** — 영상 실제 URL은 페이지의
   `window.flashvars.video_url`에 있음. isolated content script에선 접근 불가라
   downloader.js는 반드시 `world: "MAIN"`. 정상 로드 시 document_idle 시점에
   이미 존재하며 재생 클릭 불필요.

## 브라우저로 검증하는 법 (claude-in-chrome MCP)

확장을 이 환경에 로드할 수 없으므로, 실제 크롬 탭에서 스크립트를 주입해 검증함:

- `read_network_requests` — 광고 요청 도메인 실측 (툴 호출 후 페이지 새로고침해야
  기록됨). kissjav은 가끔 `ERR_EMPTY_RESPONSE`를 주니 로드 성공 여부부터 확인.
- `javascript_tool` — `window.flashvars` 존재 확인, downloader.js 코드 그대로
  주입해 버튼 생성·가시성(`elementFromPoint`로 가림 여부)·위치 확인.
- `computer` screenshot — 버튼이 시각적으로 보이는지 최종 확인 (좌표만 믿으면 안 됨,
  함정 2 참고).

테스트용 영상 URL 예: `https://kissjav.li/video/794694/...`

## 새 광고/사이트 대응

- 새 광고 도메인: `rules.json` id:1의 `requestDomains`에 추가 +
  `popup-guard.js`/`cleaner.js`의 `AD_HINTS` 정규식에 키워드 추가.
- 도메인을 계속 바꾸는 악질 사이트: `rules.json`의 id:4 규칙을 복사해 새 규칙으로
  만들고 `initiatorDomains`에 사이트, `excludedRequestDomains`에 그 사이트가
  정상 동작에 쓰는 CDN을 기입. + `popup-guard.js`의 `STRICT_POPUP_HOSTS`에 추가.
- 다운로드 버튼이 안 뜨는 새 사이트: 플레이어가 `window.flashvars`를 쓰는
  KVS 계열인지 확인. 버튼 삽입 위치는 `downloader.js`의 `placeButton` 후보 배열에
  해당 사이트의 액션 행 선택자를 추가.
- 사이트가 HTML에 직접 심는 오버레이/공지 팝업 (외부 요청이 없어 DNR로 못 막는
  것): `cleaner.js`의 `SITE_SELECTORS`에 도메인 → 선택자 항목 추가.
- mp4 없이 HLS(m3u8) 스트리밍만 주는 임베드 호스트 (xxembed, guccihide 등):
  `downloader.js`의 `HLS_HOSTS`에 도메인 추가. jwplayer 소스에서 m3u8을 얻어
  최고 화질 variant의 세그먼트를 fetch로 전부 받아(플레이어와 같은 경로라
  CORS 허용됨) 하나의 .ts로 합쳐 저장. AES-128 암호화 스트림은 미지원(에러 표시).
  호스트를 계속 바꾸므로 목록에 없어도 URL이 `/embed/…` `/embed-…` `/e/…`
  형태면 자동 인정(`isEmbedLikePage`) — jwplayer HLS 소스가 실제로 있을 때만
  버튼이 뜨므로 일반 사이트엔 영향 없음.

## 검증/문법 체크

```bash
python -c "import json; json.load(open('manifest.json',encoding='utf-8')); json.load(open('rules.json',encoding='utf-8')); print('JSON OK')"
node --check popup-guard.js && node --check downloader.js && node --check cleaner.js && node --check background.js && node --check popup.js && node --check ebs-downloader.js
```

아이콘을 다시 만들려면 (의존성 없이 순수 파이썬으로 PNG 생성):
`tools/make_icons.py` 실행 → `icons/`에 켜짐/꺼짐 8개 파일 생성.
(폴더명을 `_`로 시작하면 크롬이 확장 로드를 거부함 — `_metadata`만 예외)

## 로드/테스트

`chrome://extensions` → 개발자 모드 → 압축해제된 확장 로드 → 이 폴더 선택.
**파일 수정 후엔 확장 새로고침(↻) + 페이지 Ctrl+Shift+R** (특히 매니페스트나
새 content_script 추가 시 확장 재로드 필수).

## 현재 상태 (검증 완료)

- 광고 차단: `coverdistilltile.com` 등 실측 도메인 + 화이트리스트로 차단 확인.
- 다운로드 버튼: kissjav 영상 페이지에서 영상 아래에 정상 표시 확인 (스크린샷 검증).
- watchfreejavonline.co: 광고 도메인 실측 후 id:6 화이트리스트 추가 (v2.2.0).
  영상(xxembed.com 임베드) 재생 경로는 허용 목록으로 보존 — 실기기 재생 확인 권장.
- nswpedia.com: 광고 도메인 실측 후 id:7 화이트리스트 추가 (v2.3.0).
  다운로드 링크는 top-level 네비게이션이라 DNR 규칙(resourceTypes에 main_frame
  없음)에 영향받지 않음.
- s23.watchfreejavonline.co: 기존 id:6이 서브도메인까지 커버함을 확인.
  추가 실측 광고/트래커 도메인을 id:1에 등록, 자체 삽입 텔레그램 팝업은
  cleaner.js SITE_SELECTORS로 제거 검증 완료 (v2.4.0). 영상은 여기도
  xxembed.com 임베드라 재생 경로 보존.
- xxembed.com HLS 다운로드 (v2.5.0): watchfreejavonline의 "다운로드" 링크는
  실제 다운로드가 아니라 xxembed 임베드 페이지를 새 탭으로 여는 것뿐
  (진짜 다운로드는 rutood.com 유료). → downloader.js가 xxembed 페이지에서
  HLS 세그먼트를 받아 .ts로 합쳐 저장하는 버튼을 띄움 (우하단 플로팅).
  파일명은 리퍼러(원본 글 슬러그)에서 따옴. 실측: 마스터 m3u8 → 최고 화질
  variant(예: 2.4Mbps) → 세그먼트 69개, CORS 허용 확인, 부분 수신 검증 완료.
  주의: 임베드 URL을 주소창에 직접 열면 리퍼러 없음 → "Embeds disabled".
  반드시 사이트의 다운로드 링크(새 탭)로 열어야 재생·다운로드 모두 동작.
- 임베드 호스트가 글마다 다름 (v2.6.0에서 대응). 실측 3종:
  - `xxembed.com/embed-<id>.html` — 단일 영상, 절대 경로 m3u8.
  - `xxxbed.cyou/p/<id>.html` — 플레이어 없음. `<select>`로 파트를 고르면
    `guccihide.store` 임베드를 iframe에 띄우는 멀티파트 목록 페이지.
    → iframe 안에 버튼을 넣어야 해서 downloader에 `all_frames: true` 적용.
  - `guccihide.store/embed/<id>` — jwplayer HLS인데 소스가 **상대 경로**
    (`/stream/…/master.m3u8`)라 `new URL(file, location.href)`로 절대화 필수.
    세그먼트는 tiktokcdn.com 등 외부 CDN에 있지만 CORS 허용됨(실측).
  멀티파트는 파트마다 리퍼러가 같아 파일명이 겹침 → iframe 안일 때는
  임베드 ID를 파일명에 붙여 구분.
- 영상이 아예 안 받아지는 경우: 임베드 페이지에 "File is no longer available
  as it expired or has been deleted"가 뜨면 원본 파일이 삭제된 것. 확장으로
  해결 불가 (예: chn25060111 글의 guccihide 임베드, 2026-08-16 확인).
- bestjavporn.com: 광고 도메인 실측 후 id:8 화이트리스트 + id:9 배너 정규식
  추가 (v2.9.0). 브라우저에서 실제 로드된 리소스에 규칙을 대입해 검증함 —
  차단: alaphoid/tapioni/nomandswitch/portalfluently/vivodemisrentas/magsrv
  스크립트 + whitetrafsa smartpop iframe(팝언더), 통과: 영상 호스트
  `z6v2p9a8.bkcdn.net`·`video.pornfhd.com`, 썸네일, jQuery, 폰트.
  구글 애널리틱스·클라우드플레어 통계도 같이 차단됨(무해).
- version 2.9.0.
