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
| `dl-bridge.js` | isolated / document_start / all_frames | downloader.js(MAIN)를 위한 다리 — 원본 탭 제목 전달 + chrome.downloads 저장 중계 |
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
- bestjavporn.com: **화이트리스트 방식을 쓰면 안 되는 사이트** (v2.9.2에서 철회).
  id:8 화이트리스트를 넣었더니 영상이 재생되지 않았다(확장 끄면 재생됨으로 확인).
  플레이어를 만드는 코드가 사이트 자체 JS에 없고(navigation/main/cast.js 전부
  소스 해석 로직 없음) 외부 스크립트가 런타임에 만들어 넣는 구조라, 외부
  스크립트를 통으로 막으면 플레이어가 초기화되지 않는다.
  → 도메인 개별 차단(id:1)만 사용. 아래 실측 도메인으로 광고는 충분히 제거됨.
  **`bkcdn.net`은 사이트 영상 CDN이 아니라 ExoClick 자산 호스트다** —
  `a.magsrv.com/ad-provider.js` 안에 `z6v2p9a8.bkcdn.net/images/close-icon.svg`로
  하드코딩돼 있음. 그래서 재생 페이지에 뜨는 `<video src=...bkcdn...>`는
  본편이 아니라 **광고 영상**이다. 이걸 본편으로 착각해 "재생 잘 된다"고
  오판했었음 — 다음에 검증할 때 주의.
  조사 함정: 이 사이트는 재생 버튼 클릭이 광고로 납치돼(아래) 확장 없는
  브라우저에서는 재생 상태에 도달하기 어렵다. 샌드박스 iframe
  (`allow-top-navigation` 없이)으로 상위 창 납치는 막을 수 있으나 그래도
  본편 재생은 재현하지 못했음.
- bestjavporn.com 광고 실측 (v2.9.0):
  실측 광고 도메인: alaphoid.com(주 로더 — script/pixel/XHR 전부), tapioni.com
  (adgpt.js), nomandswitch.cc, nresystems.com(픽셀), flushpersist.com(픽셀),
  javhd-trk.com(배너 클릭 타겟). 여기에 기존 차단 대상인 portalfluently,
  vivodemisrentas, whitetrafsa(`go.whitetrafsa.com/smartpop` = 팝언더),
  magsrv(ExoClick)도 같이 뜸.
  사이트 정상 리소스(건드리면 안 됨): `pornfhd.com`(썸네일 pics. / CSS cdn. /
  영상 video.), `n19s.1024cdn.sx`(관련영상 mp4), jQuery·폰트 CDN,
  `raw.githubusercontent.com`(qtranslate 언어전환 국기 이미지).
  `cdn.pornfhd.com/files/banner_300x250.html`은 사이트 자체 CDN에서 서빙되는
  광고 배너라 도메인 차단으로 못 막음 → id:9 정규식 규칙으로 별도 차단.
  theporndude.com 배너는 stylesheet로 들어와 도메인 차단 대상이 아님
  → AD_HINTS에 넣어 cleaner.js가 DOM에서 제거 (메뉴 `<li>` 3개만 지우고
  플레이어는 안 건드리는 것 확인함).
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

