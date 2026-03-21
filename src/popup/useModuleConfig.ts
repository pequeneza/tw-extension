import { useCallback, useEffect, useState } from "react";
import { ModuleId } from "../types/modules";
import {
  ConfigValues,
  loadModuleConfig,
  saveModuleConfig,
  resetModuleConfig,
} from "../lib/module-config";

export function useModuleConfig(id: ModuleId) {
  const [values, setValues] = useState<ConfigValues>({});
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLoading(true);
    loadModuleConfig(id).then((v) => {
      setValues(v);
      setLoading(false);
      setDirty(false);
    });
  }, [id]);

  const set = useCallback((key: string, value: number | string | boolean) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    setSaved(false);
  }, []);

  const save = useCallback(async () => {
    await saveModuleConfig(id, values);
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [id, values]);

  const reset = useCallback(async () => {
    const defaults = await resetModuleConfig(id);
    setValues(defaults);
    setDirty(false);
    setSaved(false);
  }, [id]);

  return { values, loading, dirty, saved, set, save, reset };
}
