import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeGuildState } from "@/features/party-manager/utils";
import type { GuildMember, GuildState, Party } from "@/features/party-manager/types";

const GUILD_STATE_ID = "horizon";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

type DiscordVoiceStatusRow = {
  member_id: string;
  discord_username: string | null;
  is_in_main_voice: boolean;
};

let browserClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabasePublishableKey);
}

function getBrowserClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  browserClient ??= createClient(supabaseUrl!, supabasePublishableKey!);
  return browserClient;
}

export async function loadSharedGuildState(): Promise<{ state: GuildState | null; error?: string }> {
  const supabase = getBrowserClient();
  if (!supabase) return { state: null };

  const { data, error } = await supabase.from("guild_states").select("state").eq("id", GUILD_STATE_ID).maybeSingle();
  if (error) return { state: null, error: error.message };
  return { state: data ? parseGuildState(data.state) : null };
}

export async function saveSharedGuildState(state: GuildState): Promise<string | null> {
  const supabase = getBrowserClient();
  if (!supabase) return null;

  const { error } = await supabase
    .from("guild_states")
    .upsert({ id: GUILD_STATE_ID, state: withoutDiscordRuntimeFields(state), updated_at: new Date().toISOString() });
  return error?.message ?? null;
}

export async function loadDiscordVoiceAttendance(): Promise<{ attendance: DiscordVoiceAttendance[]; error?: string }> {
  const supabase = getBrowserClient();
  if (!supabase) return { attendance: [] };

  const { data, error } = await supabase.from("discord_voice_status").select("member_id, discord_username, is_in_main_voice");
  if (error) return { attendance: [], error: error.message };
  return {
    attendance: (data as DiscordVoiceStatusRow[]).map((row) => ({
      memberId: row.member_id,
      discordUsername: row.discord_username ?? undefined,
      isInMainVoice: row.is_in_main_voice,
    })),
  };
}

export function subscribeToDiscordVoiceAttendance(onChange: () => void): () => void {
  const supabase = getBrowserClient();
  if (!supabase) return () => undefined;

  const channel = supabase
    .channel("horizon-discord-voice-attendance")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "discord_voice_status" },
      onChange,
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export type DiscordVoiceAttendance = {
  memberId: string;
  discordUsername?: string;
  isInMainVoice: boolean;
};

export function mergeDiscordVoiceAttendance(state: GuildState, attendance: DiscordVoiceAttendance[]): GuildState {
  const attendanceByMemberId = new Map(attendance.map((entry) => [entry.memberId, entry]));
  let changed = false;
  const members = state.members.map((member) => {
    const entry = attendanceByMemberId.get(member.id);
    const next = entry
      ? { ...member, isDiscordLinked: true, discordUsername: entry.discordUsername, isInMainVoice: entry.isInMainVoice }
      : { ...member, isDiscordLinked: false, discordUsername: undefined, isInMainVoice: false };
    if (next.isDiscordLinked !== member.isDiscordLinked || next.discordUsername !== member.discordUsername || next.isInMainVoice !== member.isInMainVoice) changed = true;
    return next;
  });
  return changed ? { ...state, members } : state;
}

function withoutDiscordRuntimeFields(state: GuildState): GuildState {
  return {
    ...state,
    members: state.members.map(({ isDiscordLinked: _isDiscordLinked, discordUsername: _discordUsername, isInMainVoice: _isInMainVoice, ...member }) => member),
  };
}

function parseGuildState(value: unknown): GuildState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<GuildState>;
  if (!Array.isArray(candidate.members) || !Array.isArray(candidate.parties) || !Array.isArray(candidate.reserveMemberIds)) return null;

  const members = candidate.members.filter(isGuildMember);
  const parties = candidate.parties.filter(isParty);
  const reserveMemberIds = candidate.reserveMemberIds.filter((id): id is string => typeof id === "string");
  return normalizeGuildState({ members, parties, reserveMemberIds });
}

function isGuildMember(value: unknown): value is GuildMember {
  if (!value || typeof value !== "object") return false;
  const member = value as Partial<GuildMember>;
  return typeof member.id === "string" && typeof member.name === "string" && typeof member.className === "string" && (member.cp === undefined || typeof member.cp === "number");
}

function isParty(value: unknown): value is Party {
  if (!value || typeof value !== "object") return false;
  const party = value as Partial<Party>;
  return typeof party.id === "string" && typeof party.name === "string" && Array.isArray(party.memberIds) && party.memberIds.every((id) => typeof id === "string");
}
