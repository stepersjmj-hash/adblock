// 툴바 버튼 팝업: 상태 표시 + on/off 토글.
// 실제 켜고 끄는 일은 background.js가 storage 변경을 보고 처리한다.
const toggle = document.getElementById("toggle");
const stateEl = document.getElementById("state");
const hintEl = document.getElementById("hint");

const DEFAULT_HINT = "광고 차단·팝업 차단·다운로드 버튼을 한 번에 켜고 끕니다.";

function render(enabled) {
  document.body.dataset.on = enabled ? "1" : "0";
  toggle.setAttribute("aria-checked", enabled ? "true" : "false");
  stateEl.textContent = enabled ? "켜짐 — 광고 차단 중" : "꺼짐 — 차단 안 함";
}

async function readEnabled() {
  const { enabled } = await chrome.storage.local.get({ enabled: true });
  return enabled !== false;
}

(async () => {
  render(await readEnabled());
})();

toggle.addEventListener("click", async () => {
  const next = !(await readEnabled());
  await chrome.storage.local.set({ enabled: next });
  render(next);

  // 콘텐트 스크립트는 페이지가 다시 로드될 때 적용되므로 현재 탭을 새로고침해준다.
  // (네트워크 차단 규칙은 새로고침 없이도 바로 반영됨)
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id != null && /^https?:/i.test(tab.url || "")) {
    hintEl.textContent = "현재 탭을 새로고침했습니다. 다른 탭은 F5를 눌러 주세요.";
    chrome.tabs.reload(tab.id);
  } else {
    hintEl.textContent = "열려 있는 탭은 새로고침(F5) 후 적용됩니다.";
  }
});

toggle.addEventListener("keydown", (e) => {
  // 스페이스/엔터로도 토글되게 (role=switch 기본 동작 보강)
  if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    toggle.click();
  }
});

// 다른 창에서 상태가 바뀐 경우 팝업 표시도 따라가게
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.enabled) {
    render(changes.enabled.newValue !== false);
    hintEl.textContent = DEFAULT_HINT;
  }
});
