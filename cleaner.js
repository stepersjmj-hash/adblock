// 광고 요소 제거: DOM에 이미 있거나 나중에 삽입되는 광고를 계속 감시해서 삭제
// 모든 사이트에서 동작
(() => {
  const AD_HINTS = /(exoclick|exosrv|exdynsrv|magsrv|realsrv|pemsrv|tsyndicate|trafficstars|juicyads|jads\.co|adsjudo|trafficjunky|adtng|adsterra|highperformanceformat|profitablecpmrate|effectiveratecpm|highcpmgate|popads\.net|popcash|popmyads|popunder|propeller(ads|click)|onclicka|hilltopads|clickadu|clickadilla|adnium|plugrush|trafficfactory|eroadvertising|ero-advertising|adxpansion|ad-maven|javbucks|coverdistilltile|qfanakacp|alfalfaemployeeresource|aboundadmirermyself|portalfluently|vivodemisrentas|illinformed-summer|diagramjawlineunhappy|normal-place\.com|thekav\.co|whitetrafsa|satisfactorilybewitchgreatness|diapsidbuchloe|lib-net\.dev|swordermislike|mulmhitch|agonizingrest|dtscout|dtscdn|mrktmtrcs|crwdcntrl|histats|rmhfrtnd|alaphoid|nomandswitch|tapioni|flushpersist|nresystems|javhd-trk|theporndude|tesorf|grabyourluck|stripchat|strpst|chapturist|doppiocdn|doppiostreams|show-sb|bakestubborn|doubleclick|googlesyndication)/i;

  const AD_SELECTORS = [
    ".ads", ".ad-box", ".ad-banner", ".ad-block", ".ad-container",
    ".advertisement", ".adsbygoogle",
    "#ads", "#ad-top", "#ad-bottom",
    "[id^='ad_']", "[id^='ads_']",
    "[class*='banner-ad']", "[class*='ad-zone']",
    ".bottom-adv", ".top-adv", ".side-adv", ".adv-box",
    "ins.adsbygoogle"
  ].join(",");

  // 사이트가 HTML에 직접 심는 광고/공지 오버레이 — 네트워크 차단(DNR)으론 못 막아서
  // DOM에서 제거. 키: 도메인(서브도메인 포함 매칭), 값: 제거할 선택자
  const SITE_SELECTORS = {
    // 접속 주소 안내 텔레그램 팝업 (#tg-popup) — 매 방문마다 화면 전체를 덮음
    "watchfreejavonline.co": "#tg-popup, .tg-overlay"
  };
  const siteSelector = Object.entries(SITE_SELECTORS)
    .filter(
      ([h]) => location.hostname === h || location.hostname.endsWith("." + h)
    )
    .map(([, sel]) => sel)
    .join(",");

  function removeAds(root) {
    // 광고 도메인을 가리키는 iframe / embed / 링크 배너 제거
    root.querySelectorAll("iframe[src], embed[src]").forEach((el) => {
      if (AD_HINTS.test(el.src)) el.remove();
    });
    root.querySelectorAll("a[href]").forEach((el) => {
      if (AD_HINTS.test(el.href)) {
        // 배너 통째로 제거 (링크만 지우면 빈 컨테이너가 남음)
        const box = el.closest("div, section, aside, li") || el;
        box.remove();
      }
    });
    // 흔한 광고 컨테이너 클래스/ID 제거
    root.querySelectorAll(AD_SELECTORS).forEach((el) => el.remove());
    // 사이트별 자체 삽입 오버레이 제거
    if (siteSelector) {
      root.querySelectorAll(siteSelector).forEach((el) => el.remove());
    }
  }

  // 화면 전체를 덮는 투명 클릭 유도 오버레이 제거.
  // 오탐을 막기 위해 조건을 좁게 잡음: body 직계 자식 + 화면 90% 이상 덮음
  // + 투명 + 내용(텍스트/영상/iframe) 없음 → 사실상 클릭 함정만 해당
  function removeOverlays() {
    document.querySelectorAll("body > div, body > a").forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed" && cs.position !== "absolute") return;
      const z = parseInt(cs.zIndex, 10);
      if (isNaN(z) || z < 1000) return;
      const r = el.getBoundingClientRect();
      const coversScreen =
        r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.9;
      if (!coversScreen) return;
      const isTransparent =
        cs.opacity === "0" || cs.backgroundColor === "rgba(0, 0, 0, 0)";
      const isEmpty =
        (el.textContent || "").trim() === "" &&
        !el.querySelector("video, iframe, img, input, button");
      if (isTransparent && isEmpty) {
        el.remove();
      }
    });
  }

  removeAds(document);
  removeOverlays();

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (
          (node.matches && node.matches(AD_SELECTORS)) ||
          (siteSelector && node.matches && node.matches(siteSelector)) ||
          (node.src && AD_HINTS.test(node.src))
        ) {
          node.remove();
          continue;
        }
        removeAds(node);
      }
    }
    removeOverlays();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
