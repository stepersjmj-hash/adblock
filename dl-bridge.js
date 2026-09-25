// downloader.js(MAIN world)와 백그라운드를 잇는 다리 (isolated world)
//
// MAIN world 스크립트는 chrome.* API를 못 쓴다. 그래서 확장 권한이 필요한 두 가지를
// 여기서 대신 처리하고, 페이지와는 DOM 속성/커스텀 이벤트로 주고받는다.
//
// 1) 원본 페이지 제목 — 임베드 플레이어 페이지는 자기 <title>이 "Embed" 같은
//    쓸모없는 값이라 파일명을 만들 수 없다. 그 탭을 연 원본 글 페이지의 제목을
//    백그라운드에서 받아 DOM 속성에 심어둔다.
// 2) 파일 저장 — 영상 파일이 페이지와 다른 도메인에 있으면 브라우저가
//    `<a download>`의 파일명 지정을 무시한다(교차 출처 제한). chrome.downloads로
//    받으면 이 제한이 없어 원하는 파일명으로 저장된다.
(() => {
  // ── 1) 원본 페이지 제목 ──────────────────────────────────────────
  // 다운로드 버튼이 뜰 수 있는 곳에서만 물어본다 (광고 iframe 다수인 페이지 대비)
  const embedLike = /\/(embed|e|t)[-/]/i.test(location.pathname);
  if (window.top === window.self || embedLike) {
    try {
      chrome.runtime.sendMessage({ type: "mj-opener-title" }, (res) => {
        if (chrome.runtime.lastError || !res || !res.title) return;
        try {
          document.documentElement.dataset.mjOpenerTitle = res.title;
        } catch (e) {}
      });
    } catch (e) {}
  }

  // ── 2) 저장 요청 중계 ────────────────────────────────────────────
  document.addEventListener("mj-download-request", (ev) => {
    const d = (ev && ev.detail) || {};
    const url = String(d.url || "");
    const filename = String(d.filename || "");
    const reply = (ok, error) => {
      try {
        document.dispatchEvent(
          new CustomEvent("mj-download-result", { detail: { ok, error: error || "" } })
        );
      } catch (e) {}
    };
    if (!/^https?:\/\//i.test(url)) return reply(false, "bad url");
    try {
      chrome.runtime.sendMessage({ type: "mj-download", url, filename }, (res) => {
        if (chrome.runtime.lastError) return reply(false, chrome.runtime.lastError.message);
        reply(!!(res && res.ok), res && res.error);
      });
    } catch (e) {
      reply(false, String(e && e.message));
    }
  });
})();
