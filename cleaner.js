// 광고 요소 제거: DOM에 이미 있거나 나중에 삽입되는 광고를 계속 감시해서 삭제
(() => {
  const AD_HINTS = /(exoclick|exosrv|magsrv|realsrv|tsyndicate|trafficstars|juicyads|jads\.co|trafficjunky|adsterra|popads|popcash|hilltopads|clickadu|onclicka|propeller|plugrush|trafficfactory|adxpansion|ad-maven|javbucks|stripchat|chaturbate|bongacams|livejasmin|doubleclick|googlesyndication)/i;

  const AD_SELECTORS = [
    ".ads", ".ad-box", ".ad-banner", ".ad-block", ".ad-container",
    ".advertisement", ".adsbygoogle",
    "#ads", "#ad-top", "#ad-bottom",
    "[id^='ad_']", "[id^='ads_']",
    "[class*='banner-ad']", "[class*='ad-zone']",
    "ins.adsbygoogle"
  ].join(",");

  function removeAds(root) {
    // 광고 도메인을 가리키는 iframe / script / 링크 배너 제거
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
  }

  // 화면 전체를 덮는 클릭 유도 오버레이 제거 (동영상 플레이어는 건드리지 않음)
  function removeOverlays() {
    document.querySelectorAll("body > div, body > a").forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed" && cs.position !== "absolute") return;
      const z = parseInt(cs.zIndex, 10);
      if (isNaN(z) || z < 1000) return;
      const r = el.getBoundingClientRect();
      const coversScreen =
        r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.9;
      const isTransparentClickTrap =
        coversScreen && (cs.opacity === "0" || cs.backgroundColor === "rgba(0, 0, 0, 0)");
      if (isTransparentClickTrap && !el.querySelector("video")) {
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
