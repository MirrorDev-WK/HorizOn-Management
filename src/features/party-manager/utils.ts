import { DEFAULT_PARTY_CAPACITY } from "@/features/party-manager/constants";
import type { Destination, GuildMember, GuildState, Party } from "@/features/party-manager/types";

export function createEmptyGuildState(): GuildState {
  return { members: [], parties: [], reserveMemberIds: [] };
}

export function normalizeGuildState(state: GuildState, members: GuildMember[] = state.members): GuildState {
  const normalizedMembers = members.map((member) => ({ ...member, isInMainVoice: member.isInMainVoice === true }));
  const validIds = new Set(normalizedMembers.map((member) => member.id));
  const assignedIds = new Set<string>();
  const parties = state.parties.map((party) => ({
    ...party,
    name: party.name.trim() || "Untitled Party",
    memberIds: party.memberIds.filter((id) => validIds.has(id) && !assignedIds.has(id) && (assignedIds.add(id), true)),
  }));
  const reserveMemberIds = state.reserveMemberIds.filter(
    (id) => validIds.has(id) && !assignedIds.has(id) && (assignedIds.add(id), true),
  );
  return { members: normalizedMembers, parties, reserveMemberIds };
}

export function getUnassignedMembers(state: GuildState, members: GuildMember[]): GuildMember[] {
  const occupied = new Set([...state.reserveMemberIds, ...state.parties.flatMap((party) => party.memberIds)]);
  return members.filter((member) => !occupied.has(member.id));
}

export function getUnassignedInMainVoiceMembers(state: GuildState, members: GuildMember[]): GuildMember[] {
  return getUnassignedMembers(state, members).filter((member) => member.isInMainVoice);
}

export function getPartyMembers(party: Party, members: GuildMember[]): GuildMember[] {
  const lookup = new Map(members.map((member) => [member.id, member]));
  return party.memberIds.flatMap((id) => {
    const member = lookup.get(id);
    return member ? [member] : [];
  });
}

export function moveMember(
  state: GuildState,
  memberId: string,
  destination: Destination,
): { state: GuildState; error?: string } {
  const withoutMember: GuildState = {
    members: state.members,
    parties: state.parties.map((party) => ({ ...party, memberIds: party.memberIds.filter((id) => id !== memberId) })),
    reserveMemberIds: state.reserveMemberIds.filter((id) => id !== memberId),
  };

  if (destination.type === "party") {
    const party = withoutMember.parties.find((candidate) => candidate.id === destination.partyId);
    if (!party) return { state, error: "That party no longer exists." };
    if (party.memberIds.length >= DEFAULT_PARTY_CAPACITY) {
      return { state, error: `${party.name} is already full.` };
    }
    return {
      state: {
        ...withoutMember,
        parties: withoutMember.parties.map((candidate) =>
          candidate.id === party.id ? { ...candidate, memberIds: [...candidate.memberIds, memberId] } : candidate,
        ),
      },
    };
  }

  if (destination.type === "reserve") {
    return { state: { ...withoutMember, reserveMemberIds: [...withoutMember.reserveMemberIds, memberId] } };
  }

  return { state: withoutMember };
}

export function swapMemberPositions(
  state: GuildState,
  partyId: string,
  memberId: string,
  replacementMemberId: string,
): { state: GuildState; error?: string } {
  const party = state.parties.find((candidate) => candidate.id === partyId);
  if (!party) return { state, error: "That party no longer exists." };

  const memberIndex = party.memberIds.indexOf(memberId);
  const replacementIndex = party.memberIds.indexOf(replacementMemberId);
  if (memberIndex < 0 || replacementIndex < 0 || memberIndex === replacementIndex) {
    return { state, error: "Those positions cannot be swapped." };
  }

  const memberIds = [...party.memberIds];
  [memberIds[memberIndex], memberIds[replacementIndex]] = [memberIds[replacementIndex], memberIds[memberIndex]];

  return {
    state: {
      ...state,
      parties: state.parties.map((candidate) => candidate.id === partyId ? { ...candidate, memberIds } : candidate),
    },
  };
}
