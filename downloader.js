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

  function sanitize(s) {
    return String(s || "")
      .replace(/[\\/:*?"<>|]+/g, "_") // 파일명에 못 쓰는 문자 제거
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
  }

  // 이 탭을 연 원본 글 페이지의 제목 (dl-bridge.js가 DOM 속성에 심어줌).
  // 임베드 플레이어는 자기 <title>이 "Embed" 같은 값이라 쓸 수 없어서 필요함.
  function openerTitle() {
    try {
      return trimSiteName(document.documentElement.dataset.mjOpenerTitle || "");
    } catch (e) {
      return "";
    }
  }

  // "영상 제목 - 사이트 이름" 형태가 흔하므로 앞부분만 사용.
  // 앞 조각이 너무 짧으면 잘못 자른 것이므로 원본을 그대로 둔다.
  function trimSiteName(t) {
    const head = String(t || "").split(/\s+[-|–—]\s+/)[0];
    return sanitize(head.length >= 3 ? head : t);
  }

  // 임베드 플레이어 페이지의 <title>은 "Embed", "Player", 또는 주소 그 자체처럼
  // 파일명으로 쓸 수 없는 값인 경우가 많다. 그런 제목은 버리고 다음 후보로 넘긴다.
  function usefulDocTitle() {
    const t = trimSiteName(document.title);
    if (!t || t.length < 4) return "";
    if (/^(embed|player|video|loading|untitled|home|index)$/i.test(t)) return "";
    // "xxembed.com/embed-abc.html" 처럼 제목이 없어 브라우저가 주소를 보여주는 경우
    if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(t) || /:\/\//.test(t)) return "";
    return t;
  }

  // ── 부모 페이지 → 임베드 iframe 제목 전달 ────────────────────────
  // 같은 탭 안에 iframe 으로 끼워진 플레이어(yamoa → rubyvid 등)는 자기 페이지에
  // 제목이 전혀 없고, 리퍼러도 출처(origin)만 와서 슬러그조차 못 얻는다.
  // 진짜 제목은 부모 글 페이지에만 있는데 교차 출처라 직접 못 읽으므로
  // postMessage 로 물어본다. (이 스크립트는 all_frames 라 부모에서도 돈다)
  const TITLE_ASK = "mj-title-ask";
  const TITLE_REPLY = "mj-title-reply";
  const inFrame = window.top !== window.self;
  let parentTitle = "";

  // 이 페이지 자체가 가진 글 제목: og:title → h1 → 쓸 만한 <title>
  function ownPageTitle() {
    const og = document.querySelector('meta[property="og:title"]');
    const t1 = sanitize(og && og.content);
    if (t1) return trimSiteName(t1);
    const h1 = document.querySelector("h1");
    const t2 = sanitize(h1 && h1.textContent);
    if (t2.length >= 2) return t2;
    return usefulDocTitle();
  }

  window.addEventListener("message", (ev) => {
    const d = ev && ev.data;
    if (!d || typeof d !== "object") return;
    if (d[TITLE_ASK] && ev.source) {
      // 자식 프레임의 질문 → 내가 아는 제목(내가 iframe 이면 물려받은 것 우선)
      const title = (inFrame && parentTitle) || ownPageTitle();
      if (title) {
        try {
          ev.source.postMessage({ [TITLE_REPLY]: title }, "*");
        } catch (e) {}
      }
    } else if (d[TITLE_REPLY] && ev.source === window.parent) {
      parentTitle = sanitize(d[TITLE_REPLY]);
    }
  });

  function askParentTitle() {
    if (!inFrame || parentTitle) return;
    try {
      window.parent.postMessage({ [TITLE_ASK]: 1 }, "*");
    } catch (e) {}
  }

  // 주소의 마지막 조각도 보통 제목에서 만들어진다 (한글이면 퍼센트 인코딩됨)
  function titleFromSlug() {
    try {
      const seg = decodeURIComponent(location.pathname)
        .replace(/\/+$/, "")
        .split("/")
        .pop();
      return sanitize(String(seg || "").replace(/[-_]+/g, " "));
    } catch (e) {
      return "";
    }
  }

  function getVideoInfo() {
    const fv = window.flashvars;
    if (!fv) return null;
    const url = resolveUrl(fv.video_url) || resolveUrl(fv.video_alt_url);
    if (!url) return null;
    const title =
      sanitize(fv.video_title) ||
      usefulDocTitle() ||
      openerTitle() ||
      titleFromSlug() ||
      "video";
    const postfix = fv.postfix && /^\.\w+$/.test(fv.postfix) ? fv.postfix : ".mp4";
    return { url, filename: title + postfix };
  }

  // ── mp4 직접 재생 임베드 호스트 (sendvid 등) ─────────────────────
  // flashvars 도 HLS 도 없이 <video><source src="….mp4?서명"> 로 바로 재생한다.
  // 서명 쿼리(validfrom/validto/hash)가 붙은 주소를 그대로 받아야 하므로
  // 페이지에 들어있는 src 를 그대로 쓴다. 제목은 og:title 에 원본 제목이 있다
  // (임베드 페이지 <title>은 "Sendvid - Instant video upload"라 못 씀).
  const DIRECT_HOSTS = ["sendvid.com"];

  function getDirectInfo() {
    const h = location.hostname;
    if (!DIRECT_HOSTS.some((d) => h === d || h.endsWith("." + d))) return null;
    const src = document.querySelector('video source[type="video/mp4"], video source');
    const vid = document.querySelector("video");
    const url = resolveUrl((src && src.src) || (vid && (vid.currentSrc || vid.src)));
    if (!url || !/\.mp4(\?|$)/i.test(url)) return null;
    const og = document.querySelector('meta[property="og:title"]');
    const title =
      sanitize(og && og.content) ||
      parentTitle ||
      openerTitle() ||
      usefulDocTitle() ||
      "video";
    return { url, filename: title + ".mp4" };
  }

  function anchorDownload(info) {
    const a = document.createElement("a");
    a.href = info.url;
    a.download = info.filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // **파일명이 영상 제목으로 안 붙던 이유**: 영상 파일이 페이지와 다른 도메인에
  // 있으면(kissjav → cdnhop.com 등) 브라우저가 `<a download>`의 파일명 지정을
  // 교차 출처 제한으로 무시하고 서버가 주는 이름으로 저장해버린다.
  // → 확장의 chrome.downloads 로 받으면 제한이 없다. dl-bridge 를 통해 요청하고,
  //   다리가 없거나 실패하면 기존 방식으로 되돌린다(최소한 받아지기는 하도록).
  function startDownload(info, onStatus) {
    let settled = false;
    function onResult(ev) {
      const d = (ev && ev.detail) || {};
      finish(!!d.ok, d.error);
    }
    function finish(ok, err) {
      if (settled) return;
      settled = true;
      document.removeEventListener("mj-download-result", onResult);
      if (!ok) anchorDownload(info); // 폴백
      if (onStatus) onStatus(ok, err);
    }
    document.addEventListener("mj-download-result", onResult);
    try {
      document.dispatchEvent(
        new CustomEvent("mj-download-request", {
          detail: { url: info.url, filename: info.filename }
        })
      );
    } catch (e) {
      return finish(false, "dispatch");
    }
    setTimeout(() => finish(false, "timeout"), 2500);
  }

  // ── HLS(m3u8) 다운로드: 임베드 전용 호스트 ─────────────────────────
  // 이런 호스트는 저장할 mp4 URL이 없고 HLS 스트리밍만 제공함(다운로드는 유료).
  // 플레이어가 쓰는 것과 같은 경로(fetch, CORS 허용됨)로 세그먼트를 전부 받아
  // 하나로 합쳐 저장한다. 결과물은 .ts 컨테이너 — VLC/팟플레이어에서 재생됨.
  //
  // 호스트가 수시로 바뀌므로(xxembed.com → xxxbed.cyou → guccihide.store)
  // 목록 + "임베드 URL 형태" 휴리스틱을 함께 씀. 어느 쪽이든 jwplayer의 HLS
  // 소스가 실제로 있어야만 버튼이 뜨므로 일반 사이트에 오작동하지 않음.
  const HLS_HOSTS = ["xxembed.com", "guccihide.store"];

  function isEmbedLikePage() {
    if (
      HLS_HOSTS.some(
        (h) => location.hostname === h || location.hostname.endsWith("." + h)
      )
    ) {
      return true;
    }
    // /embed-xxxx.html, /embed/xxxx, /e/xxxx 형태
    return /\/(embed|e)[-/]/i.test(location.pathname);
  }

  function getHlsInfo() {
    if (!isEmbedLikePage()) return null;
    try {
      const sources = window.jwplayer && jwplayer().getPlaylist()[0].sources;
      const hls = sources.find(
        (s) => /hls/i.test(s.type) || /\.m3u8/.test(s.file)
      );
      if (!hls) return null;
      // 소스가 상대 경로("/stream/.../master.m3u8")인 호스트가 있어 절대화 필수
      const url = new URL(hls.file, location.href).href;

      // 파일명: 원본 글 제목 > 원본 글 슬러그(리퍼러) > 임베드 ID > "video"
      // 제목을 먼저 쓰는 이유 — 슬러그는 하이픈 범벅이고, 멀티파트 목록 페이지를
      // 거쳐 오면 리퍼러가 무의미한 값(예: ms32z8v7)이 되기 때문
      // 같은 탭의 부모 글 페이지가 알려준 제목이 최우선 — iframe 안에서
      // "이 탭을 연 탭"의 제목은 글 이전 페이지(목록 등)라 엉뚱하다
      // (yamoa 목록 탭에서 글을 열면 "yamoa 야모아"가 붙던 문제, v2.13.2).
      // 한 글에 한 영상이므로 아래 멀티파트용 ID 꼬리표도 붙이지 않는다.
      const fromParent = !!parentTitle;
      let name = parentTitle || openerTitle();
      if (!name) {
        try {
          name = decodeURIComponent(new URL(document.referrer).pathname)
            .replace(/\/+$/, "")
            .split("/")
            .pop()
            .replace(/\.(html?|php)$/i, "");
        } catch (e) {}
      }
      const embedId =
        (location.pathname.match(/(?:embed[-/]|\/e\/)([\w-]+)/i) || [])[1] || "";
      if (!name) name = embedId || "video";
      // 여러 파트를 iframe으로 돌려 보여주는 페이지(xxxbed 등)는 파트마다
      // 리퍼러가 같아서 이름이 겹침 → 임베드 ID를 붙여 구분
      if (inFrame && embedId && !fromParent) name += "_" + embedId;
      name = name.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 120);
      return { type: "hls", url, filename: name + ".ts" };
    } catch (e) {
      return null; // 플레이어가 아직 준비 안 됨
    }
  }

  // ── 네이티브 HLS: <video src="….m3u8"> 를 브라우저가 직접 재생하는 페이지 ──
  // (egguniverse.com = 잉글리시에그 프리뷰, Cloudflare Stream). jwplayer 가 없어서
  // 위 getHlsInfo 로는 못 잡는다. 재생 중인 m3u8 주소를 그대로 쓴다.
  // blob: 주소(MSE 플레이어)는 http 가 아니라서 자연히 제외된다.
  function getNativeHlsInfo() {
    const v = [...document.querySelectorAll("video")].find((el) =>
      /^https?:\/\/[^#]*\.m3u8(\?|$)/i.test(el.currentSrc || el.src || "")
    );
    if (!v) return null;
    const url = v.currentSrc || v.src;
    // 재생 중인 영상 제목: 플레이어 제목 요소 → h1 → 쓸 만한 <title> → og:title
    // (egguniverse 의 og:title 은 "프리뷰 플레이리스트" 고정이라 마지막 순위)
    const pt = document.querySelector('[class*="playerTitle"], [class*="player-title"]');
    const h1 = document.querySelector("h1");
    const og = document.querySelector('meta[property="og:title"]');
    const title =
      sanitize(pt && pt.textContent) ||
      sanitize(h1 && h1.textContent) ||
      usefulDocTitle() ||
      parentTitle ||
      trimSiteName(og && og.content) ||
      "video";
    return { type: "hls", url, filename: title + ".mp4" };
  }

  async function fetchText(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.text();
  }

  // #EXT-X-... 줄에서 속성값 꺼내기 (따옴표 유무 모두)
  function attr(line, name) {
    const m = line.match(new RegExp("(?:^|[:,])" + name + '=("([^"]*)"|[^,]*)'));
    return m ? (m[2] !== undefined ? m[2] : m[1]) : "";
  }

  // 마스터 플레이리스트면 BANDWIDTH가 가장 높은 화질을 골라 내려감.
  // 오디오가 별도 트랙(#EXT-X-MEDIA:TYPE=AUDIO)이면 그 주소도 함께 돌려준다
  // — 그 경우 영상 variant 에는 소리가 없다 (Cloudflare Stream 이 이런 구조).
  async function resolveMediaPlaylist(url) {
    const text = await fetchText(url);
    if (!/#EXT-X-STREAM-INF/.test(text)) return { url, text, audioUrl: null };
    const lines = text.split(/\r?\n/);
    let best = null;
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].startsWith("#EXT-X-STREAM-INF")) continue;
      const bw = parseInt(attr(lines[i], "BANDWIDTH") || "0", 10);
      const uri = lines.slice(i + 1).find((l) => l && !l.startsWith("#"));
      if (uri && (!best || bw > best.bw)) {
        best = { bw, uri, audio: attr(lines[i], "AUDIO") };
      }
    }
    if (!best) throw new Error("화질 목록 없음");
    let audioUrl = null;
    if (best.audio) {
      const media = lines.filter(
        (l) =>
          l.startsWith("#EXT-X-MEDIA:") &&
          attr(l, "TYPE") === "AUDIO" &&
          attr(l, "GROUP-ID") === best.audio &&
          attr(l, "URI")
      );
      const pick = media.find((l) => attr(l, "DEFAULT") === "YES") || media[0];
      if (pick) audioUrl = new URL(attr(pick, "URI"), url).href;
    }
    const mediaUrl = new URL(best.uri, url).href;
    return { url: mediaUrl, text: await fetchText(mediaUrl), audioUrl };
  }

  function parseMediaPlaylist(text, base) {
    if (/#EXT-X-KEY:(?!METHOD=NONE)/.test(text)) {
      throw new Error("암호화 스트림 미지원");
    }
    const initUri = (text.match(/#EXT-X-MAP:URI="([^"]+)"/) || [])[1];
    const segs = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => new URL(l, base).href);
    if (!segs.length) throw new Error("세그먼트 없음");
    return { init: initUri ? new URL(initUri, base).href : null, segs };
  }

  // ── fMP4 영상 + fMP4 오디오 → MP4 하나로 합치기 ─────────────────────
  // 각 init 은 트랙 1개짜리 moov, 각 세그먼트는 moof+mdat 쌍이다.
  // 오디오 트랙 ID 만 2로 바꾸고 두 trak 을 한 moov 에 넣은 뒤, moof+mdat 쌍은
  // **그대로** 번갈아 이어 붙인다. tfhd 가 default-base-is-moof 라 trun 의
  // 데이터 오프셋이 각 moof 기준이므로 쌍을 깨지 않는 한 위치 계산이 필요 없다.
  // (styp/sidx 는 원래 파일 기준 위치를 담고 있어 버린다)
  function mp4Boxes(b, s, e) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const out = [];
    while (s + 8 <= e) {
      let size = dv.getUint32(s);
      const type = String.fromCharCode(b[s + 4], b[s + 5], b[s + 6], b[s + 7]);
      let head = 8;
      if (size === 1) {
        size = Number(dv.getBigUint64(s + 8));
        head = 16;
      } else if (size === 0) size = e - s;
      if (size < head || s + size > e) break;
      out.push({ type, start: s, size, body: s + head, end: s + size });
      s += size;
    }
    return out;
  }
  const child = (b, box, type) =>
    mp4Boxes(b, box.body, box.end).find((x) => x.type === type);
  const copyBox = (b, box) => b.slice(box.start, box.end); // 복사본 (수정해도 안전)

  function mp4Box(type, parts) {
    const size = 8 + parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(size);
    new DataView(out.buffer).setUint32(0, size);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    let o = 8;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }

  function setU32(b, off, v) {
    new DataView(b.buffer, b.byteOffset, b.byteLength).setUint32(off, v);
  }

  // init 의 trak/trex 를 트랙 ID 를 바꿔 복사
  function retrack(b, id) {
    const moov = mp4Boxes(b, 0, b.length).find((x) => x.type === "moov");
    const trak = copyBox(b, child(b, moov, "trak"));
    const tk = mp4Boxes(trak, 8, trak.length).find((x) => x.type === "tkhd");
    // tkhd: version(1)+flags(3), 시각 2개(v1이면 8바이트씩), 그다음 track_ID
    setU32(trak, tk.body + 4 + (trak[tk.body] === 1 ? 16 : 8), id);
    const trex = copyBox(b, child(b, child(b, moov, "mvex"), "trex"));
    setU32(trex, 12, id); // trex: 헤더 8 + version/flags 4 → track_ID
    return { trak, trex, mvhd: copyBox(b, child(b, moov, "mvhd")) };
  }

  // 세그먼트에서 moof+mdat 쌍만 꺼내 트랙 ID 를 바꾼다
  function fragments(seg, id) {
    const out = [];
    for (const box of mp4Boxes(seg, 0, seg.length)) {
      if (box.type !== "moof" && box.type !== "mdat") continue;
      const bytes = seg.subarray(box.start, box.end);
      if (box.type === "moof") {
        for (const traf of mp4Boxes(bytes, 8, bytes.length)) {
          if (traf.type !== "traf") continue;
          const tfhd = child(bytes, traf, "tfhd");
          if (tfhd) setU32(bytes, tfhd.body + 4, id);
        }
      }
      out.push({ type: box.type, bytes });
    }
    return out;
  }

  function muxFmp4(vInit, vSegs, aInit, aSegs) {
    const v = retrack(vInit, 1);
    const a = retrack(aInit, 2);
    setU32(v.mvhd, v.mvhd.length - 4, 3); // mvhd 끝 4바이트 = next_track_ID
    const moov = mp4Box("moov", [v.mvhd, v.trak, a.trak, mp4Box("mvex", [v.trex, a.trex])]);
    const ftyp = copyBox(vInit, mp4Boxes(vInit, 0, vInit.length).find((x) => x.type === "ftyp"));
    const parts = [ftyp, moov];
    let seq = 1;
    const push = (frags) => {
      for (const f of frags) {
        if (f.type === "moof") {
          const mfhd = mp4Boxes(f.bytes, 8, f.bytes.length).find((x) => x.type === "mfhd");
          if (mfhd) setU32(f.bytes, mfhd.body + 4, seq++);
        }
        parts.push(f.bytes);
      }
    };
    // 둘 다 ~4초 단위라 번호 순으로 번갈아 넣으면 시간 순서가 맞는다
    const n = Math.max(vSegs.length, aSegs.length);
    for (let i = 0; i < n; i++) {
      if (vSegs[i]) push(fragments(vSegs[i], 1));
      if (aSegs[i]) push(fragments(aSegs[i], 2));
    }
    return new Blob(parts, { type: "video/mp4" });
  }

  async function fetchAll(urls, onEach) {
    const bufs = new Array(urls.length);
    const CHUNK = 4; // 서버 부담 없이 적당히 병렬로
    for (let i = 0; i < urls.length; i += CHUNK) {
      await Promise.all(
        urls.slice(i, i + CHUNK).map(async (url, j) => {
          const res = await fetch(url);
          if (!res.ok) throw new Error("HTTP " + res.status);
          bufs[i + j] = new Uint8Array(await res.arrayBuffer());
          onEach();
        })
      );
    }
    return bufs;
  }

  function saveBlob(blob, filename) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }

  // HLS 를 받아 한 파일로 저장. 반환값: 저장한 확장자 (".ts" / ".mp4")
  async function buildHls(info, onProgress) {
    const { url: mediaUrl, text, audioUrl } = await resolveMediaPlaylist(info.url);
    const video = parseMediaPlaylist(text, mediaUrl);
    const audio = audioUrl ? parseMediaPlaylist(await fetchText(audioUrl), audioUrl) : null;
    if (audio && !(video.init && audio.init)) {
      throw new Error("분리 오디오(TS) 미지원");
    }
    const total = video.segs.length + (audio ? audio.segs.length : 0);
    let done = 0;
    const tick = () => onProgress(++done, total);
    const vSegs = await fetchAll(video.segs, tick);
    const aSegs = audio ? await fetchAll(audio.segs, tick) : [];
    if (audio) {
      const [vInit, aInit] = await fetchAll([video.init, audio.init], () => {});
      return { blob: muxFmp4(vInit, vSegs, aInit, aSegs), ext: ".mp4" };
    }
    if (video.init) {
      // fMP4 단일 트랙(소리 포함): init 뒤에 이어 붙이면 그대로 mp4
      const [vInit] = await fetchAll([video.init], () => {});
      return { blob: new Blob([vInit, ...vSegs], { type: "video/mp4" }), ext: ".mp4" };
    }
    return { blob: new Blob(vSegs, { type: "video/mp2t" }), ext: ".ts" };
  }

  async function startHlsDownload(info, onProgress) {
    const { blob, ext } = await buildHls(info, onProgress);
    saveBlob(blob, info.filename.replace(/\.(ts|mp4)$/i, "") + ext);
    return ext;
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
      const fresh = getVideoInfo() || getDirectInfo() || getHlsInfo() || getNativeHlsInfo();
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
          .then((ext) => {
            btn.textContent =
              ext === ".ts" ? "✓ 저장됨 (.ts — VLC/팟플레이어로 재생)" : "✓ 저장됨";
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
    // iframe(임베드 플레이어) 안에서는 화면 = 플레이어라 하단은 컨트롤 바·자막
    // 자리 → 우상단에 둔다
    Object.assign(btn.style, {
      position: "fixed",
      right: inFrame ? "12px" : "20px",
      margin: "0"
    });
    if (inFrame) btn.style.top = "12px";
    else btn.style.bottom = "70px"; // 전체화면 플레이어의 하단 컨트롤 바를 가리지 않게
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
    askParentTitle(); // 부모가 늦게 준비될 수 있어 받을 때까지 매 주기 물어봄
    const info = getVideoInfo() || getDirectInfo() || getHlsInfo() || getNativeHlsInfo();
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
