// 팝업/팝언더 차단 + 우클릭 차단 해제
// 모든 사이트에서 페이지 스크립트보다 먼저 MAIN world에서 실행됨
(() => {
  // 알려진 광고 네트워크 도메인 패턴 (rules.json과 짝을 이룸)
  const AD_HINTS = /(exoclick|exosrv|exdynsrv|magsrv|realsrv|pemsrv|tsyndicate|trafficstars|juicyads|jads\.co|adsjudo|trafficjunky|adtng|adsterra|highperformanceformat|profitablecpmrate|effectiveratecpm|highcpmgate|popads\.net|popcash|popmyads|popunder|propeller(ads|click)|onclicka|hilltopads|clickadu|clickadilla|adnium|plugrush|trafficfactory|eroadvertising|ero-advertising|adxpansion|ad-maven|javbucks|coverdistilltile|qfanakacp|alfalfaemployeeresource|aboundadmirermyself|portalfluently|vivodemisrentas|illinformed-summer|diagramjawlineunhappy|normal-place\.com|thekav\.co|whitetrafsa|satisfactorilybewitchgreatness|diapsidbuchloe|lib-net\.dev|swordermislike|mulmhitch|doubleclick|googlesyndication)/i;

  // 광고가 심한 사이트: 처음부터 엄격 모드 (같은 사이트 팝업 외 전부 차단)
  // 광고 도메인을 계속 바꾸는 사이트는 여기에 추가
  const STRICT_POPUP_HOSTS = ["kissjav.li", "kissjav.com", "watchfreejavonline.co", "xxembed.com", "nswpedia.com"];

  // 자체 우클릭 메뉴를 정상적으로 쓰는 서비스 — 우클릭 복원을 적용하지 않음
  // (필요하면 여기에 도메인 추가)
  const RIGHTCLICK_EXCLUDED = [
    "docs.google.com",
    "drive.google.com",
    "www.google.com",
    "figma.com",
    "notion.so",
    "miro.com",
    "canva.com",
    "excalidraw.com",
    "vscode.dev",
    "github.dev",
    "office.com",
    "onedrive.live.com"
  ];

  const host = location.hostname;
  const rightclickExcluded = RIGHTCLICK_EXCLUDED.some(
    (h) => host === h || host.endsWith("." + h)
  );

  // ── 팝업/팝언더 차단 ─────────────────────────────────────────────
  // 기본: 알려진 광고 도메인으로의 window.open만 차단 (정상 사이트의
  // 로그인 팝업 등은 통과). 단, 이 사이트에서 광고 팝업 시도가 한 번이라도
  // 감지되면 "엄격 모드"로 전환해서 외부 도메인 팝업을 전부 차단함
  // — 팝언더를 쓰는 사이트는 매번 랜덤 도메인을 쓰기 때문.
  let strictMode = STRICT_POPUP_HOSTS.some(
    (h) => host === h || host.endsWith("." + h)
  );

  const fakeWindow = () => ({
    closed: true,
    close() {},
    focus() {},
    blur() {},
    postMessage() {},
    location: { href: "" },
    document: null
  });

  const realOpen = window.open.bind(window);

  window.open = function (url, ...rest) {
    try {
      const u = new URL(url || "", location.href);
      if (AD_HINTS.test(u.href)) {
        strictMode = true;
        return fakeWindow();
      }
      if (strictMode && u.origin !== location.origin) {
        return fakeWindow();
      }
      return realOpen(url, ...rest);
    } catch (e) {
      return fakeWindow();
    }
  };

  // 광고 스크립트가 덮어쓴 window.open을 되돌리지 못하게 고정
  try {
    Object.defineProperty(window, "open", {
      value: window.open,
      writable: false,
      configurable: false
    });
  } catch (e) {}

  // 광고 도메인으로 향하는 <a target="_blank"> 하이재킹 차단
  document.addEventListener(
    "click",
    (ev) => {
      const a = ev.target && ev.target.closest && ev.target.closest("a[href]");
      if (!a) return;
      if (AD_HINTS.test(a.href)) {
        strictMode = true;
        ev.preventDefault();
        ev.stopImmediatePropagation();
      }
    },
    true
  );

  // ── 우클릭/드래그/복사 차단 해제 ─────────────────────────────────
  if (!rightclickExcluded) {
    // 사이트가 등록한 차단 핸들러가 이벤트를 받기 전에 캡처 단계(window)에서
    // 전파를 끊음 → 아무도 preventDefault를 못 하므로 기본 동작이 살아남.
    // 차단 핸들러가 없는 평범한 사이트에서는 아무 영향 없음.
    ["contextmenu", "selectstart", "dragstart", "copy"].forEach((type) => {
      window.addEventListener(
        type,
        (ev) => {
          ev.stopImmediatePropagation();
        },
        true
      );
    });

    // 인라인 속성(oncontextmenu="return false" 등) 무력화
    const clearInlineBlockers = () => {
      document.oncontextmenu = null;
      document.onselectstart = null;
      document.ondragstart = null;
      if (document.body) {
        document.body.oncontextmenu = null;
        document.body.onselectstart = null;
        document.body.ondragstart = null;
      }
    };
    clearInlineBlockers();

    document.addEventListener("DOMContentLoaded", () => {
      clearInlineBlockers();

      // CSS(user-select: none)로 드래그 선택을 막아둔 사이트에서만 강제 해제
      // (모든 사이트에 걸면 버튼 텍스트까지 선택되는 부작용이 있어서 조건부 적용)
      const bodyStyle = getComputedStyle(document.body);
      if (bodyStyle.userSelect === "none" || bodyStyle.webkitUserSelect === "none") {
        const style = document.createElement("style");
        style.textContent =
          "html, body, body * { user-select: text !important; -webkit-user-select: text !important; }";
        document.documentElement.appendChild(style);
      }
    });
  }
})();
