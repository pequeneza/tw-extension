import React, { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "tw_suite_settings_v1" as const;

type ModuleId =
  | "renamer_bito_merged"
  | "mass_label_delay"
  | "cmdsender"
  | "fakes"
  | "wh_balancer"
  | "resource_buyer"
  | "auto_mint"
  | "noble_sender_trainer"
  | "extended_profile"
  | "tw_snipe_scheduler";

type ModuleMeta = { id: ModuleId; name: string; desc: string };

const MODULES: ModuleMeta[] = [
  {
    id: "renamer_bito_merged",
    name: "Renamer (BITO merged)",
    desc: "Rename buttons + color painting for incomings/overview (BITO v3 logic, more robust selectors)."
  },
  {
    id: "mass_label_delay",
    name: "Mass Label w/ Delay",
    desc: "Select all incomings + apply label after 120s+random."
  },
  { id: "cmdsender", name: "Mão de Deus (CommandSender)", desc: "Scheduled confirm click with offset." },
  { id: "fakes", name: "Fakes Sender", desc: "Smart fake sender with caps + UI." },
  { id: "wh_balancer", name: "WH Balancer + Instant Trade", desc: "Warehouse balancer dialog + optional instant trade plan." },
  { id: "resource_buyer", name: "Resource Buyer", desc: "Manual start premium exchange buyer (storage target)." },
  { id: "auto_mint", name: "Auto Mint Coins", desc: "Auto fill max + mint + refresh/cooldown UI." },
  { id: "noble_sender_trainer", name: "Noble Resource Sender + Trainer", desc: "Send resources for nobles (patched to localStorage)." },
  { id: "extended_profile", name: "Extended Player Profile", desc: "Adds history/tribe changes/ennoblements stats." },
  { id: "tw_snipe_scheduler", name: "Sniper Scheduler", desc: "Assists on snipping NT" }
];

type Settings = {
  enabled: Record<ModuleId, boolean>;
};

function makeDefaultSettings(): Settings {
  const enabled = {} as Record<ModuleId, boolean>;
  for (const m of MODULES) enabled[m.id] = false;
  return { enabled };
}

function mergeDefaults(s: Partial<Settings> | undefined): Settings {
  const def = makeDefaultSettings();
  return {
    enabled: { ...def.enabled, ...(s?.enabled || {}) }
  };
}

function getSettings(): Promise<Settings> {
  return new Promise((resolve) => {
    chrome.storage.sync.get([STORAGE_KEY], (res) => {
      resolve(mergeDefaults(res[STORAGE_KEY] as Partial<Settings> | undefined));
    });
  });
}

function setSettings(settings: Settings): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [STORAGE_KEY]: settings }, () => resolve(true));
  });
}

async function reloadActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) chrome.tabs.reload(tab.id);
}

export function App() {
  const [settings, setLocalSettings] = useState<Settings>(() => makeDefaultSettings());
  const [loading, setLoading] = useState(true);

  const enabledCount = useMemo(() => Object.values(settings.enabled).filter(Boolean).length, [settings]);

  useEffect(() => {
    (async () => {
      const s = await getSettings();
      setLocalSettings(s);
      setLoading(false);
    })();
  }, []);

  async function toggleOne(id: ModuleId, value: boolean) {
    const next: Settings = { enabled: { ...settings.enabled, [id]: value } };
    setLocalSettings(next);
    await setSettings(next);

    // Keep original behavior: apply on reload, then close popup.
    await reloadActiveTab();
    window.close();
  }

  async function enableAll(value: boolean) {
    const nextEnabled = { ...settings.enabled };
    for (const m of MODULES) nextEnabled[m.id] = value;
    const next: Settings = { enabled: nextEnabled };

    setLocalSettings(next);
    await setSettings(next);
    await reloadActiveTab();
    window.close();
  }

  async function justReload() {
    await reloadActiveTab();
    window.close();
  }

  return (
    <div>
      <header>
        <div className="title">xBot 1.0</div>
        <div className="badge" id="enabledBadge">
          {loading ? "…" : `${enabledCount} enabled`}
        </div>
      </header>

      <div className="actions">
        <button onClick={() => enableAll(true)} disabled={loading}>
          Enable all
        </button>
        <button onClick={() => enableAll(false)} disabled={loading}>
          Disable all
        </button>
        <button onClick={justReload}>Reload tab</button>
      </div>

      <div className="list">
        {MODULES.map((mod) => (
          <div className="item" key={mod.id}>
            <div className="meta">
              <div className="name">{mod.name}</div>
              <div className="desc">{mod.desc}</div>
            </div>

            <label className="switch">
              <input
                type="checkbox"
                checked={!!settings.enabled[mod.id]}
                disabled={loading}
                onChange={(e) => toggleOne(mod.id, e.target.checked)}
              />
            </label>
          </div>
        ))}
      </div>

      <footer>
        <div className="hint">Toggles apply on reload (simple &amp; robust).</div>
      </footer>
    </div>
  );
}