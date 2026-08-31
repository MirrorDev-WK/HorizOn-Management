import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PARTY_CAPACITY, RAGNAROK_NEW_WORLD_CLASS_GROUPS, RAGNAROK_NEW_WORLD_CLASS_OPTION_COUNT } from "../src/features/party-manager/constants";
import type { GuildMember, GuildState } from "../src/features/party-manager/types";
import { clearAuctionPages, createAuctionPage, deleteAuctionPage, getUnassignedMembers, moveMember, normalizeGuildState, swapMemberPositions } from "../src/features/party-manager/utils";
import { parseMemberImportRows } from "../src/lib/member-import";
import { parseDiscordLinkImportRows } from "../src/lib/discord-link-import";

const testMembers: GuildMember[] = [
  { id: "bek", name: "Bek", className: "Swordsman" },
  { id: "astra", name: "Astra", className: "Mage" },
  { id: "mira", name: "Mira", className: "Priest" },
  { id: "thorn", name: "Thorn", className: "Archer" },
  { id: "lune", name: "Lune", className: "Thief" },
  { id: "ciel", name: "Ciel", className: "Merchant" },
];

const freshState = (): GuildState => ({
  members: testMembers,
  parties: [
    { id: "first", name: "First", memberIds: ["bek"] },
    { id: "second", name: "Second", memberIds: [] },
  ],
  reserveMemberIds: [],
  auctionPages: [createAuctionPage("auction-page-1", "Page 1")],
});

test("moving a member removes its previous assignment", () => {
  const result = moveMember(freshState(), "bek", { type: "party", partyId: "second" });
  assert.deepEqual(result.state.parties[0].memberIds, []);
  assert.deepEqual(result.state.parties[1].memberIds, ["bek"]);
  assert.equal(getUnassignedMembers(result.state, testMembers).some((member) => member.id === "bek"), false);
});

test("a full party rejects another member without altering their assignment", () => {
  const state = freshState();
  state.parties[1].memberIds = testMembers.slice(1, DEFAULT_PARTY_CAPACITY + 1).map((member) => member.id);
  const result = moveMember(state, "bek", { type: "party", partyId: "second" });
  assert.match(result.error ?? "", /already full/i);
  assert.deepEqual(result.state, state);
});

test("normalization removes duplicates and invalid member ids", () => {
  const normalized = normalizeGuildState({
    members: testMembers,
    parties: [{ id: "first", name: "First", memberIds: ["bek", "bek", "missing"] }],
    reserveMemberIds: ["bek", "astra"],
    auctionPages: [
      {
        id: "auction-page-1",
        name: "Page 1",
        items: [{ id: "one", name: "Sword", bidderMemberIds: ["bek", "bek", "missing"], eliminatedBidderMemberIds: ["missing"], winnerMemberId: "bek" }],
      },
    ],
  }, testMembers);
  assert.deepEqual(normalized.parties[0].memberIds, ["bek"]);
  assert.deepEqual(normalized.reserveMemberIds, ["astra"]);
  assert.deepEqual(normalized.auctionPages[0].items[0].bidderMemberIds, ["bek"]);
  assert.deepEqual(normalized.auctionPages[0].items[0].eliminatedBidderMemberIds, []);
  assert.equal(normalized.auctionPages[0].items[0].winnerMemberId, "bek");
  assert.equal(normalized.auctionPages[0].items.length, 4);
});

test("unassigned contains members regardless of Discord voice status", () => {
  const state = freshState();
  state.members = state.members.map((member) => ({ ...member, isInMainVoice: member.id === "mira" }));
  assert.deepEqual(getUnassignedMembers(state, state.members).map((member) => member.id), ["astra", "mira", "thorn", "lune", "ciel"]);
});

test("clearing auction pages restores one empty default Page 1", () => {
  const cleared = clearAuctionPages();
  assert.equal(cleared.length, 1);
  assert.equal(cleared[0].id, "auction-page-1");
  assert.equal(cleared[0].name, "Page 1");
  assert.equal(cleared[0].items.length, 4);
  assert.deepEqual(cleared[0].items[0], { id: "auction-page-1-item-1", name: "Item 1", bidderMemberIds: [] });
});

test("normalization keeps an elimination draw winner only after one bidder remains", () => {
  const normalized = normalizeGuildState({
    members: testMembers,
    parties: [],
    reserveMemberIds: [],
    auctionPages: [{
      id: "auction-page-1",
      name: "Page 1",
      items: [{ id: "one", name: "Crown", bidderMemberIds: ["bek", "mira"], eliminatedBidderMemberIds: ["bek"], winnerMemberId: "mira" }],
    }],
  });
  assert.deepEqual(normalized.auctionPages[0].items[0].eliminatedBidderMemberIds, ["bek"]);
  assert.equal(normalized.auctionPages[0].items[0].winnerMemberId, "mira");
});

test("deleting an auction page keeps one page available", () => {
  const first = createAuctionPage("auction-page-1", "Page 1");
  const second = createAuctionPage("auction-page-2", "Page 2");
  assert.deepEqual(deleteAuctionPage([first, second], first.id), [second]);
  assert.deepEqual(deleteAuctionPage([first], first.id), [first]);
});

test("swapping positions only changes the order within one party", () => {
  const state = freshState();
  state.parties[0].memberIds = ["bek", "astra", "mira"];
  const result = swapMemberPositions(state, "first", "bek", "mira");
  assert.deepEqual(result.state.parties[0].memberIds, ["mira", "astra", "bek"]);
  assert.deepEqual(result.state.parties[1].memberIds, []);
});

test("the Add Member dropdown contains 14 distinct Ragnarok The New World jobs", () => {
  const jobs = RAGNAROK_NEW_WORLD_CLASS_GROUPS.flatMap((group) => group.jobs);
  assert.equal(RAGNAROK_NEW_WORLD_CLASS_OPTION_COUNT, 14);
  assert.equal(new Set(jobs).size, RAGNAROK_NEW_WORLD_CLASS_OPTION_COUNT);
});

test("member import accepts supported headers and skips invalid or duplicate names", () => {
  const result = parseMemberImportRows([
    ["Character Name", "Class"],
    ["Bek", "Swordsman"],
    ["Luna", "Priest"],
    ["Luna", "Mage"],
    ["Missing class", ""],
  ], ["Bek"]);
  assert.deepEqual(result.members, [{ name: "Luna", className: "Priest" }]);
  assert.equal(result.duplicateRowCount, 2);
  assert.equal(result.invalidRowCount, 1);
});

test("Discord link import requires text Discord User IDs and rejects repeated links", () => {
  const result = parseDiscordLinkImportRows([
    ["Character Name", "Discord User ID"],
    ["Bek", "123456789012345678"],
    ["Luna", 123456789012345678],
    ["Bek", "234567890123456789"],
  ]);
  assert.deepEqual(result.rows, [{ characterName: "Bek", discordUserId: "123456789012345678" }]);
  assert.equal(result.errors.length, 2);
  assert.match(result.errors[0], /stored as Text/i);
  assert.match(result.errors[1], /repeated/i);
});
