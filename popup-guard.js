// 팝업/팝언더 차단 (페이지 스크립트보다 먼저 MAIN world에서 실행됨)
(() => {
  const realOpen = window.open.bind(window);

  // window.open: 같은 사이트 URL만 허용, 그 외(광고 팝언더)는 전부 차단
  window.open = function (url, ...rest) {
    try {
      const u = new URL(url || "", location.href);
      if (u.origin === location.origin) {
        return realOpen(url, ...rest);
      }
    } catch (e) {
      // URL 파싱 실패 = 수상한 호출, 차단
    }
    // 팝업 차단 감지를 우회하려는 스크립트를 위해 가짜 window 객체 반환
    return {
      closed: true,
      close() {},
      focus() {},
      blur() {},
      postMessage() {},
      location: { href: "" },
      document: null
    };
  };

  // 광고 스크립트가 덮어쓴 window.open을 되돌리지 못하게 고정
  try {
    Object.defineProperty(window, "open", {
      value: window.open,
      writable: false,
      configurable: false
    });
  } catch (e) {}

  // 클릭 시 새 탭으로 광고를 여는 <a target="_blank"> 하이재킹 차단:
  // 외부 광고 도메인으로 향하는 동적 링크 클릭을 캡처 단계에서 무력화
  const AD_HINTS = /(exoclick|exosrv|magsrv|realsrv|tsyndicate|trafficstars|juicyads|jads\.co|trafficjunky|adsterra|popads|popcash|hilltopads|clickadu|onclicka|propeller|plugrush|trafficfactory|adxpansion|ad-maven|javbucks|stripchat|chaturbate|bongacams|livejasmin)/i;

  document.addEventListener(
    "click",
    (ev) => {
      const a = ev.target && ev.target.closest && ev.target.closest("a[href]");
      if (!a) return;
      if (AD_HINTS.test(a.href)) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
      }
    },
    true
  );

  // 우클릭/드래그/복사 차단 해제:
  // 사이트가 등록한 차단 핸들러가 이벤트를 받기 전에 캡처 단계(window)에서
  // 전파를 끊어버림 → 아무도 preventDefault를 못 하므로 기본 동작(우클릭 메뉴 등)이 살아남
  ["contextmenu", "selectstart", "dragstart", "copy"].forEach((type) => {
    window.addEventListener(
      type,
      (ev) => {
        ev.stopImmediatePropagation();
      },
      true
    );
  });

  // 인라인 속성(oncontextmenu="return false" 등)으로 막는 경우도 무력화
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
  document.addEventListener("DOMContentLoaded", clearInlineBlockers);
  clearInlineBlockers();
})();
