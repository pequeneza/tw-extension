(async () => {
  const DEFAULTS = {
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
      hasMarketExchange: qs.includes("screen=market") && qs.includes("mode=exchange"),
      hasInfoPlayer: qs.includes("screen=info_player"),
      hasIncomingsOverview:
        (qs.includes("screen=overview_villages") && qs.includes("mode=incomings")) ||
        (qs.includes("screen=overview_villages") && qs.includes("incomings"))
    };
  }

  function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get([STORAGE_KEY], (res) => {
        const s = res[STORAGE_KEY];
        if (!s) return resolve(structuredClone(DEFAULTS));
        resolve({
          ...DEFAULTS,
          ...s,
          enabled: { ...DEFAULTS.enabled, ...(s.enabled || {}) }
        });
      });
    });
  }

  async function injectModule(moduleFile) {
    const injectUrl = chrome.runtime.getURL("content/inject.js");
    const mod = await import(injectUrl);

    const srcUrl = chrome.runtime.getURL(`modules/${moduleFile}`);
    await mod.injectPageScript(srcUrl);
  }

  function shouldInject(moduleId, flags) {
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
        return flags.hasScreenSnob && !flags.hasModeCoin;
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

  const settings = await loadSettings();
  const flags = getUrlFlags();

  const modules = [
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