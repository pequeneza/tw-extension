const STORAGE_KEY = "tw_suite_settings_v1";

const MODULES = [
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

function mergeDefaults(s) {
  const enabled = {};
  for (const m of MODULES) enabled[m.id] = false;

  return {
    enabled: { ...enabled, ...(s?.enabled || {}) }
  };
}

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get([STORAGE_KEY], (res) => {
      resolve(mergeDefaults(res[STORAGE_KEY]));
    });
  });
}

function setSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [STORAGE_KEY]: settings }, () => resolve(true));
  });
}

async function reloadActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) chrome.tabs.reload(tab.id);
}

function updateBadge(settings) {
  const n = Object.values(settings.enabled).filter(Boolean).length;
  document.getElementById("enabledBadge").textContent = `${n} enabled`;
}

function renderList(settings) {
  const list = document.getElementById("list");
  list.innerHTML = "";

  for (const mod of MODULES) {
    const row = document.createElement("div");
    row.className = "item";

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `<div class="name">${mod.name}</div><div class="desc">${mod.desc}</div>`;

    const sw = document.createElement("label");
    sw.className = "switch";
    sw.innerHTML = `<input type="checkbox" ${settings.enabled[mod.id] ? "checked" : ""} />`;

    sw.querySelector("input").addEventListener("change", async (e) => {
      settings.enabled[mod.id] = !!e.target.checked;
      await setSettings(settings);
      updateBadge(settings);
      // simple+robust: reload tab to apply
      await reloadActiveTab();
      window.close();
    });

    row.appendChild(meta);
    row.appendChild(sw);
    list.appendChild(row);
  }
}

(async function init() {
  const settings = await getSettings();

  updateBadge(settings);
  renderList(settings);

  document.getElementById("enableAll").addEventListener("click", async () => {
    for (const m of MODULES) settings.enabled[m.id] = true;
    await setSettings(settings);
    await reloadActiveTab();
    window.close();
  });

  document.getElementById("disableAll").addEventListener("click", async () => {
    for (const m of MODULES) settings.enabled[m.id] = false;
    await setSettings(settings);
    await reloadActiveTab();
    window.close();
  });

  document.getElementById("reloadTab").addEventListener("click", async () => {
    await reloadActiveTab();
    window.close();
  });
})();