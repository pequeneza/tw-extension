import { useCallback, useEffect, useState } from "react";
import { loadSettings, setModuleEnabled } from "../lib/storage";
import { ModuleId, ModuleSettings } from "../types/modules";

export function useModuleSettings() {
  const [settings, setSettings] = useState<ModuleSettings>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s);
      setLoading(false);
    });
  }, []);

  const toggle = useCallback(
    async (id: ModuleId) => {
      // Strict opt-in: only === true counts as enabled
      const next = settings[id] !== true;
      setSettings((prev) => ({ ...prev, [id]: next }));
      await setModuleEnabled(id, next);
    },
    [settings]
  );

  // Strict: missing key or false = disabled
  const isEnabled = useCallback(
    (id: ModuleId) => settings[id] === true,
    [settings]
  );

  return { settings, loading, toggle, isEnabled };
}
