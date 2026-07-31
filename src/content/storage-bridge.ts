/**
 * xBot — Storage Bridge
 *
 * Isolated-world content script that mediates `chrome.storage.local` access
 * for MAIN-world userscripts via CustomEvent request/response pattern.
 *
 * MAIN-world scripts (which have zero access to chrome.* APIs) dispatch:
 *   xbot:storage:get    { key, requestId } → replies with xbot:storage:result { requestId, value }
 *   xbot:storage:set    { key, value, requestId } → replies with xbot:storage:result { requestId, ok: true }
 *   xbot:storage:remove { key, requestId } → replies with xbot:storage:result { requestId, ok: true }
 */

export function initStorageBridge(): void {
  document.addEventListener("xbot:storage:get", (e: any) => {
    const { key, requestId } = e.detail ?? {};
    if (!requestId) return;

    chrome.storage.local.get(key, (result) => {
      document.dispatchEvent(
        new CustomEvent("xbot:storage:result", {
          detail: { requestId, value: result[key] },
        })
      );
    });
  });

  document.addEventListener("xbot:storage:set", (e: any) => {
    const { key, value, requestId } = e.detail ?? {};
    if (!requestId) return;

    chrome.storage.local.set({ [key]: value }, () => {
      document.dispatchEvent(
        new CustomEvent("xbot:storage:result", {
          detail: { requestId, ok: true },
        })
      );
    });
  });

  document.addEventListener("xbot:storage:remove", (e: any) => {
    const { key, requestId } = e.detail ?? {};
    if (!requestId) return;

    chrome.storage.local.remove(key, () => {
      document.dispatchEvent(
        new CustomEvent("xbot:storage:result", {
          detail: { requestId, ok: true },
        })
      );
    });
  });
}
