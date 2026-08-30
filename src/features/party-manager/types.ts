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

export type GuildState = {
  members: GuildMember[];
  parties: Party[];
  reserveMemberIds: string[];
};

export type Destination =
  | { type: "party"; partyId: string }
  | { type: "reserve" }
  | { type: "unassigned" };
