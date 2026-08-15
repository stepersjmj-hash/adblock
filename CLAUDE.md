# CLAUDE.md — 개발/유지보수 노트

범용 광고 차단 + 영상 다운로드 버튼 크롬 확장프로그램 (Manifest V3).
사용자 문서는 [README.md](README.md), 이 파일은 개발 컨텍스트/함정 정리용.

## 파일 구조

| 파일 | world / 시점 | 역할 |
|------|--------------|------|
| `manifest.json` | — | MV3 매니페스트. content_scripts 3개 등록, DNR 규칙 연결 |
| `rules.json` | declarativeNetRequest | 네트워크 차단 규칙 (도메인 목록 + 정규식 + 화이트리스트) |
| `popup-guard.js` | MAIN / document_start | 팝업·팝언더 차단 + 우클릭/복사 차단 해제 |
| `downloader.js` | MAIN / document_idle | 영상 재생 페이지에 다운로드 버튼 삽입 |
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

## 검증/문법 체크

```bash
python -c "import json; json.load(open('manifest.json',encoding='utf-8')); json.load(open('rules.json',encoding='utf-8')); print('JSON OK')"
node --check popup-guard.js && node --check downloader.js && node --check cleaner.js
```

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
- version 2.4.0.
