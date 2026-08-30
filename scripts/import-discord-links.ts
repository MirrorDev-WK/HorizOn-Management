import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { Client, GatewayIntentBits } from "discord.js";
import { readSheet } from "read-excel-file/node";
import { parseDiscordLinkImportRows, type DiscordLinkImportRow } from "../src/lib/discord-link-import";

loadEnvConfig(process.cwd());

type ImportConfig = {
  botToken: string;
  guildId: string;
  mainVoiceChannelId: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
};

type StoredMember = { id: string; name: string };

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: npm run discord:import-links -- <roster.xlsx|roster.csv>");
  process.exitCode = 1;
} else {
  void importDiscordLinks(inputPath).catch((error: unknown) => {
    console.error("Discord link import failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

async function importDiscordLinks(filePath: string): Promise<void> {
  const parsed = parseDiscordLinkImportRows(await readRows(filePath));
  if (parsed.errors.length > 0) {
    throw new Error(`Fix the Excel file before importing:\n${parsed.errors.map((message) => `- ${message}`).join("\n")}`);
  }
  if (parsed.rows.length === 0) throw new Error("No Discord links were found in the file.");

  const config = getConfig();
  const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: guildStateRow, error: guildStateError } = await supabase.from("guild_states").select("state").eq("id", "horizon").maybeSingle();
  if (guildStateError) throw guildStateError;
  const storedMembers = getStoredMembers(guildStateRow?.state);
  const membersByName = new Map<string, StoredMember[]>();
  for (const member of storedMembers) {
    const normalizedName = member.name.toLocaleLowerCase();
    membersByName.set(normalizedName, [...(membersByName.get(normalizedName) ?? []), member]);
  }
  const resolvedLinks = parsed.rows.map((row) => resolveLink(row, membersByName));

  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
  try {
    await client.login(config.botToken);
    const guild = await client.guilds.fetch(config.guildId);
    const linksWithDiscordMembers = [];
    for (const link of resolvedLinks) {
      try {
        const discordMember = await guild.members.fetch(link.discordUserId);
        linksWithDiscordMembers.push({
          ...link,
          discordUsername: discordMember.user.globalName ?? discordMember.displayName ?? discordMember.user.username,
          isInMainVoice: discordMember.voice.channelId === config.mainVoiceChannelId,
        });
      } catch {
        throw new Error(`Discord User ID ${link.discordUserId} is not a member of the configured Discord server.`);
      }
    }

    const memberIds = linksWithDiscordMembers.map((link) => link.memberId);
    const discordUserIds = linksWithDiscordMembers.map((link) => link.discordUserId);
    const { error: removeMemberLinksError } = await supabase.from("discord_member_links").delete().in("member_id", memberIds);
    if (removeMemberLinksError) throw removeMemberLinksError;
    const { error: removeDiscordLinksError } = await supabase.from("discord_member_links").delete().in("discord_user_id", discordUserIds);
    if (removeDiscordLinksError) throw removeDiscordLinksError;

    const linkedAt = new Date().toISOString();
    const { error: createLinksError } = await supabase.from("discord_member_links").upsert(linksWithDiscordMembers.map((link) => ({
      member_id: link.memberId,
      discord_user_id: link.discordUserId,
      discord_username: link.discordUsername,
      linked_at: linkedAt,
    })));
    if (createLinksError) throw createLinksError;
    const { error: createStatusesError } = await supabase.from("discord_voice_status").upsert(linksWithDiscordMembers.map((link) => ({
      member_id: link.memberId,
      discord_username: link.discordUsername,
      is_in_main_voice: link.isInMainVoice,
      updated_at: linkedAt,
    })));
    if (createStatusesError) throw createStatusesError;

    console.log(`Linked ${linksWithDiscordMembers.length} member${linksWithDiscordMembers.length === 1 ? "" : "s"}.`);
  } finally {
    client.destroy();
  }
}

function getConfig(): ImportConfig {
  const values = {
    botToken: process.env.DISCORD_BOT_TOKEN,
    guildId: process.env.DISCORD_GUILD_ID,
    mainVoiceChannelId: process.env.DISCORD_VOICE_CHANNEL_ID,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  const missing = Object.entries(values).filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  return values as ImportConfig;
}

async function readRows(filePath: string): Promise<unknown[][]> {
  const extension = path.extname(filePath).toLocaleLowerCase();
  if (extension === ".xlsx") return readSheet(filePath);
  if (extension === ".csv") return parseCsv(await fs.readFile(filePath, "utf8"));
  throw new Error("Use an .xlsx or .csv roster file.");
}

function getStoredMembers(state: unknown): StoredMember[] {
  const members = state && typeof state === "object" ? (state as { members?: unknown }).members : undefined;
  if (!Array.isArray(members)) throw new Error("The shared HorizOn roster is empty. Import the roster in the website first.");
  return members.filter(isStoredMember);
}

function resolveLink(row: DiscordLinkImportRow, membersByName: Map<string, StoredMember[]>): DiscordLinkImportRow & { memberId: string } {
  const matches = membersByName.get(row.characterName.toLocaleLowerCase()) ?? [];
  if (matches.length === 0) throw new Error(`No HorizOn character named \"${row.characterName}\" was found. Import the roster first.`);
  if (matches.length > 1) throw new Error(`More than one HorizOn character is named \"${row.characterName}\". Rename one before linking.`);
  return { ...row, memberId: matches[0].id };
}

function isStoredMember(value: unknown): value is StoredMember {
  if (!value || typeof value !== "object") return false;
  const member = value as Partial<StoredMember>;
  return typeof member.id === "string" && typeof member.name === "string";
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let isQuoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (isQuoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        isQuoted = !isQuoted;
      }
    } else if (character === "," && !isQuoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !isQuoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (cell || row.length > 0) rows.push([...row, cell]);
  return rows;
}
