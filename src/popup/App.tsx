import React, { useEffect, useState } from "react";
import { STORAGE_KEY, ModuleSettings, MODULE_CONFIGS, LICENSE_STORAGE_KEY, LICENSE_CACHE_KEY } from "../types/modules";

const BOT_ENABLED_KEY = "xbot_enabled";

function readStorage(): Promise<{ enabled: boolean; settings: ModuleSettings; licenseKey: string }> {
  return new Promise((res) =>
    chrome.storage.sync.get([BOT_ENABLED_KEY, STORAGE_KEY, LICENSE_STORAGE_KEY], (r) => {
      res({
        enabled:    (r[BOT_ENABLED_KEY]     as boolean)       === true,
        settings:   (r[STORAGE_KEY]         as ModuleSettings) ?? {},
        licenseKey: (r[LICENSE_STORAGE_KEY] as string)        ?? "",
      });
    })
  );
}

function writeEnabled(val: boolean): Promise<void> {
  return new Promise((res) => chrome.storage.sync.set({ [BOT_ENABLED_KEY]: val }, res));
}

function writeSettings(s: ModuleSettings): Promise<void> {
  return new Promise((res) => chrome.storage.sync.set({ [STORAGE_KEY]: s }, res));
}

function writeLicenseKey(key: string): Promise<void> {
  return new Promise((res) =>
    chrome.storage.sync.set({ [LICENSE_STORAGE_KEY]: key }, () =>
      // Bust the cache so the new key is validated immediately
      chrome.storage.local.remove(LICENSE_CACHE_KEY, res)
    )
  );
}

