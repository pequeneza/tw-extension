import { ModuleId, ModuleSettings, STORAGE_KEY } from "../types/modules";

export async function loadSettings(): Promise<ModuleSettings> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(STORAGE_KEY, (result) => {
      resolve((result[STORAGE_KEY] as ModuleSettings) ?? {});
    });
  });
}

export async function saveSettings(settings: ModuleSettings): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [STORAGE_KEY]: settings }, resolve);
  });
}

export async function isModuleEnabled(id: ModuleId): Promise<boolean> {
  const settings = await loadSettings();
  return settings[id] !== false; // enabled by default
}

export async function setModuleEnabled(
  id: ModuleId,
  enabled: boolean
): Promise<void> {
  const settings = await loadSettings();
  settings[id] = enabled;
  await saveSettings(settings);
}
