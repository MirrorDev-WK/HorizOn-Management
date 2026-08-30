import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { Client, Events, GatewayIntentBits, type Guild, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";

loadEnvConfig(process.cwd());

type BotConfig = {
  botToken: string;
  guildId: string;
  mainVoiceChannelId: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
};

type StoredMember = { id: string; name: string };

const config = getConfig();
const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });

const commands = [
  new SlashCommandBuilder()
    .setName("link")
    .setDescription("Link a Discord member to a HorizOn character")
    .addUserOption((option) => option.setName("member").setDescription("Discord member").setRequired(true))
    .addStringOption((option) => option.setName("character").setDescription("Exact character name in HorizOn").setRequired(true)),
  new SlashCommandBuilder()
    .setName("unlink")
    .setDescription("Remove a Discord link from a HorizOn character")
    .addStringOption((option) => option.setName("character").setDescription("Exact character name in HorizOn").setRequired(true)),
];

client.once(Events.ClientReady, async (readyClient) => {
  try {
    const guild = await readyClient.guilds.fetch(config.guildId);
    await guild.commands.set(commands.map((command) => command.toJSON()));
    await syncAllVoiceAttendance(guild);
    console.log(`HorizOn voice bot is ready as ${readyClient.user.tag}.`);
  } catch (error) {
    console.error("Discord bot could not start:", error);
    process.exitCode = 1;
    client.destroy();
  }
});

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  if (newState.guild.id !== config.guildId) return;
  const wasInMainVoice = oldState.channelId === config.mainVoiceChannelId;
  const isInMainVoice = newState.channelId === config.mainVoiceChannelId;
  if (!wasInMainVoice && !isInMainVoice) return;

  await updateLinkedMemberVoicePresence(newState.id, newState.channelId, isInMainVoice);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.guildId !== config.guildId) return;
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: "Only a server manager can link characters.", ephemeral: true });
    return;
  }

  const characterName = interaction.options.getString("character", true).trim();
  const member = await findMemberByCharacterName(characterName);
  if (!member) {
    await interaction.reply({ content: `No HorizOn character named \`${characterName}\` was found.`, ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  try {
    if (interaction.commandName === "unlink") {
      const { error } = await supabase.from("discord_member_links").delete().eq("member_id", member.id);
      if (error) throw error;
      await interaction.editReply(`${member.name} is no longer linked to Discord.`);
      return;
    }

    const discordUser = interaction.options.getUser("member", true);
    const { error: unlinkError } = await supabase.from("discord_member_links").delete().eq("discord_user_id", discordUser.id);
    if (unlinkError) throw unlinkError;
    const { error: linkError } = await supabase.from("discord_member_links").upsert({
      member_id: member.id,
      discord_user_id: discordUser.id,
      discord_username: discordUser.globalName ?? discordUser.username,
      linked_at: new Date().toISOString(),
    });
    if (linkError) throw linkError;

    const guild = interaction.guild;
    const currentChannelId = guild?.voiceStates.cache.get(discordUser.id)?.channelId ?? null;
    await updateLinkedMemberVoicePresence(discordUser.id, currentChannelId, currentChannelId === config.mainVoiceChannelId);
    await interaction.editReply(`Linked ${discordUser} to **${member.name}**.`);
  } catch (error) {
    console.error("Discord link command failed:", error);
    await interaction.editReply("The link could not be saved. Check the bot terminal and Supabase schema.");
  }
});

client.login(config.botToken).catch((error) => {
  console.error("Discord login failed:", error);
  process.exitCode = 1;
});

function getConfig(): BotConfig {
  const values = {
    botToken: process.env.DISCORD_BOT_TOKEN,
    guildId: process.env.DISCORD_GUILD_ID,
    mainVoiceChannelId: process.env.DISCORD_VOICE_CHANNEL_ID,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  const missing = Object.entries(values).filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  return values as BotConfig;
}

async function findMemberByCharacterName(characterName: string): Promise<StoredMember | null> {
  const { data, error } = await supabase.from("guild_states").select("state").eq("id", "horizon").maybeSingle();
  if (error) throw error;
  const state = data?.state;
  if (!state || typeof state !== "object") return null;
  const members = (state as { members?: unknown }).members;
  if (!Array.isArray(members)) return null;
  const matches = members.filter(isStoredMember).filter((member) => member.name.toLocaleLowerCase() === characterName.toLocaleLowerCase());
  return matches.length === 1 ? matches[0] : null;
}

function isStoredMember(value: unknown): value is StoredMember {
  if (!value || typeof value !== "object") return false;
  const member = value as Partial<StoredMember>;
  return typeof member.id === "string" && typeof member.name === "string";
}

async function updateLinkedMemberVoicePresence(discordUserId: string, _voiceChannelId: string | null, isInMainVoice: boolean): Promise<void> {
  const { data: link, error: linkError } = await supabase
    .from("discord_member_links")
    .select("member_id, discord_username")
    .eq("discord_user_id", discordUserId)
    .maybeSingle();
  if (linkError) throw linkError;
  if (!link) return;

  const { error } = await supabase.from("discord_voice_status").upsert({
    member_id: link.member_id,
    discord_username: link.discord_username,
    is_in_main_voice: isInMainVoice,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

async function syncAllVoiceAttendance(guild: Guild): Promise<void> {
  const { data: links, error } = await supabase.from("discord_member_links").select("member_id, discord_user_id, discord_username");
  if (error) throw error;
  const rows = (links ?? []).map((link) => {
    const voiceChannelId = guild.voiceStates.cache.get(link.discord_user_id)?.channelId ?? null;
    return {
      member_id: link.member_id,
      discord_username: link.discord_username,
      is_in_main_voice: voiceChannelId === config.mainVoiceChannelId,
      updated_at: new Date().toISOString(),
    };
  });
  if (rows.length === 0) return;
  const { error: upsertError } = await supabase.from("discord_voice_status").upsert(rows);
  if (upsertError) throw upsertError;
}
