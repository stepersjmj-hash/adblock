// EBS VOD 다운로드 버튼 (isolated world — chrome.runtime 사용해야 해서)
//
// 다른 사이트와 방식이 다른 이유:
// 영상 파일은 CDN(wstrotu.ebs.co.kr)에 있는데 CORS 헤더를 안 줘서 페이지
// 안에서 fetch로 받아올 수 없다("Failed to fetch"). 또 파일 호스트가
// 페이지와 다른 도메인이라 <a download>의 download 속성도 무시된다.
// → 주소만 백그라운드로 넘겨 chrome.downloads가 브라우저 차원에서 받게 한다.
//    (CORS와 무관하게 동작하고, CloudFront 서명 주소도 그대로 유효함)
(() => {
  const BTN_ID = "mj-ebs-download-btn";

  // 페이지에는 화질별 서명 주소가 전부 들어있음. 높은 화질 우선.
  const QUALITY_ORDER = ["5m", "2m", "1m", "500k"];
  const QUALITY_LABEL = { "5m": "최고화질", "2m": "고화질", "1m": "일반", "500k": "저화질" };

  function collectUrls() {
    const html = document.documentElement.outerHTML;
    return [...new Set(html.match(/https?:\/\/[^"'\s\\<>]+\.mp4[^"'\s\\<>]*/g) || [])]
      .map((u) => u.replace(/&amp;/g, "&"))
      .filter((u) => /[?&]Signature=/.test(u)); // 서명된 실제 영상만 (샘플 영상 제외)
  }

  function pickSource() {
    const urls = collectUrls();
    for (const q of QUALITY_ORDER) {
      const hit = urls.find((u) => u.includes("/" + q + "/"));
      if (hit) return { url: hit, quality: q };
    }
    if (urls.length) return { url: urls[0], quality: null };

    // 서명 주소를 못 찾으면 재생 중인 것이라도 사용
    const v = document.querySelector("video");
    const src = v && (v.currentSrc || v.src);
    if (src && !src.startsWith("blob:") && /\.mp4/.test(src)) {
      return { url: src, quality: null };
    }
    return null;
  }

  // 맛보기(유료 구독 콘텐츠)는 서버가 앞부분만 잘라서 보냄 → 받아도 60초짜리
  function isPreview(url) {
    return /[?&]end=\d+/.test(url) || /맛보기/.test(document.body.innerText || "");
  }

  function buildFilename() {
    const el =
      document.querySelector(".mpv-title-layout") ||
      document.querySelector("#mpv-title-text");
    let name = (el && el.textContent) || document.title || "ebs-video";
    name = name
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "_")
      .slice(0, 120);
    return (name || "ebs-video") + ".mp4";
  }

  const BTN_STYLE = {
    position: "fixed",
    right: "20px",
    bottom: "90px", // 플레이어 하단 컨트롤 바를 가리지 않게
    zIndex: "2147483647",
    display: "inline-flex",
    alignItems: "center",
    padding: "10px 18px",
    fontSize: "14px",
    fontWeight: "700",
    lineHeight: "1.2",
    color: "#fff",
    background: "#e91e63",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,.35)"
  };

  function label(src) {
    const q = src.quality ? " (" + (QUALITY_LABEL[src.quality] || src.quality) + ")" : "";
    return "⬇ 영상 저장" + q;
  }

  function createButton(src) {
    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.textContent = label(src);
    Object.assign(btn.style, BTN_STYLE);
    btn.addEventListener("mouseenter", () => (btn.style.background = "#c2185b"));
    btn.addEventListener("mouseleave", () => (btn.style.background = "#e91e63"));

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const fresh = pickSource();
      if (!fresh) {
        btn.textContent = "⬇ 영상 주소를 찾는 중...";
        setTimeout(() => (btn.textContent = label(src)), 1500);
        return;
      }
      if (isPreview(fresh.url)) {
        // 구독이 필요한 콘텐츠는 애초에 60초짜리만 내려옴 — 받아도 의미 없음
        btn.textContent = "맛보기(60초)라 저장 안 함";
        setTimeout(() => (btn.textContent = label(src)), 4000);
        return;
      }
      btn.textContent = "⬇ 저장 시작...";
      chrome.runtime.sendMessage(
        { type: "mj-download", url: fresh.url, filename: buildFilename() },
        (res) => {
          if (chrome.runtime.lastError || !res || !res.ok) {
            const msg =
              (chrome.runtime.lastError && chrome.runtime.lastError.message) ||
              (res && res.error) ||
              "오류";
            btn.textContent = "⬇ 실패: " + String(msg).slice(0, 30);
          } else {
            btn.textContent = "✓ 다운로드 폴더에 저장 중";
          }
          setTimeout(() => (btn.textContent = label(src)), 5000);
        }
      );
    });
    return btn;
  }

  // 전체화면일 때는 전체화면 요소 안에 넣어야 보인다.
  // (전체화면 모드에서는 그 요소와 자손만 렌더링되므로 body에 붙은 fixed 버튼은
  //  화면에 나오지 않음)
  function mount(btn) {
    const host = document.fullscreenElement || document.body || document.documentElement;
    if (btn.parentElement !== host) host.appendChild(btn);
  }

  function ensureButton() {
    // 플레이어가 있는 페이지에서만
    if (!document.querySelector("video")) return;
    const src = pickSource();
    if (!src) return;
    const existing = document.getElementById(BTN_ID);
    mount(existing || createButton(src));
  }

  ensureButton();
  setInterval(ensureButton, 1000); // 플레이어가 늦게 뜨거나 편이 바뀌는 경우 대응
  document.addEventListener("fullscreenchange", ensureButton);
})();