- sextb.net (v2.10.0): 여기도 **화이트리스트 안 씀** — 도메인 개별 차단만.
  구조: 진짜 플레이어는 `#sextb-player` 안의 **`turboplays.click` iframe**
  (970x560). 포스터·영상은 `cdn001.imggle.net`, 샘플 영상은
  `cdn-dl.webstream.ne.jp`, 플레이어 라이브러리는 `vjs.zencdn.net`(Video.js).
  `challenges.cloudflare.com`(Turnstile)도 정상 기능 — **이 6개는 절대 막지 말 것**.
  실측 광고: `a.chnsrv.com`, `ad.twinrdengine.com`, `adplsr.com`,
  `analytics.ozlinedsp.com`, `cm.pxltag.com`, `go.marzaent.com`,
  `newshinyd.com`, `s.uuidksinc.net`, `vast.yomeno.xyz`(VAST 영상광고),
  `yetansd.com`, `pixel.onaudience.com`, `x8y8awcr.xyz`(300x250·900x250 배너
  iframe 5개 — 랜덤 도메인이라 바뀔 수 있음), `z6v2p9a8.bkcdn.net`(ExoClick 자산).
  기존 차단분도 다수: realsrv, tsyndicate, tapioni, dtscout/dtscdn, whitetrafsa,
  magsrv, histats, strpst, crwdcntrl, mrktmtrcs.
  **프리롤 광고**: 재생 버튼을 누르면 `tsvideo.saawsedge.com` 영상이
  플레이어 크기(970x560)로 덮어씌워진다(`.ts-im-video-wrapper` = tsyndicate).
  saawsedge.com 차단으로 제거됨.
  **네트워크 차단만으로 안 지워지는 것들** (v2.10.1에서 DOM 제거로 처리):
  - `section.tray`("Free Cams Sex") — 캠 광고 줄. 썸네일을 **sextb.net 자체
    도메인**에서 서빙해서 도메인 차단 불가. 정상 콘텐츠("Related JAV Movies")도
    같은 `section.tray` 클래스라 `:has(.tray-item-cams)`로 캠 항목이 든 것만 지목.
  - `ins.adsbyexoclick` / `ins[class^=eas]`(ExoClick 슬롯), `.ts-im-container`
    (tsyndicate) — 스크립트를 막아도 빈 컨테이너가 남아 자리를 차지함.
    범용이라 전역 AD_SELECTORS + hide.css 에 넣음.
  **팝언더가 iframe 안에서 열림** (v2.10.2에서 대응): 재생 버튼을 누르면 새 창
  광고가 뜨는데, 상위 페이지에서 `window.open`을 후킹해보면 **호출 0건**이다
  — 팝언더는 `turboplays.click` 플레이어 iframe 안에서 열린다. popup-guard는
  `all_frames: true`라 그 안에서도 돌지만, `location.hostname`이 플레이어
  도메인이라 `STRICT_POPUP_HOSTS`에 안 걸려 엄격 모드가 꺼져 있었다.
  → **부모 페이지가 엄격 대상이면 iframe도 물려받도록** 수정
  (iframe의 `document.referrer` = 임베드한 페이지). 리퍼러가 비는 경우를 대비해
  `turboplays.click` 자체도 목록에 추가. 앞으로 임베드 플레이어에서 팝언더가
  뜨면 이 상속 로직으로 대부분 자동 커버됨.
  위 상속만으로는 **안 막혔음** — 팝언더가 `window.open`을 직접 안 부르는
  우회 수법을 씀. v2.10.3에서 두 가지 보강:
  1. **iframe의 깨끗한 open 꺼내 쓰기** — 빈 iframe을 만든 뒤
     `iframe.contentWindow.open(...)`을 호출하면, 우리가 고정해둔 건 그 프레임의
     `window.open`뿐이라 그대로 뚫린다. → `HTMLIFrameElement.prototype`의
     `contentWindow` getter를 감싸서, 꺼내질 때마다 그 창의 `open`도 갈아끼움.
     (교차 출처는 접근 시 예외 → 무시. 그쪽은 자기 프레임의 popup-guard 담당)
  2. **합성한 `<a target="_blank">` 클릭** — 엄격 모드에서는 외부 도메인으로
     새 창을 여는 앵커 클릭도 취소 (엄격 대상 사이트 한정).
     ⚠️ **v2.11.0에서 `ev.isTrusted === false` 조건 추가** — 처음엔 조건 없이
     막았더니 **사람이 직접 누른 외부 링크까지 죽었다**. watchfreejavonline의
     "다운로드"(새 탭으로 xxembed 열기)가 이 규칙에 걸려 동작하지 않았음.
     스크립트가 합성한 클릭만 isTrusted=false 이므로 이것만 막으면 된다.
  검증: 우회 재현 코드가 차단되고, 교차 출처 iframe 접근이 예외를 안 내며,
  정상 iframe도 그대로 동작함을 브라우저에서 확인.
  **팝언더 목적지를 결국 잡아냄** (v2.10.4): `oj.bacchiccupule.qpon`.
  잡은 방법 — 확장 없는 Browser pane에서 재생 버튼을 실제로 두 번 클릭하면
  pane이 새 탭 열기를 막으면서 **목적지 도메인을 결과 노트로 알려준다**.
  (플레이어 iframe 내부는 교차 출처라 스크립트 계측이 불가능하므로 이 방법이
  사실상 유일. 플레이어 URL을 직접 열어 계측하는 것도 시도했으나 임베드가
  아니면 "LOADING..."에서 멈춰 실패)
  `.qpon`은 무작위 단어 + TLD 조합으로 도메인을 계속 바꾸는 광고망이 씀
  (nswpedia의 `swordermislike.qpon`, `gp.mulmhitch.cfd`와 같은 계열).
  개별 도메인 차단은 곧 뚫리므로 **TLD 단위로 차단**: rules.json id:10
  정규식 `^https?://[a-z0-9.-]+\.(qpon|cfd)/` (main_frame 포함 = 팝언더 창이
  열려도 내용이 안 뜸) + AD_HINTS에도 `\.(qpon|cfd)\/` 추가(창 자체를 안 열게).
  주의: 실제로 관측한 TLD만 넣을 것. `.sbs`/`.lol` 같은 걸 추측으로 넣으면
  정상 사이트를 막게 됨.
  **못 지우는 것**: 플레이어 안의 "UPGRADE V.I.P MEMBER NOW" 오버레이는
  `turboplays.click` iframe 내부(교차 출처)라 cleaner가 접근 못 함.
  cleaner는 top frame 전용이고, allFrames를 켜도 선택자를 알 수 없어 소용없음.

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

