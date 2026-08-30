import { createEmptyGuildState, normalizeGuildState } from "@/features/party-manager/utils";
import type { GuildMember, GuildState } from "@/features/party-manager/types";

const STORAGE_KEY = "horizon-party-manager-v1";

export function loadGuildState(): GuildState {
  if (typeof window === "undefined") return createEmptyGuildState();
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
    if (!value || typeof value !== "object") return createEmptyGuildState();
    const candidate = value as Partial<GuildState>;
    if (!Array.isArray(candidate.parties) || !Array.isArray(candidate.reserveMemberIds)) return createEmptyGuildState();
    const members = Array.isArray(candidate.members) ? candidate.members.filter(isGuildMember) : [];
    return normalizeGuildState({ members, parties: candidate.parties, reserveMemberIds: candidate.reserveMemberIds }, members);
  } catch {
    return createEmptyGuildState();
  }
}

export function saveGuildState(state: GuildState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // The app remains usable if storage is unavailable or full.
  }
}

export function resetGuildState(members: GuildMember[]): GuildState {
  return { members, parties: [], reserveMemberIds: [] };
}

function isGuildMember(value: unknown): value is GuildMember {
  if (!value || typeof value !== "object") return false;
  const member = value as Partial<GuildMember>;
  return typeof member.id === "string" && typeof member.name === "string" && typeof member.className === "string" && (member.cp === undefined || typeof member.cp === "number") && (member.isDiscordLinked === undefined || typeof member.isDiscordLinked === "boolean") && (member.discordUsername === undefined || typeof member.discordUsername === "string") && (member.isInMainVoice === undefined || typeof member.isInMainVoice === "boolean");
}
