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
  }
];

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

function applyState(enabled) {
  const run = async () => {
    await Promise.all([syncRuleset(enabled), syncScripts(enabled)]);
    syncButton(enabled);
  };
  queue = queue.then(run, run);
  return queue;
}

async function sync() {
  return applyState(await readEnabled());
}

chrome.runtime.onInstalled.addListener(sync);
chrome.runtime.onStartup.addListener(sync);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.enabled) {
    applyState(changes.enabled.newValue !== false);
  }
});

// 서비스 워커가 깨어날 때마다 상태를 맞춰줌 (등록이 유실된 경우 자가 복구)
sync();
