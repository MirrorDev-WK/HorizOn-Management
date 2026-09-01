import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  Events,
  GatewayIntentBits,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type Guild,
} from "discord.js";
import { RAGNAROK_NEW_WORLD_CLASSES } from "../src/features/party-manager/constants";

loadEnvConfig(process.cwd());

type BotConfig = {
  botToken: string;
  guildId: string;
  mainVoiceChannelId: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
};

type StoredMember = { id: string; name: string };
type RegistrationClassName = (typeof RAGNAROK_NEW_WORLD_CLASSES)[number];

const REGISTRATION_BUTTON_PREFIX = "horizon-register-class:";
const REGISTRATION_MODAL_PREFIX = "horizon-register-name:";
const CHARACTER_NAME_INPUT_ID = "character-name";

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
    .setDescription("Delete a HorizOn character and its Discord link")
    .addStringOption((option) => option.setName("character").setDescription("Exact character name in HorizOn").setRequired(true)),
  new SlashCommandBuilder()
    .setName("setup-registration")
    .setDescription("Post the self-registration class buttons in this channel"),
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
  if (interaction.guildId !== config.guildId) return;

  try {
    if (interaction.isButton()) {
      const className = registrationClassFromCustomId(interaction.customId, REGISTRATION_BUTTON_PREFIX);
      if (!className) return;
      await interaction.showModal(createRegistrationModal(className));
      return;
    }

    if (interaction.isModalSubmit()) {
      const className = registrationClassFromCustomId(interaction.customId, REGISTRATION_MODAL_PREFIX);
      if (!className) return;
      const characterName = interaction.fields.getTextInputValue(CHARACTER_NAME_INPUT_ID).trim();
      if (!characterName) {
        await interaction.reply({ content: "Enter a character name before registering.", ephemeral: true });
        return;
      }

      await interaction.deferReply({ ephemeral: true });
      const discordUsername = interaction.user.globalName ?? interaction.user.username;
      try {
        await registerDiscordMember({
          memberId: crypto.randomUUID(),
          characterName,
          className,
          discordUserId: interaction.user.id,
          discordUsername,
        });
        const currentChannelId = interaction.guild?.voiceStates.cache.get(interaction.user.id)?.channelId ?? null;
        await updateLinkedMemberVoicePresence(interaction.user.id, currentChannelId, currentChannelId === config.mainVoiceChannelId);
        await interaction.editReply(`Registered **${characterName}** as **${className}** and linked your Discord account.`);
      } catch (error) {
        console.error("Discord self-registration failed:", error);
        await interaction.editReply(registrationErrorMessage(error));
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: "Only a server manager can use this command.", ephemeral: true });
      return;
    }

    if (interaction.commandName === "setup-registration") {
      await interaction.reply({
        content: "**HorizOn character registration**\nChoose your Ragnarok class, then enter your exact in-game character name.",
        components: createRegistrationRows(),
      });
      return;
    }

    const characterName = interaction.options.getString("character", true).trim();
    const member = await findMemberByCharacterName(characterName);
    if (!member) {
      await interaction.reply({ content: `No HorizOn character named \`${characterName}\` was found.`, ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    if (interaction.commandName === "unlink") {
      const { error } = await supabase.rpc("unlink_and_delete_discord_member", { p_member_id: member.id });
      if (error) throw error;
      await interaction.editReply(`Deleted **${member.name}** from the HorizOn roster and removed its Discord link.`);
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
    console.error("Discord interaction failed:", error);
    if (interaction.isRepliable()) {
      const message = "The request could not be completed. Check the bot terminal and Supabase schema.";
      if (interaction.deferred || interaction.replied) await interaction.editReply(message);
      else await interaction.reply({ content: message, ephemeral: true });
    }
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

function createRegistrationRows(): ActionRowBuilder<ButtonBuilder>[] {
  return RAGNAROK_NEW_WORLD_CLASSES.reduce<ActionRowBuilder<ButtonBuilder>[]>((rows, className, index) => {
    const rowIndex = Math.floor(index / 5);
    const row = rows[rowIndex] ?? new ActionRowBuilder<ButtonBuilder>();
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${REGISTRATION_BUTTON_PREFIX}${index}`)
        .setLabel(className)
        .setStyle(ButtonStyle.Secondary),
    );
    rows[rowIndex] = row;
    return rows;
  }, []);
}

function createRegistrationModal(className: RegistrationClassName): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`${REGISTRATION_MODAL_PREFIX}${RAGNAROK_NEW_WORLD_CLASSES.indexOf(className)}`)
    .setTitle(`Register ${className}`)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(CHARACTER_NAME_INPUT_ID)
          .setLabel("In-game character name")
          .setPlaceholder("Enter your exact character name")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(40)
          .setRequired(true),
      ),
    );
}

function registrationClassFromCustomId(customId: string, prefix: string): RegistrationClassName | null {
  if (!customId.startsWith(prefix)) return null;
  const index = Number(customId.slice(prefix.length));
  return Number.isInteger(index) && index >= 0 ? RAGNAROK_NEW_WORLD_CLASSES[index] ?? null : null;
}

async function registerDiscordMember(input: {
  memberId: string;
  characterName: string;
  className: string;
  discordUserId: string;
  discordUsername: string;
}): Promise<void> {
  const { error } = await supabase.rpc("register_discord_member", {
    p_member_id: input.memberId,
    p_character_name: input.characterName,
    p_class_name: input.className,
    p_discord_user_id: input.discordUserId,
    p_discord_username: input.discordUsername,
  });
  if (error) throw error;
}

function registrationErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("already registered") || message.includes("already exists")) return message;
  return "Registration could not be saved. Ask a guild manager to check the bot and Supabase setup.";
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
