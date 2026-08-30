export type DiscordLinkImportRow = {
  characterName: string;
  discordUserId: string;
};

export type DiscordLinkImportResult = {
  rows: DiscordLinkImportRow[];
  errors: string[];
};

const CHARACTER_NAME_HEADERS = new Set(["charactername", "character", "name"]);
const DISCORD_USER_ID_HEADERS = new Set(["discorduserid", "discordid"]);

export function parseDiscordLinkImportRows(rows: unknown[][]): DiscordLinkImportResult {
  const headerRow = rows[0];
  if (!headerRow) return { rows: [], errors: ["The file is empty."] };

  const nameIndex = headerRow.findIndex((value) => CHARACTER_NAME_HEADERS.has(normalizeHeader(value)));
  const discordUserIdIndex = headerRow.findIndex((value) => DISCORD_USER_ID_HEADERS.has(normalizeHeader(value)));
  if (nameIndex < 0 || discordUserIdIndex < 0) {
    return { rows: [], errors: ["Add Character Name (or Name) and Discord User ID headers in the first row."] };
  }

  const links: DiscordLinkImportRow[] = [];
  const errors: string[] = [];
  const knownNames = new Set<string>();
  const knownDiscordUserIds = new Set<string>();

  for (const [index, row] of rows.slice(1).entries()) {
    const rowNumber = index + 2;
    const characterName = cellText(row[nameIndex]);
    const discordUserId = parseDiscordUserId(row[discordUserIdIndex]);
    if (!characterName && discordUserId.kind === "empty") continue;
    if (!characterName) {
      errors.push(`Row ${rowNumber}: Character Name is required.`);
      continue;
    }
    if (discordUserId.kind === "empty") {
      errors.push(`Row ${rowNumber}: Discord User ID is required.`);
      continue;
    }
    if (discordUserId.kind === "error") {
      errors.push(`Row ${rowNumber}: ${discordUserId.message}`);
      continue;
    }

    const normalizedName = characterName.toLocaleLowerCase();
    if (knownNames.has(normalizedName)) {
      errors.push(`Row ${rowNumber}: Character Name \"${characterName}\" is repeated.`);
      continue;
    }
    if (knownDiscordUserIds.has(discordUserId.value)) {
      errors.push(`Row ${rowNumber}: this Discord User ID is repeated.`);
      continue;
    }
    knownNames.add(normalizedName);
    knownDiscordUserIds.add(discordUserId.value);
    links.push({ characterName, discordUserId: discordUserId.value });
  }

  return { rows: links, errors };
}

function normalizeHeader(value: unknown): string {
  return cellText(value).toLowerCase().replace(/[^a-z]/g, "");
}

function cellText(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function parseDiscordUserId(value: unknown): { kind: "empty" } | { kind: "error"; message: string } | { kind: "value"; value: string } {
  if (value === null || value === undefined || value === "") return { kind: "empty" };
  if (typeof value === "number") {
    return { kind: "error", message: "Discord User ID must be stored as Text in Excel, not a number." };
  }
  if (typeof value !== "string") return { kind: "error", message: "Discord User ID must be text." };
  const discordUserId = value.trim();
  if (!/^\d{17,20}$/.test(discordUserId)) {
    return { kind: "error", message: "Discord User ID must contain 17–20 digits." };
  }
  return { kind: "value", value: discordUserId };
}
