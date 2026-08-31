export type GuildMember = {
  id: string;
  name: string;
  className: string;
  avatar?: string;
  cp?: number;
  isDiscordLinked?: boolean;
  discordUsername?: string;
  isInMainVoice?: boolean;
};

export type Party = {
  id: string;
  name: string;
  memberIds: string[];
};

export type AuctionItem = {
  id: string;
  name: string;
  bidderMemberIds: string[];
  eliminatedBidderMemberIds?: string[];
  winnerMemberId?: string;
};

export type AuctionPage = {
  id: string;
  name: string;
  items: AuctionItem[];
};

export type GuildState = {
  members: GuildMember[];
  parties: Party[];
  reserveMemberIds: string[];
  auctionPages: AuctionPage[];
};

export type Destination =
  | { type: "party"; partyId: string }
  | { type: "reserve" }
  | { type: "unassigned" };
