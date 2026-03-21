import { useEffect, useState } from "react";
import { MODULE_CONFIGS, ModuleId } from "../types/modules";

/** Returns the set of ModuleIds whose matchPattern fires on the active TW tab URL. */
export function useActiveTabModules() {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_ACTIVE_TAB_URL" }, (response) => {
      if (chrome.runtime.lastError) return; // popup opened without a TW tab
      if (response?.type === "ACTIVE_TAB_URL") setUrl(response.url ?? null);
    });
  }, []);

  const activeIds = new Set<ModuleId>();
  if (url) {
    for (const mod of MODULE_CONFIGS) {
      if (mod.matchPattern.test(url)) activeIds.add(mod.id);
    }
  }

  return { url, activeIds };
}
