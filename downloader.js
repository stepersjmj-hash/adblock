// 영상 다운로드 버튼: KVS(kt_player) 계열 사이트의 재생 페이지에 다운로드 버튼 삽입
// MAIN world에서 실행되어 페이지의 window.flashvars(실제 재생 URL)에 접근함
(() => {
  const BTN_ID = "mj-download-btn";

  // flashvars.video_url 은 이미 플레이어가 해석한 실제 재생 URL.
  // 일부 사이트는 base64로 담아두므로 http로 시작하지 않으면 디코딩 시도.
  function resolveUrl(raw) {
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw;
    try {
      const dec = atob(raw);
      if (/^https?:\/\//i.test(dec)) return dec;
    } catch (e) {}
    return null;
  }

  function getVideoInfo() {
    const fv = window.flashvars;
    if (!fv) return null;
    const url = resolveUrl(fv.video_url) || resolveUrl(fv.video_alt_url);
    if (!url) return null;
    const title = (fv.video_title || document.title || "video")
      .replace(/[\\/:*?"<>|]+/g, "_") // 파일명에 못 쓰는 문자 제거
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
    const postfix = fv.postfix && /^\.\w+$/.test(fv.postfix) ? fv.postfix : ".mp4";
    return { url, filename: title + postfix };
  }

  function startDownload(info) {
    // 같은 출처(get_file...)에서 시작하는 링크라 download 속성이 적용됨.
    // 서버가 실제 파일 호스트로 302 리다이렉트해도 브라우저가 따라가 저장함.
    const a = document.createElement("a");
    a.href = info.url;
    a.download = info.filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // ── HLS(m3u8) 다운로드: xxembed 등 임베드 전용 호스트 ──────────────
  // 이런 호스트는 저장할 mp4 URL이 없고 HLS 스트리밍만 제공함(다운로드는 유료).
  // 플레이어가 쓰는 것과 같은 경로(fetch, CORS 허용됨)로 세그먼트를 전부 받아
  // 하나로 합쳐 저장한다. 결과물은 .ts 컨테이너 — VLC/팟플레이어에서 재생됨.
  const HLS_HOSTS = ["xxembed.com"];

  function getHlsInfo() {
    const onHlsHost = HLS_HOSTS.some(
      (h) => location.hostname === h || location.hostname.endsWith("." + h)
    );
    if (!onHlsHost) return null;
    try {
      const sources = window.jwplayer && jwplayer().getPlaylist()[0].sources;
      const hls = sources.find(
        (s) => /hls/i.test(s.type) || /\.m3u8/.test(s.file)
      );
      if (!hls) return null;
      // 파일명: 원본 글 제목(리퍼러의 마지막 경로) > 임베드 ID > "video"
      let name = "";
      try {
        name = decodeURIComponent(new URL(document.referrer).pathname)
          .replace(/\/+$/, "")
          .split("/")
          .pop();
      } catch (e) {}
      if (!name) name = (location.pathname.match(/embed-(\w+)/) || [])[1] || "video";
      name = name.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 120);
      return { type: "hls", url: hls.file, filename: name + ".ts" };
    } catch (e) {
      return null; // 플레이어가 아직 준비 안 됨
    }
  }

  async function fetchText(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.text();
  }

  // 마스터 플레이리스트면 BANDWIDTH가 가장 높은 화질을 골라 내려감
  async function resolveMediaPlaylist(url) {
    const text = await fetchText(url);
    if (!/#EXT-X-STREAM-INF/.test(text)) return { url, text };
    const lines = text.split(/\r?\n/);
    let best = null;
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].startsWith("#EXT-X-STREAM-INF")) continue;
      const bw = parseInt((lines[i].match(/BANDWIDTH=(\d+)/) || [])[1] || "0", 10);
      const uri = lines.slice(i + 1).find((l) => l && !l.startsWith("#"));
      if (uri && (!best || bw > best.bw)) best = { bw, uri };
    }
    if (!best) throw new Error("화질 목록 없음");
    const mediaUrl = new URL(best.uri, url).href;
    return { url: mediaUrl, text: await fetchText(mediaUrl) };
  }

  async function startHlsDownload(info, onProgress) {
    const { url: mediaUrl, text } = await resolveMediaPlaylist(info.url);
    if (/#EXT-X-KEY:(?!METHOD=NONE)/.test(text)) {
      throw new Error("암호화 스트림 미지원");
    }
    const initUri = (text.match(/#EXT-X-MAP:URI="([^"]+)"/) || [])[1];
    const segs = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => new URL(l, mediaUrl).href);
    if (!segs.length) throw new Error("세그먼트 없음");

    const bufs = new Array(segs.length);
    let done = 0;
    const CHUNK = 4; // 서버 부담 없이 적당히 병렬로
    for (let i = 0; i < segs.length; i += CHUNK) {
      await Promise.all(
        segs.slice(i, i + CHUNK).map(async (url, j) => {
          const res = await fetch(url);
          if (!res.ok) throw new Error("HTTP " + res.status);
          bufs[i + j] = await res.arrayBuffer();
          onProgress(++done, segs.length);
        })
      );
    }
    const parts = initUri
      ? [await (await fetch(new URL(initUri, mediaUrl).href)).arrayBuffer(), ...bufs]
      : bufs;
    const blob = new Blob(parts, { type: "video/mp2t" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = info.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }

  const BTN_STYLE = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    margin: "10px 8px 10px 0",
    padding: "10px 18px",
    fontSize: "15px",
    fontWeight: "700",
    lineHeight: "1.2",
    color: "#fff",
    background: "#e91e63",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,.35)",
    zIndex: "2147483647"
  };

  function createButton() {
    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.textContent = "⬇ 영상 다운로드";
    Object.assign(btn.style, BTN_STYLE);
    btn.addEventListener("mouseenter", () => (btn.style.background = "#c2185b"));
    btn.addEventListener("mouseleave", () => (btn.style.background = "#e91e63"));
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (btn.dataset.busy) return; // HLS 수신 중 중복 클릭 방지
      const fresh = getVideoInfo() || getHlsInfo();
      if (!fresh) {
        btn.textContent = "⬇ URL을 찾는 중...";
        setTimeout(() => (btn.textContent = "⬇ 영상 다운로드"), 1500);
        return;
      }
      if (fresh.type === "hls") {
        btn.dataset.busy = "1";
        btn.textContent = "⬇ 준비 중...";
        startHlsDownload(fresh, (done, total) => {
          btn.textContent =
            "⬇ 받는 중 " + Math.floor((done / total) * 100) + "% (" + done + "/" + total + ")";
        })
          .then(() => {
            btn.textContent = "✓ 저장됨 (.ts — VLC/팟플레이어로 재생)";
          })
          .catch((err) => {
            btn.textContent = "⬇ 실패: " + ((err && err.message) || "오류");
          })
          .finally(() => {
            delete btn.dataset.busy;
            setTimeout(() => (btn.textContent = "⬇ 영상 다운로드"), 8000);
          });
        return;
      }
      btn.textContent = "⬇ 다운로드 시작됨...";
      startDownload(fresh);
      setTimeout(() => (btn.textContent = "⬇ 영상 다운로드"), 2500);
    });
    return btn;
  }

  // 버튼이 화면에 "실제로" 보이는지 확인 (크기 + 다른 요소에 가려졌는지).
  // 플레이어 안에 넣으면 영상 캔버스에 가려지므로 이 검사가 핵심.
  function isReallyVisible(btn) {
    const r = btn.getBoundingClientRect();
    if (r.width <= 10 || r.height <= 10) return false;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    // 뷰포트 밖이면(스크롤하면 보임) 배치는 유효한 것으로 인정
    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return true;
    const top = document.elementFromPoint(cx, cy);
    return top === btn || btn.contains(top);
  }

  function styleFloating(btn) {
    Object.assign(btn.style, {
      position: "fixed",
      right: "20px",
      bottom: "70px", // 전체화면 플레이어의 하단 컨트롤 바를 가리지 않게
      margin: "0"
    });
  }

  // 영상 아래의 "보이는" 위치를 우선 시도하고, 가려지면 다음 후보로,
  // 끝까지 안 되면 화면 우하단 고정 버튼으로 대체.
  function placeButton(btn) {
    const attempts = [];

    // 1) 영상 아래 "액션 버튼 행"을 텍스트로 정확히 식별
    //    (같은 .btn-holder 클래스가 상단 메뉴에도 있어서 클래스만으론 안 됨)
    const rows = [
      ...document.querySelectorAll(".btn-holder, .video-actions, .actions, .video-info")
    ];
    const actionRow = rows.find((r) =>
      /Video Details|Screenshots|Comments|Share|Download|좋아요|공유/i.test(
        r.textContent || ""
      )
    );
    if (actionRow) attempts.push(() => actionRow.insertBefore(btn, actionRow.firstChild));

    // 2) 플레이어 블록 "바깥 아래"에 삽입 (player-wrap 안에 넣으면 영상에 가려짐)
    const player = document.querySelector("#kt_player, .fp-player, .video-player");
    if (player) {
      let node = player;
      while (
        node.parentElement &&
        /player|video|col-video/i.test(node.parentElement.className || "")
      ) {
        node = node.parentElement;
      }
      const outer = node;
      if (outer.parentElement) {
        attempts.push(() => outer.parentElement.insertBefore(btn, outer.nextSibling));
      }
    }

    // 3) 제목(h1) 바로 아래
    const title = document.querySelector("h1");
    if (title && title.parentElement) {
      attempts.push(() => title.parentElement.insertBefore(btn, title.nextSibling));
    }

    for (const attempt of attempts) {
      attempt();
      if (isReallyVisible(btn)) return; // 보이면 성공
      btn.remove(); // 가려졌으면 떼고 다음 후보 시도
    }

    // 4) 최후: 화면 우하단 고정 (항상 보임)
    styleFloating(btn);
    (document.body || document.documentElement).appendChild(btn);
  }

  // flashvars 가 준비되면 버튼을 만들고, 이후에도 버튼이 사라지면 다시 삽입 (자가 복구)
  function ensureButton() {
    const info = getVideoInfo() || getHlsInfo();
    if (!info) return; // 아직 영상 정보 없음 (또는 영상 페이지 아님)
    const existing = document.getElementById(BTN_ID);
    if (existing) {
      // 남아있지만 가려졌으면 재배치
      if (!isReallyVisible(existing)) {
        existing.remove();
        placeButton(createButton());
      }
      return;
    }
    placeButton(createButton());
  }

  // 주기적으로 상태 확인: 늦게 뜨는 플레이어, 페이지 내 이동, 버튼 제거/가림 모두 대응
  ensureButton();
  setInterval(ensureButton, 1000);
})();
