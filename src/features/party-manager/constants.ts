export const DEFAULT_PARTY_CAPACITY = 5;

export const RAGNAROK_NEW_WORLD_CLASS_GROUPS = [
  { label: "Launch classes", jobs: ["Swordsman", "Mage", "Archer", "Acolyte", "Thief", "Merchant", "Gunslinger", "Druid"] },
  { label: "Current advancements", jobs: ["Knight", "Wizard", "Hunter", "Priest", "Assassin", "Blacksmith"] },
] as const;

export const RAGNAROK_NEW_WORLD_CLASS_OPTION_COUNT = RAGNAROK_NEW_WORLD_CLASS_GROUPS.reduce((count, group) => count + group.jobs.length, 0);