## 다운로드 파일명 (v2.11.0)

**증상**: 파일명이 영상 제목이 아니라 서버가 주는 이름으로 저장됨 (kissjav).

**원인 1 — 교차 출처 제한**: 영상 파일이 페이지와 다른 도메인에 있으면
(kissjav → `cdnhop.com`) 브라우저가 `<a download>`의 **파일명 지정을 무시**한다.
파일명은 서버의 `Content-Disposition`/URL을 따라간다. 같은 출처일 때만 적용됨.
→ `chrome.downloads.download()` 로 받으면 이 제한이 없다. 그런데 downloader.js는
MAIN world(flashvars 접근 때문)라 `chrome.*` 를 못 쓴다 →
`dl-bridge.js`(isolated)가 중계: MAIN이 `mj-download-request` CustomEvent를
쏘면 다리가 백그라운드로 넘기고 `mj-download-result`로 결과를 돌려준다.
다리가 없거나 2.5초 내 응답이 없으면 기존 `<a download>` 방식으로 폴백.

**원인 2 — 쓸 만한 제목이 없음**: 임베드 플레이어 페이지의 `<title>`은
"Embed"거나 주소 그 자체라 파일명으로 못 쓴다. 진짜 제목은 **그 탭을 연 원본 글
페이지**에 있는데 교차 출처라 페이지 스크립트로는 못 읽는다.
→ 백그라운드가 `sender.tab.openerTabId` 의 탭 제목을 읽어(`host_permissions`로
가능, 별도 권한 불필요) 다리가 `documentElement.dataset.mjOpenerTitle` 에 심어준다.

제목 우선순위: `flashvars.video_title` → 쓸 만한 `document.title` →
원본 탭 제목 → 주소 슬러그 → "video".
- `usefulDocTitle()`이 "Embed/Player/Video" 같은 일반명사, 4자 미만, 주소 형태를
  걸러낸다. **이 필터가 없으면 "Embed"가 진짜 제목을 밀어낸다** (단위 테스트로 발견).
- `trimSiteName()`은 "영상 제목 - 사이트 이름"에서 앞부분만 취함.
  앞 조각이 3자 미만이면 잘못 자른 것으로 보고 원본 유지.

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
  **단 화이트리스트는 만능이 아님** — 플레이어를 외부 스크립트가 만들어 넣는
  사이트(bestjavporn)에서는 재생이 깨진다. 재생 경로를 먼저 실측하고 고를 것.
- 재생 버튼을 누르면 새 창 광고가 뜨는데 상위 페이지 `window.open` 후킹에
  안 잡히면 → 팝언더가 **플레이어 iframe 안에서** 열리는 것.
  `STRICT_POPUP_HOSTS`에 사이트를 넣어도 iframe 안에서는 hostname이 달라
  안 걸리므로, 부모 상속 로직(`document.referrer`)이 처리한다. 리퍼러가 비면
  플레이어 호스트 자체를 목록에 추가.
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
- sextb.net: 광고 도메인 실측 후 id:1에 14개 추가 (v2.10.0). 실제 로드된
  리소스 전체에 규칙을 대입해 검증 — 광고/트래커 35개 차단, 플레이어
  (`turboplays.click`)·포스터(`imggle.net`)·샘플(`webstream.ne.jp`)·
  Video.js(`zencdn.net`)·Cloudflare Turnstile은 통과 확인.
  bestjavporn 교훈을 반영해 화이트리스트는 쓰지 않음.
- sextb.net 팝언더: 목적지 `oj.bacchiccupule.qpon` 실측 후 `.qpon`/`.cfd`
  TLD 통째 차단(id:10) + AD_HINTS 반영 (v2.10.4). 정규식이 팝언더는 잡고
  네이버·sextb·turboplays 같은 정상 주소는 안 건드리는 것을 테스트로 확인.
- 다운로드 파일명 (v2.11.0): kissjav처럼 영상 파일이 다른 도메인에 있는 사이트는
  `<a download>`의 파일명이 무시돼 서버 이름으로 저장되던 문제 → `dl-bridge.js`를
  통해 `chrome.downloads`로 저장하도록 변경(실패 시 기존 방식 폴백).
  제목 결정 로직은 단위 테스트로 검증 (kissjav 3케이스 + 임베드/멀티파트 3케이스).
  같은 버전에서 popup-guard의 앵커 차단이 사람이 누른 링크까지 막던 회귀도 수정.
- version 2.11.0.
