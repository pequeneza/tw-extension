import { injectPageScript } from "./inject";

type ModuleId =
  | "cmdsender"
  | "mass_label_delay"
  | "renamer_bito_merged"
  | "wh_balancer"
  | "resource_buyer"
  | "extended_profile"
  | "auto_mint"
  | "fakes"
  | "noble_sender_trainer"
  | "tw_snipe_scheduler";

type Settings = {
  enabled: Record<ModuleId, boolean>;
};

const DEFAULTS: Settings = {
  enabled: {
    cmdsender: false,
    mass_label_delay: false,
    renamer_bito_merged: false,
    wh_balancer: false,
    resource_buyer: false,
    extended_profile: false,
    auto_mint: false,
    fakes: false,
    noble_sender_trainer: false,
    tw_snipe_scheduler: false
  }
};

const STORAGE_KEY = "tw_suite_settings_v1";

function getUrlFlags() {
  const href = location.href;
  const qs = location.search || "";

  return {
    isGamePhp: href.includes("game.php"),
    hasScreenPlace: qs.includes("screen=place"),
    hasTryConfirm: qs.includes("try=confirm"),
    hasScreenSnob: qs.includes("screen=snob"),
    hasModeCoin: qs.includes("mode=coin"),
    hasScreenOverview: new URLSearchParams(qs).get("screen") === "overview",
    hasMarketExchange: qs.includes("screen=market") && qs.includes("mode=exchange"),
    hasInfoPlayer: qs.includes("screen=info_player"),
    hasIncomingsOverview:
      (qs.includes("screen=overview_villages") && qs.includes("mode=incomings")) ||
      (qs.includes("screen=overview_villages") && qs.includes("incomings"))
  };
}

function loadSettings(): Promise<Settings> {
  return new Promise((resolve) => {
    chrome.storage.sync.get([STORAGE_KEY], (res) => {
      const s = res[STORAGE_KEY] as Partial<Settings> | undefined;

      if (!s) return resolve(structuredClone(DEFAULTS));

      resolve({
        ...DEFAULTS,
        ...s,
        enabled: { ...DEFAULTS.enabled, ...(s.enabled || {}) }
      });
    });
  });
}

function shouldInject(moduleId: ModuleId, flags: ReturnType<typeof getUrlFlags>) {
  switch (moduleId) {
    case "cmdsender":
      return flags.hasScreenPlace && flags.hasTryConfirm;
    case "fakes":
      return flags.hasScreenPlace;
    case "mass_label_delay":
      return flags.hasIncomingsOverview;
    case "renamer_bito_merged":
      return flags.hasIncomingsOverview || (flags.isGamePhp && location.search.includes("screen=overview"));
    case "wh_balancer":
      return flags.isGamePhp;
    case "resource_buyer":
      return flags.hasMarketExchange;
    case "extended_profile":
      return flags.hasInfoPlayer;
    case "auto_mint":
      return flags.hasScreenSnob && !flags.hasModeCoin;
    case "noble_sender_trainer":
      return (flags.hasScreenSnob && !flags.hasModeCoin) || flags.hasScreenOverview;
    case "tw_snipe_scheduler":
      return (
        (flags.isGamePhp && location.search.includes("screen=overview")) ||
        flags.hasIncomingsOverview ||
        flags.hasScreenPlace
      );
    default:
      return false;
  }
}

async function injectModule(moduleFile: string) {
  const srcUrl = chrome.runtime.getURL(`modules/${moduleFile}`);
  await injectPageScript(srcUrl);
}

async function ensureOverlayLoaded() {
  const overlayUrl = chrome.runtime.getURL("content/overlay.js");
  await import(/* @vite-ignore */ overlayUrl);
}

(async () => {
  const flags = getUrlFlags();

  if (flags.isGamePhp) {
    try {
      await ensureOverlayLoaded();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[TW Suite] Failed to load overlay:", e);
    }
  }

  const settings = await loadSettings();

  const modules: Array<{ id: ModuleId; file: string }> = [
    { id: "cmdsender", file: "mano_de_deus.user.js" },
    { id: "mass_label_delay", file: "mass_label_delay.user.js" },
    { id: "renamer_bito_merged", file: "renamer_bito_merged.user.js" },
    { id: "wh_balancer", file: "wh_balancer.user.js" },
    { id: "resource_buyer", file: "resource_buyer.user.js" },
    { id: "extended_profile", file: "extended_profile.user.js" },
    { id: "auto_mint", file: "auto_mint.user.js" },
    { id: "fakes", file: "fakes.user.js" },
    { id: "noble_sender_trainer", file: "noble_sender_trainer.user.js" },
    { id: "tw_snipe_scheduler", file: "tw_snipe_scheduler.user.js" }
  ];

  for (const m of modules) {
    if (!settings.enabled[m.id]) continue;
    if (!shouldInject(m.id, flags)) continue;

    try {
      await injectModule(m.file);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[TW Suite] Failed to inject module:", m.id, e);
    }
  }
})();