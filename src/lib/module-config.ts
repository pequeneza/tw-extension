import { ModuleId } from "../types/modules";
import { MODULE_CONFIG_SCHEMAS, FieldDef } from "../types/config-schemas";

export type ConfigValues = Record<string, number | string | boolean>;

/** Build a defaults object from a schema */
function getDefaults(id: ModuleId): ConfigValues {
  const schema = MODULE_CONFIG_SCHEMAS[id];
  if (!schema) return {};
  return Object.fromEntries(schema.fields.map((f: FieldDef) => [f.key, f.default]));
}

/** Load per-module config from chrome.storage.sync, merged with defaults */
export async function loadModuleConfig(id: ModuleId): Promise<ConfigValues> {
  const schema = MODULE_CONFIG_SCHEMAS[id];
  if (!schema) return {};
  const defaults = getDefaults(id);
  return new Promise((resolve) => {
    chrome.storage.sync.get(schema.storageKey, (result) => {
      const stored = (result[schema.storageKey] as ConfigValues) ?? {};
      resolve({ ...defaults, ...stored });
    });
  });
}

/** Save per-module config to chrome.storage.sync */
export async function saveModuleConfig(
  id: ModuleId,
  values: ConfigValues
): Promise<void> {
  const schema = MODULE_CONFIG_SCHEMAS[id];
  if (!schema) return;
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [schema.storageKey]: values }, resolve);
  });
}

/** Reset a module's config to defaults */
export async function resetModuleConfig(id: ModuleId): Promise<ConfigValues> {
  const defaults = getDefaults(id);
  await saveModuleConfig(id, defaults);
  return defaults;
}
