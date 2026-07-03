import { ModuleId } from "./modules";

export type FieldType = "number" | "text" | "checkbox" | "textarea" | "time" | "select";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  default: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  rows?: number;
  options?: { value: string; label: string }[];
  help?: string;
}

export interface ModuleConfigSchema {
  storageKey: string;
  fields: FieldDef[];
}

export type ModuleConfigSchemas = Partial<Record<ModuleId, ModuleConfigSchema>>;

export const MODULE_CONFIG_SCHEMAS: ModuleConfigSchemas = {
  auto_mint: {
    storageKey: "tw_suite_cfg_auto_mint",
    fields: [
      {
        key: "interval",
        label: "Check interval (ms)",
        type: "number",
        default: 90000,
        min: 10000,
        max: 600000,
        step: 1000,
        help: "How often to attempt minting coins.",
      },
      {
        key: "mintClickDelay",
        label: "Mint click delay (ms)",
        type: "number",
        default: 500,
        min: 100,
        max: 5000,
        step: 100,
      },
      {
        key: "refreshOnMissingAfterMs",
        label: "Refresh if mint missing (ms)",
        type: "number",
        default: 30000,
        min: 5000,
        max: 300000,
        step: 1000,
        help: "If the mint button is absent for this long, reload the page.",
      },
      {
        key: "minRefreshGapMs",
        label: "Min refresh gap (ms)",
        type: "number",
        default: 60000,
        min: 10000,
        max: 600000,
        step: 1000,
        help: "Minimum time between page reloads.",
      },
    ],
  },

  fakes: {
    storageKey: "tw_suite_cfg_fakes",
    fields: [
      {
        key: "attackDelay",
        label: "Attack delay (ms)",
        type: "number",
        default: 300,
        min: 250,
        max: 3000
      },
      {
        key: "attackRandom",
        label: "Attack Randomizer",
        type: "number",
        default: 0,
        min: 0,
        max: 5000
      },
      {
        key: "confirmDelay",
        label: "Confirm delay (ms)",
        type: "number",
        default: 300,
        min: 250,
        max: 3000
      },
      {
        key: "confirmRandom",
        label: "Confirm Randomizer",
        type: "number",
        default: 0,
        min: 0,
        max: 5000
      },
      {
        key: "switchDelay",
        label: "Village switch delay (ms)",
        type: "number",
        default: 300,
        min: 250,
        max: 3000
      },
      {
        key: "switchRandom",
        label: "Switch Randomizer",
        type: "number",
        default: 0,
        min: 0,
        max: 5000
      },
      {
        key: "fakesPerVillage",
        label: "Max fakes per village (per run)",
        type: "number",
        default: 10,
        min: 1,
        max: 200,
        step: 1,
      },
      {
        key: "maxAttacksPerCoord",
        label: "Max attacks per coord",
        type: "number",
        default: 2,
        min: 1,
        max: 20,
        step: 1,
      },
      {
        key: "multiHitAttacks",
        label: "N attacks for lucky coords",
        type: "number",
        default: 2,
        min: 1,
        max: 10,
        step: 1,
      },
      {
        key: "multiHitChance",
        label: "Lucky coord chance (%)",
        type: "number",
        default: 20,
        min: 0,
        max: 100,
        step: 1,
      },
      {
        key: "arrivalStart",
        label: "Arrival window start",
        type: "time",
        default: "08:01",
      },
      {
        key: "arrivalEnd",
        label: "Arrival window end",
        type: "time",
        default: "22:58",
      },
      {
        key: "stopAtEnd",
        label: "Stop when all coords used",
        type: "checkbox",
        default: true,
      },
      {
        key: "maxCatapults",
        label: "Max catapults (caps rams)",
        type: "number",
        default: 1,
        min: 0,
        max: 50,
        step: 1,
      },
      {
        key: "maxScouts",
        label: "Max scouts",
        type: "number",
        default: 20,
        min: 0,
        max: 200,
        step: 1,
      },
      {
        key: "maxInfantry",
        label: "Max infantry",
        type: "number",
        default: 35,
        min: 0,
        max: 500,
        step: 1,
      },
      {
        key: "maxCavalry",
        label: "Max cavalry",
        type: "number",
        default: 999,
        min: 0,
        max: 999,
        step: 1,
      },
      {
        key: "coords",
        label: "Target coords",
        type: "textarea",
        default: "",
        rows: 5,
        help: "Space or newline-separated coords (format: 123|456).",
      },
    ],
  },

  mano_de_deus: {
    storageKey: "tw_suite_cfg_mano_de_deus",
    fields: [
      {
        key: "fineOffsetMs",
        label: "Fine offset (ms)",
        type: "number",
        default: 250,
        min: -5000,
        max: 5000,
        step: 1,
        help: "Positive = click later; negative = click earlier.",
      },
      {
        key: "alertLeadMs",
        label: "Alert lead time (ms)",
        type: "number",
        default: 10000,
        min: 0,
        max: 60000,
        step: 500,
        help: "How many ms before target to fire alerts.",
      },
      {
        key: "alertSoundEnabled",
        label: "Alert sound",
        type: "checkbox",
        default: true,
      },
      {
        key: "alertFlashEnabled",
        label: "Alert tab flash",
        type: "checkbox",
        default: true,
      },
      {
        key: "alertNotifyEnabled",
        label: "Desktop notification",
        type: "checkbox",
        default: true,
      },
    ],
  },

  noble_sender_trainer: {
    storageKey: "tw_suite_cfg_noble_sender",
    fields: [
      {
        key: "requestedNobles",
        label: "Default nobles to recruit",
        type: "number",
        default: 1,
        min: 1,
        max: 20,
        step: 1,
      },
      {
        key: "ignoreBelowPoints",
        label: "Ignore villages below (points)",
        type: "number",
        default: 1500,
        min: 0,
        max: 100000,
        step: 100,
      },
    ],
  },

  resource_buyer: {
    storageKey: "tw_suite_cfg_resource_buyer",
    fields: [
      {
        key: "PURCHASE_PERCENTAGE",
        label: "Target % of storage",
        type: "number",
        default: 70,
        min: 1,
        max: 100,
        step: 1,
        help: "Buy until each enabled resource is at this % of warehouse capacity.",
      },
      {
        key: "MAX_PREMIUM_POINTS",
        label: "Max premium points guard",
        type: "number",
        default: 300,
        min: 0,
        max: 10000,
        step: 10,
        help: "Pause buying when PP exceeds this threshold.",
      },
      {
        key: "PREMIUM_POINTS_TIMEOUT_MIN",
        label: "PP timeout (minutes)",
        type: "number",
        default: 10,
        min: 1,
        max: 120,
        step: 1,
      },
      {
        key: "MIN_STOCK_THRESHOLD",
        label: "Min exchange stock",
        type: "number",
        default: 50,
        min: 0,
        max: 100000,
        step: 50,
      },
      {
        key: "buy_wood",
        label: "Buy wood",
        type: "checkbox",
        default: true,
      },
      {
        key: "buy_stone",
        label: "Buy clay/stone",
        type: "checkbox",
        default: true,
      },
      {
        key: "buy_iron",
        label: "Buy iron",
        type: "checkbox",
        default: true,
      },
    ],
  },

  wh_balancer: {
    storageKey: "tw_suite_cfg_wh_balancer",
    fields: [
      {
        key: "highPoints",
        label: "Finished village threshold (points)",
        type: "number",
        default: 7000,
        min: 0,
        max: 100000,
        step: 100,
        help: "Villages above this point count are treated as 'built-out'.",
      },
      {
        key: "highFarm",
        label: "High farm threshold (population)",
        type: "number",
        default: 23000,
        min: 0,
        max: 30000,
        step: 100,
      },
      {
        key: "lowPoints",
        label: "Priority village threshold (points)",
        type: "number",
        default: 3000,
        min: 0,
        max: 50000,
        step: 100,
        help: "Villages below this are prioritised and filled to needsMorePercentage.",
      },
      {
        key: "builtOutPercentage",
        label: "Keep % for finished villages",
        type: "number",
        default: 0.26,
        min: 0.1,
        max: 0.95,
        step: 0.01,
      },
      {
        key: "needsMorePercentage",
        label: "Target % for priority villages",
        type: "number",
        default: 0.7,
        min: 0.1,
        max: 0.95,
        step: 0.01,
      },
      {
        key: "premiumInstantEnabled",
        label: "Enable instant trade (10pp)",
        type: "checkbox",
        default: false,
      },
      {
        key: "premiumThreshold",
        label: "PP trade threshold",
        type: "number",
        default: 50000,
        min: 0,
        max: 1000000,
        step: 1000,
      },
      {
        key: "premiumMoveAmount",
        label: "PP max move amount",
        type: "number",
        default: 300000,
        min: 0,
        max: 2000000,
        step: 10000,
      },
      {
        key: "premiumMaxDistance",
        label: "PP max donor distance",
        type: "number",
        default: 18,
        min: 1,
        max: 200,
        step: 1,
      },
      {
        key: "sendAllIntervalMs",
        label: "Send-all interval (ms)",
        type: "number",
        default: 500,
        min: 100,
        max: 10000,
        step: 100,
      },
    ],
  },

  mass_label_renamer: {
    storageKey: "tw_suite_cfg_mass_label_renamer",
    fields: [
      {
        key: "highlightMode",
        label: "Row highlight style",
        type: "select",
        default: "coluna",
        options: [
          { value: "coluna", label: "First column only" },
          { value: "linha",  label: "Full row" },
          { value: "nada",   label: "None" },
        ],
        help: "How to colour-code rows based on their tag.",
      },
      {
        key: "kbEnabled",
        label: "Keyboard shortcuts (Alt+key)",
        type: "checkbox",
        default: true,
        help: "Alt+M=Morto, Alt+F=Fake, Alt+S=Snipar, Alt+D=Desviar, Alt+V=Vigiar, Alt+C=Snipe Cancel",
      },
      {
        key: "minDelaySeconds",
        label: "Auto-label min delay (s)",
        type: "number",
        default: 120,
        min: 30,
        max: 600,
        step: 10,
        help: "Minimum seconds before the auto-label bulk action fires.",
      },
      {
        key: "randomExtraMax",
        label: "Auto-label random extra (s)",
        type: "number",
        default: 30,
        min: 0,
        max: 300,
        step: 5,
        help: "Random seconds added on top of the min delay.",
      },
      {
        key: "originBadgeEnabled",
        label: "Multi-target origin badge",
        type: "checkbox",
        default: true,
        help: "Shows a ×N badge in the Origem column when an attacker targets more than one village.",
      },
      {
        key: "autoFakeEnabled",
        label: "Auto-detect & tag fakes",
        type: "checkbox",
        default: false,
        help: "Automatically applies [Fake] when 2+ attacks from the same village were sent within the detection window.",
      },
      {
        key: "autoFakeWindowSec",
        label: "Fake detection window (s)",
        type: "number",
        default: 10,
        min: 2,
        max: 60,
        step: 1,
        help: "Max seconds between send times for attacks from the same origin to be treated as script-fired fakes.",
      },
      {
        key: "pageDelayMs",
        label: "Page-advance delay (ms)",
        type: "number",
        default: 1500,
        min: 500,
        max: 10000,
        step: 500,
        help: "How long to wait before navigating to the next incomings page during the auto-label run.",
      },
    ],
  },

  tw_utils: {
    storageKey: "tw_suite_cfg_tw_utils",
    fields: [
      {
        key: "villageSwitcher",
        label: "Village Switcher ",
        type: "checkbox",
        default: true,
        help: "No mapa, mostra botão para trocar para uma aldeia própria selecionada.",
      },
      {
        key: "incomingFilter",
        label: "Incoming Filter ",
        type: "checkbox",
        default: true,
        help: "Adiciona botão nas tabelas de incomings para ocultar/mostrar apoios.",
      },
      {
        key: "quickbarCollapse",
        label: "Quickbar Collapse ",
        type: "checkbox",
        default: true,
        help: "Adiciona botão –/+ na quickbar para minimizar/expandir. Estado persiste entre páginas.",
      },
      {
        key: "bulkCancel",
        label: "Bulk Cancel",
        type: "checkbox",
        default: true,
        help: "Botão fixo em screen=place para cancelar todos os comandos de uma vez.",
      },
      {
        key: "bcDelayMin",
        label: "Cancel min delay (ms)",
        type: "number",
        default: 100,
        min: 50,
        max: 5000,
        step: 10,
        help: "Minimum random delay between cancel requests.",
      },
      {
        key: "bcDelayMax",
        label: "Cancel max delay (ms)",
        type: "number",
        default: 200,
        min: 50,
        max: 5000,
        step: 10,
        help: "Maximum random delay between cancel requests.",
      },
    ],
  },

  tw_snipe_scheduler: {
    storageKey: "tw_suite_cfg_snipe_scheduler",
    fields: [
      {
        key: "gameSpeed",
        label: "Game speed",
        type: "number",
        default: 1.4,
        min: 0.1,
        max: 10,
        step: 0.01,
      },
      {
        key: "unitSpeed",
        label: "Unit speed",
        type: "number",
        default: 0.75,
        min: 0.1,
        max: 5,
        step: 0.01,
      },
    ],
  },
};