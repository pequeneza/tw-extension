export interface ModuleConfig {
  id: ModuleId;
  label: string;
  description: string;
  matchPattern: RegExp;
  scriptFile: string;
  icon: string;
}

export type ModuleId =
  | "auto_mint"
  | "extended_profile"
  | "fakes"
  | "mano_de_deus"
  | "mass_label_delay"
  | "noble_sender_trainer"
  | "renamer_bito"
  | "resource_buyer"
  | "tw_snipe_scheduler"
  | "wh_balancer";

export interface ModuleSettings {
  [key: string]: boolean;
}

/**
 * Storage key for the module enabled/disabled map.
 * NOTE: "false" is now the safe default — modules must be explicitly enabled.
 * This prevents scripts from running unintentionally on page navigation.
 */
export const STORAGE_KEY = "xbot_settings_v1";

export const MODULE_CONFIGS: ModuleConfig[] = [
  {
    id: "auto_mint",
    label: "Auto Mint",
    description: "Auto fills max coins + mints with countdown; refreshes when cooldown ends.",
    matchPattern: /screen=snob/,
    scriptFile: "auto_mint.user.js",
    icon: "🪙",
  },
  {
    id: "extended_profile",
    label: "Extended Profile",
    description: "Adds extended player stats: history, tribe changes, ennoblements, daily stats.",
    matchPattern: /screen=info_player/,
    scriptFile: "extended_profile.user.js",
    icon: "👤",
  },
  {
    id: "fakes",
    label: "Fake Sender",
    description: "Smart fake sender with per-village/per-target caps and target plan.",
    matchPattern: /screen=place/,
    scriptFile: "fakes.user.js",
    icon: "⚔️",
  },
  {
    id: "mano_de_deus",
    label: "Mão de Deus",
    description: "Schedules confirm click using server time with hybrid timer + alerts.",
    matchPattern: /screen=place.*try=confirm/,
    scriptFile: "mano_de_deus.user.js",
    icon: "🎯",
  },
  {
    id: "mass_label_delay",
    label: "Mass Label Delay",
    description: "Automatically labels all incoming attacks with a human-like delay.",
    matchPattern: /screen=overview_villages.*mode=incomings/,
    scriptFile: "mass_label_delay.user.js",
    icon: "🏷️",
  },
  {
    id: "noble_sender_trainer",
    label: "Noble Sender + Trainer",
    description: "Sends resources for noble recruitment from multiple villages.",
    matchPattern: /screen=snob(?!.*mode=coin)/,
    scriptFile: "noble_sender_trainer.user.js",
    icon: "👑",
  },
  {
    id: "renamer_bito",
    label: "Renamer (BITO Colors)",
    description: "Renames and color-codes incoming attacks for quick triage.",
    matchPattern: /screen=overview_villages.*mode=incomings|screen=place/,
    scriptFile: "renamer_bito_merged.user.js",
    icon: "🎨",
  },
  {
    id: "resource_buyer",
    label: "Resource Buyer",
    description: "Buys resources via premium market to reach a % of storage capacity.",
    matchPattern: /screen=market.*mode=exchange/,
    scriptFile: "resource_buyer.user.js",
    icon: "🛒",
  },
  {
    id: "tw_snipe_scheduler",
    label: "Snipe Scheduler",
    description: "Opens UI to plan and schedule gap snipes with ms-precision timers.",
    matchPattern: /screen=overview|screen=place/,
    scriptFile: "tw_snipe_scheduler.user.js",
    icon: "🏹",
  },
  {
    id: "wh_balancer",
    label: "WH Balancer",
    description: "Fetches overview pages, computes balanced trade plan, executes sends.",
    matchPattern: /.*/,
    scriptFile: "wh_balancer.user.js",
    icon: "⚖️",
  },
];
