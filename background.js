// 확장 on/off 스위치. 툴바 버튼(popup.html)이 chrome.storage.local의 enabled를
// 바꾸면 여기서 실제 차단 기능을 켜고 끈다.
//
// 왜 콘텐트 스크립트를 매니페스트에 정적으로 두지 않고 여기서 등록하는가:
// popup-guard.js / downloader.js 는 페이지의 window(MAIN world)에서 돌아야 해서
// chrome.storage 를 읽을 수 없다. 즉 "일단 실행된 뒤 플래그를 보고 중단하는"
// 방식이 불가능하므로, 꺼짐 상태에서는 아예 등록을 해제한다.
const RULESET_ID = "ad-domains";

const CONTENT_SCRIPTS = [
  {
    id: "popup-guard",
    matches: ["<all_urls>"],
    js: ["popup-guard.js"],
    runAt: "document_start",
    world: "MAIN",
    allFrames: true,
    persistAcrossSessions: true
  },
  {
    id: "downloader",
    matches: ["<all_urls>"],
    js: ["downloader.js"],
    runAt: "document_idle",
    world: "MAIN",
    allFrames: true,
    persistAcrossSessions: true
  },
  {
    id: "cleaner",
    matches: ["<all_urls>"],
    js: ["cleaner.js"],
    css: ["hide.css"],
    runAt: "document_end",
    persistAcrossSessions: true
  },
  {
    // EBS 전용. isolated world라서 chrome.runtime으로 백그라운드에 요청 가능
    // (영상 CDN이 CORS를 막아 페이지에서 직접 받을 수 없기 때문)
    id: "ebs-downloader",
    matches: ["*://*.ebs.co.kr/*"],
    js: ["ebs-downloader.js"],
    runAt: "document_idle",
    // 프로그램 상세 페이지에서 "바로보기"를 누르면 플레이어가 같은 탭의
    // iframe(/vodCommon/show)으로 뜬다 → iframe 안까지 주입해야 버튼이 보임
    allFrames: true,
    persistAcrossSessions: true
  }
];

// ebs-downloader가 넘긴 주소를 브라우저 다운로드로 처리 (CORS 무관)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "mj-download") return;
  // 확장 자신의 콘텐트 스크립트가 보낸 것만 받음
  if (!sender || sender.id !== chrome.runtime.id) return;
  chrome.downloads.download(
    { url: msg.url, filename: msg.filename, saveAs: false },
    (id) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ ok: true, id });
      }
    }
  );
  return true; // 비동기 응답
});

async function readEnabled() {
  const { enabled } = await chrome.storage.local.get({ enabled: true });
  return enabled !== false; // 값이 없으면 켜짐이 기본
}

async function syncRuleset(enabled) {
  try {
    await chrome.declarativeNetRequest.updateEnabledRulesets(
      enabled
        ? { enableRulesetIds: [RULESET_ID] }
        : { disableRulesetIds: [RULESET_ID] }
    );
  } catch (e) {
    console.warn("[MJ AdBlock] 네트워크 규칙 전환 실패:", e);
  }
}

async function syncScripts(enabled) {
  try {
    const registered = await chrome.scripting.getRegisteredContentScripts();
    const ids = registered.map((s) => s.id);
    if (enabled) {
      // 이미 등록된 건 건드리지 않음 (중복 id는 등록 에러가 남)
      const missing = CONTENT_SCRIPTS.filter((s) => !ids.includes(s.id));
      if (missing.length) await chrome.scripting.registerContentScripts(missing);
    } else if (ids.length) {
      await chrome.scripting.unregisterContentScripts({ ids });
    }
  } catch (e) {
    console.warn("[MJ AdBlock] 콘텐트 스크립트 등록 전환 실패:", e);
  }
}

function syncButton(enabled) {
  const suffix = enabled ? "" : "-off";
  chrome.action.setIcon({
    path: {
      16: `icons/icon16${suffix}.png`,
      32: `icons/icon32${suffix}.png`,
      48: `icons/icon48${suffix}.png`,
      128: `icons/icon128${suffix}.png`
    }
  });
  chrome.action.setBadgeText({ text: enabled ? "" : "OFF" });
  chrome.action.setBadgeBackgroundColor({ color: "#616161" });
  chrome.action.setTitle({
    title: enabled ? "MJ AdBlock — 켜짐 (광고 차단 중)" : "MJ AdBlock — 꺼짐"
  });
}

// onInstalled·onStartup·최초 실행이 겹칠 수 있어 순차 처리한다.
// (동시에 등록하면 같은 id를 두 번 등록해 에러가 남)
let queue = Promise.resolve();

// 큐 안에서 도는 실제 작업 (여기서 다시 큐에 넣으면 교착이 생기므로 주의)
async function applyStateNow(enabled) {
  await Promise.all([syncRuleset(enabled), syncScripts(enabled)]);
  syncButton(enabled);
}

function applyState(enabled) {
  const run = () => applyStateNow(enabled);
  queue = queue.then(run, run);
  return queue;
}

async function sync() {
  return applyState(await readEnabled());
}

// 설치·업데이트(개발자 모드 새로고침 포함) 때는 등록을 싹 지우고 다시 만든다.
// 동적 등록은 브라우저에 저장돼 있어서, CONTENT_SCRIPTS 정의(allFrames 등)를
// 고쳐도 같은 id가 이미 등록돼 있으면 syncScripts가 건너뛰어 옛 설정이 남는다.
async function resetAndSyncNow() {
  try {
    const registered = await chrome.scripting.getRegisteredContentScripts();
    const ids = registered.map((s) => s.id);
    if (ids.length) await chrome.scripting.unregisterContentScripts({ ids });
  } catch (e) {
    console.warn("[MJ AdBlock] 기존 등록 해제 실패:", e);
  }
  await applyStateNow(await readEnabled());
}

chrome.runtime.onInstalled.addListener(() => {
  queue = queue.then(resetAndSyncNow, resetAndSyncNow);
});
chrome.runtime.onStartup.addListener(sync);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.enabled) {
    applyState(changes.enabled.newValue !== false);
  }
});

// 서비스 워커가 깨어날 때마다 상태를 맞춰줌 (등록이 유실된 경우 자가 복구)
sync();
