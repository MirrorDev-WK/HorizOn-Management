export const DEFAULT_PARTY_CAPACITY = 5;

export const RAGNAROK_NEW_WORLD_CLASS_GROUPS = [
  { label: "Launch classes", jobs: ["Swordsman", "Mage", "Archer", "Acolyte", "Thief", "Merchant", "Gunslinger", "Druid"] },
  { label: "Advanced classes", jobs: ["Lord Knight", "Paladin", "Sniper", "Bard", "Dancer", "High Wizard", "Sage", "High Priest", "Champion", "Assassin Cross", "Whitesmith", "Night Walker"] },
] as const;

export const RAGNAROK_NEW_WORLD_CLASSES = RAGNAROK_NEW_WORLD_CLASS_GROUPS.flatMap((group) => group.jobs);

export const RAGNAROK_NEW_WORLD_CLASS_OPTION_COUNT = RAGNAROK_NEW_WORLD_CLASSES.length;
