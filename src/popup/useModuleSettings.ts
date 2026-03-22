import { useCallback, useEffect, useRef, useState } from "react";
import { STORAGE_KEY, ModuleId, ModuleSettings } from "../types/modules";

// Direct storage helpers — avoid the read-modify-write race in lib/storage
function storageGet(): Promise<ModuleSettings> {
  return new Promise((res) =>
    chrome.storage.sync.get([STORAGE_KEY], (r) =>
      res((r[STORAGE_KEY] as ModuleSettings) ?? {})
    )
  );
}
function storageSet(s: ModuleSettings): Promise<void> {
  return new Promise((res) => chrome.storage.sync.set({ [STORAGE_KEY]: s }, res));
}

export function useModuleSettings() {
  const [settings, setSettings] = useState<ModuleSettings>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    storageGet().then((s) => {
      setSettings(s);
      setLoading(false);
    });
  }, []);

  // Ref mirrors state so toggle always writes the latest object,
  // even if called multiple times before React re-renders
  const sRef = useRef(settings);
  useEffect(() => { sRef.current = settings; }, [settings]);

  const toggle = useCallback(async (id: ModuleId) => {
    const next = sRef.current[id] !== true;
    const updated = { ...sRef.current, [id]: next };
    sRef.current = updated;       // immediate — safe for back-to-back clicks
    setSettings(updated);
    await storageSet(updated);    // write the whole object — no race
  }, []);

  const isEnabled = useCallback(
    (id: ModuleId) => settings[id] === true,
    [settings]
  );

  return { settings, loading, toggle, isEnabled };
}
