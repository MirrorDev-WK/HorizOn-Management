import { DEFAULT_PARTY_CAPACITY } from "@/features/party-manager/constants";
import type { AuctionItem, AuctionPage, Destination, GuildMember, GuildState, Party } from "@/features/party-manager/types";

export function createEmptyGuildState(): GuildState {
  return { members: [], parties: [], reserveMemberIds: [], auctionPages: [createAuctionPage("auction-page-1", "Page 1")] };
}

export function createAuctionPage(id: string, name: string): AuctionPage {
  return {
    id,
    name,
    items: Array.from({ length: 4 }, (_, index) => ({ id: `${id}-item-${index + 1}`, name: `Item ${index + 1}`, bidderMemberIds: [] })),
  };
}

export function clearAuctionPages(): AuctionPage[] {
  return [createAuctionPage("auction-page-1", "Page 1")];
}

export function deleteAuctionPage(pages: AuctionPage[], pageId: string): AuctionPage[] {
  return pages.length > 1 ? pages.filter((page) => page.id !== pageId) : pages;
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
  const auctionPages = normalizeAuctionPages(state.auctionPages, validIds);
  return { members: normalizedMembers, parties, reserveMemberIds, auctionPages };
}

function normalizeAuctionPages(pages: AuctionPage[], validMemberIds: Set<string>): AuctionPage[] {
  const normalized = pages.map((page, pageIndex) => ({
    id: page.id.trim() || `auction-page-${pageIndex + 1}`,
    name: page.name.trim() || `Page ${pageIndex + 1}`,
    items: page.items.slice(0, 4).map((item, itemIndex): AuctionItem => {
      const bidderMemberIds = [...new Set(item.bidderMemberIds.filter((memberId) => validMemberIds.has(memberId)))];
      const eliminatedBidderMemberIds = [...new Set((item.eliminatedBidderMemberIds ?? []).filter((memberId) => bidderMemberIds.includes(memberId)))];
      const remainingBidderIds = bidderMemberIds.filter((memberId) => !eliminatedBidderMemberIds.includes(memberId));
      return {
        id: item.id.trim() || `${page.id || `auction-page-${pageIndex + 1}`}-item-${itemIndex + 1}`,
        name: item.name.trim() || `Item ${itemIndex + 1}`,
        bidderMemberIds,
        eliminatedBidderMemberIds,
        winnerMemberId: remainingBidderIds.length === 1 && item.winnerMemberId === remainingBidderIds[0] ? item.winnerMemberId : undefined,
      };
    }),
  }));
  const completePages = normalized.map((page) => ({
    ...page,
    items: [...page.items, ...createAuctionPage(page.id, page.name).items.slice(page.items.length)],
  }));
  return completePages.length > 0 ? completePages : [createAuctionPage("auction-page-1", "Page 1")];
}

export function getUnassignedMembers(state: GuildState, members: GuildMember[]): GuildMember[] {
  const occupied = new Set([...state.reserveMemberIds, ...state.parties.flatMap((party) => party.memberIds)]);
  return members.filter((member) => !occupied.has(member.id));
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
    auctionPages: state.auctionPages,
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