export function App() {
  const [enabled,    setEnabled]    = useState<boolean | null>(null);
  const [settings,   setSettings]   = useState<ModuleSettings>({});
  const [licenseKey, setLicenseKey] = useState("");
  const [licenseInput, setLicenseInput] = useState("");
  const [licenseStatus, setLicenseStatus] = useState<"idle" | "saving">("idle");
  const [licenseVisible, setLicenseVisible] = useState(false);

  useEffect(() => {
    readStorage().then(({ enabled, settings, licenseKey }) => {
      setEnabled(enabled);
      setSettings(settings);
      setLicenseKey(licenseKey);
      setLicenseInput(licenseKey);
    });
  }, []);

  async function toggle() {
    if (enabled === null) return;
    const next = !enabled;

    if (!next) {
      await chrome.storage.sync.set({ xbot_snapshot: settings });
      const allOff: ModuleSettings = {};
      for (const mod of MODULE_CONFIGS) allOff[mod.id] = false;
      await writeSettings(allOff);
      setSettings(allOff);
    } else {
      const snap = await new Promise<ModuleSettings>((res) =>
        chrome.storage.sync.get("xbot_snapshot", (r) =>
          res((r["xbot_snapshot"] as ModuleSettings) ?? {})
        )
      );
      await writeSettings(snap);
      setSettings(snap);
    }

    await writeEnabled(next);
    setEnabled(next);
  }

  async function saveLicense() {
    const trimmed = licenseInput.trim();
    setLicenseStatus("saving");
    await writeLicenseKey(trimmed);
    setLicenseKey(trimmed);
    setLicenseStatus("idle");
  }

  const isLoading    = enabled === null;
  const isOn         = enabled === true;
  const hasLicense   = licenseKey.length > 0;
  const activeCount  = MODULE_CONFIGS.filter((m) => settings[m.id] === true).length;
  const licenseChanged = licenseInput.trim() !== licenseKey;

  return (
    <>
      <style>{CSS}</style>
      <div className="shell">
        <div className="header">
          <span className="logo">⚡</span>
          <span className="name">xBot</span>
        </div>

        <div className="body">
          <button
            className={`big-toggle${isOn ? " on" : ""}${isLoading ? " loading" : ""}${!hasLicense ? " disabled" : ""}`}
            onClick={toggle}
            disabled={isLoading || !hasLicense}
            title={!hasLicense ? "Enter a license key to activate" : undefined}
          >
            <span className="toggle-ring">
              <span className="toggle-dot" />
            </span>
          </button>

          <div className={`status-label${isOn ? " active" : ""}`}>
            {isLoading ? "Loading…" : isOn ? "Active" : "Inactive"}
          </div>

          <div className="status-hint">
            {isLoading
              ? ""
              : !hasLicense
              ? "License required"
              : isOn
              ? `${activeCount} module${activeCount !== 1 ? "s" : ""} enabled`
              : "All modules paused"}
          </div>
        </div>

        <div className="license-section">
          <label className="license-label">License key</label>
          <div className="license-row">
            <input
              className="license-input"
              type={licenseVisible ? "text" : "password"}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              value={licenseInput}
              onChange={(e) => setLicenseInput(e.target.value)}
              spellCheck={false}
            />
            <button
              type="button"
              className="license-eye"
              aria-label="Hold to reveal license key"
              title="Hold to reveal"
              onMouseDown={() => setLicenseVisible(true)}
              onMouseUp={() => setLicenseVisible(false)}
              onMouseLeave={() => setLicenseVisible(false)}
              onTouchStart={() => setLicenseVisible(true)}
              onTouchEnd={() => setLicenseVisible(false)}
            >
              {licenseVisible ? "🙈" : "👁"}
            </button>
            {licenseChanged && (
              <button
                className="license-save"
                onClick={saveLicense}
                disabled={licenseStatus === "saving"}
              >
                {licenseStatus === "saving" ? "…" : "Save"}
              </button>
            )}
          </div>
          {hasLicense && !licenseChanged && (
            <div className="license-ok">Key saved</div>
          )}
        </div>

        <div className="footer">
          Manage modules via ⚡ in-game
        </div>
      </div>
    </>
  );
}

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    width: 200px;
    font-family: 'DM Sans', -apple-system, sans-serif;
    font-size: 13px;
    background: #fff;
    color: #111827;
    -webkit-font-smoothing: antialiased;
  }

  .shell { display: flex; flex-direction: column; width: 200px; }

  .header {
    display: flex; align-items: center; gap: 7px;
    padding: 12px 14px 10px;
    border-bottom: 1px solid #f3f4f6;
  }
  .logo { font-size: 16px; line-height: 1; }
  .name { font-size: 14px; font-weight: 600; color: #111827; letter-spacing: -0.01em; }

  .body {
    display: flex; flex-direction: column; align-items: center;
    padding: 24px 16px 20px; gap: 12px;
  }

  .big-toggle {
    width: 64px; height: 64px; border-radius: 50%;
    border: 2px solid #e5e7eb; background: #f9fafb;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: all 0.2s ease; outline: none;
  }
  .big-toggle:hover:not(:disabled) { border-color: #d1d5db; transform: scale(1.04); }
  .big-toggle:active:not(:disabled) { transform: scale(0.97); }
  .big-toggle:disabled { opacity: 0.5; cursor: default; }
  .big-toggle.on {
    border-color: #22c55e; background: #f0fdf4;
    box-shadow: 0 0 0 4px rgba(34,197,94,0.12);
  }
  .big-toggle.on:hover:not(:disabled) {
    border-color: #16a34a; background: #dcfce7;
  }

  .toggle-ring {
    width: 36px; height: 36px; border-radius: 50%;
    border: 2.5px solid #d1d5db;
    display: flex; align-items: center; justify-content: center;
    transition: border-color 0.2s ease;
  }
  .big-toggle.on .toggle-ring { border-color: #16a34a; }

  .toggle-dot {
    width: 14px; height: 14px; border-radius: 50%;
    background: #d1d5db; transition: background 0.2s ease, transform 0.2s ease;
  }
  .big-toggle.on .toggle-dot { background: #16a34a; transform: scale(1.1); }

  .big-toggle.loading .toggle-ring { animation: pulse 1.2s ease-in-out infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }

  .status-label {
    font-size: 15px; font-weight: 600; color: #374151;
    transition: color 0.2s ease;
  }
  .status-label.active { color: #15803d; }

  .status-hint { font-size: 11px; color: #9ca3af; text-align: center; min-height: 16px; }

  .license-section {
    padding: 0 14px 12px;
    border-top: 1px solid #f3f4f6;
    padding-top: 10px;
    display: flex; flex-direction: column; gap: 5px;
  }

  .license-label {
    font-size: 10px; font-weight: 600; color: #6b7280;
    text-transform: uppercase; letter-spacing: 0.05em;
  }

  .license-row { display: flex; gap: 4px; }

  .license-input {
    flex: 1; min-width: 0;
    padding: 4px 6px;
    font-size: 10.5px; font-family: monospace;
    border: 1px solid #e5e7eb; border-radius: 5px;
    color: #111827; background: #f9fafb;
    outline: none;
  }
  .license-input:focus { border-color: #6b7280; background: #fff; }

  .license-save {
    padding: 4px 8px;
    font-size: 10.5px; font-weight: 600;
    background: #111827; color: #fff;
    border: none; border-radius: 5px; cursor: pointer;
  }
  .license-save:disabled { opacity: 0.5; }

  .license-eye {
    flex-shrink: 0;
    width: 24px;
    padding: 4px 0;
    font-size: 11px;
    background: #f9fafb;
    border: 1px solid #e5e7eb; border-radius: 5px;
    cursor: pointer;
    user-select: none;
  }
  .license-eye:hover { background: #f3f4f6; }
  .license-eye:active { background: #e5e7eb; }

  .license-ok { font-size: 10px; color: #16a34a; }

  .footer {
    padding: 8px 14px 10px; border-top: 1px solid #f3f4f6;
    font-size: 10.5px; color: #9ca3af; text-align: center;
  }
`;
