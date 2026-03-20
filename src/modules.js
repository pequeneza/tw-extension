export const MODULES = [
  {
    id: 'renamer_bito_merged',
    name: 'Renamer (BITO merged)',
    desc: 'Rename buttons + color painting for incomings/overview (BITO v3 logic, more robust selectors).',
  },
  {
    id: 'mass_label_delay',
    name: 'Mass Label w/ Delay',
    desc: 'Select all incomings + apply label after 120s+random.',
  },
  {
    id: 'cmdsender',
    name: 'Mão de Deus (CommandSender)',
    desc: 'Scheduled confirm click with offset.',
  },
  {
    id: 'fakes',
    name: 'Fakes Sender',
    desc: 'Smart fake sender with caps + UI.',
  },
  {
    id: 'wh_balancer',
    name: 'WH Balancer + Instant Trade',
    desc: 'Warehouse balancer dialog + optional instant trade plan.',
  },
  {
    id: 'resource_buyer',
    name: 'Resource Buyer',
    desc: 'Manual start premium exchange buyer (storage target).',
  },
  {
    id: 'auto_mint',
    name: 'Auto Mint Coins',
    desc: 'Auto fill max + mint + refresh/cooldown UI.',
  },
  {
    id: 'noble_sender_trainer',
    name: 'Noble Resource Sender + Trainer',
    desc: 'Send resources for nobles (patched to localStorage).',
  },
  {
    id: 'extended_profile',
    name: 'Extended Player Profile',
    desc: 'Adds history/tribe changes/ennoblements stats.',
  },
  {
    id: 'tw_snipe_scheduler',
    name: 'Sniper Scheduler',
    desc: 'Assists on snipping NT',
  },
];

export function mergeDefaults(saved) {
  const enabled = {};
  for (const m of MODULES) enabled[m.id] = false;
  return { enabled: { ...enabled, ...(saved?.enabled || {}) } };
}
