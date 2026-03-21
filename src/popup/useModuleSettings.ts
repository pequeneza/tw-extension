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
      const current = settings[id] !== false;
      const next = !current;
      setSettings((prev) => ({ ...prev, [id]: next }));
      await setModuleEnabled(id, next);
    },
    [settings]
  );

  const isEnabled = useCallback(
    (id: ModuleId) => settings[id] !== false,
    [settings]
  );

  return { settings, loading, toggle, isEnabled };
}
