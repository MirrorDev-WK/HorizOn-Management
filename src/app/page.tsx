"use client";

import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { snapCenterToCursor } from "@dnd-kit/modifiers";
import {
  ArrowDownUp,
  BookOpen,
  ChevronDown,
  Cross,
  Crosshair,
  Crown,
  Drama,
  EyeOff,
  FileUp,
  FlaskConical,
  Hammer,
  Hand,
  Headphones,
  Menu,
  Music2,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Sword,
  Swords,
  Trash2,
  Users,
  WandSparkles,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createElement, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { DEFAULT_PARTY_CAPACITY, RAGNAROK_NEW_WORLD_CLASS_GROUPS, RAGNAROK_NEW_WORLD_CLASS_OPTION_COUNT } from "@/features/party-manager/constants";
import type { AuctionPage, Destination, GuildMember, GuildState, Party } from "@/features/party-manager/types";
import { clearAuctionPages, createAuctionPage, createEmptyGuildState, deleteAuctionPage, getPartyMembers, getUnassignedMembers, moveMember, swapMemberPositions } from "@/features/party-manager/utils";
import { loadGuildState, resetGuildState, saveGuildState } from "@/lib/storage";
import { readMemberImportFile, type ImportedMember, type MemberImportResult } from "@/lib/member-import";
import { isSupabaseConfigured, loadDiscordVoiceAttendance, loadSharedGuildState, mergeDiscordVoiceAttendance, saveSharedGuildState, subscribeToDiscordVoiceAttendance } from "@/lib/supabase";

type DropId = `party:${string}` | `member:${string}:${string}` | "reserve" | "unassigned";
type NewMemberInput = Pick<GuildMember, "name" | "className" | "cp">;
type AppView = "party" | "auction";
type WheelSpinSession = { pageId: string; itemId: string; itemName: string; bidders: GuildMember[]; eliminatedMember?: GuildMember; finalWinner?: GuildMember; rotationDegrees: number };

const CUSTOM_CLASS_VALUE = "__custom_class__";
const WHEEL_DRAW_DURATION_MS = 7000;

const classIcons: Record<string, LucideIcon> = {
  Paladin: ShieldCheck,
  "High Wizard": WandSparkles,
  "Assassin Cross": Swords,
  "High Priest": Cross,
  "Lord Knight": Sword,
  Sniper: Crosshair,
  Clown: Music2,
  Dancer: Drama,
  Champion: Hand,
  Professor: BookOpen,
  Whitesmith: Hammer,
  Stalker: EyeOff,
  Creator: FlaskConical,
};

function getClassIcon(className: string): LucideIcon {
  return classIcons[className] ?? Swords;
}

function formatCp(cp: number | undefined): string | null {
  return cp === undefined ? null : `CP ${new Intl.NumberFormat("en-US").format(cp)}`;
}

function destinationFromDropId(id: string): Destination | null {
  if (id === "reserve") return { type: "reserve" };
  if (id === "unassigned") return { type: "unassigned" };
  if (id.startsWith("party:")) return { type: "party", partyId: id.slice("party:".length) };
  return null;
}

function memberDropTargetFromId(id: string): { partyId: string; memberId: string } | null {
  if (!id.startsWith("member:")) return null;
  const [partyId, memberId] = id.slice("member:".length).split(":");
  return partyId && memberId ? { partyId, memberId } : null;
}

function DraggableMember({ member, onSelect, compact = false }: { member: GuildMember; onSelect: (member: GuildMember) => void; compact?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `member:${member.id}` });
  const transformStyle = transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined;
  const voiceStatus = !member.isDiscordLinked ? "Not linked" : member.isInMainVoice ? "In voice" : "Away";
  const voiceStatusClass = !member.isDiscordLinked ? "voice-status--unlinked" : member.isInMainVoice ? "voice-status--present" : "voice-status--away";

  return (
    <div className={`member-card-wrap ${isDragging ? "is-dragging" : ""}`}>
      <button
        ref={setNodeRef}
        className={`member-card ${compact ? "member-card--compact" : ""} ${isDragging ? "is-dragging" : ""}`}
        style={{ transform: transformStyle }}
        type="button"
        onClick={() => onSelect(member)}
        {...listeners}
        {...attributes}
      >
        <span className="class-glyph" aria-hidden="true">{createElement(getClassIcon(member.className), { size: compact ? 16 : 20 })}</span>
        <span className="member-card__copy">
          <strong>{member.name}</strong>
          <span>{member.className}</span>
          {formatCp(member.cp) && <span className="member-card__cp">{formatCp(member.cp)}</span>}
        </span>
        <span className={`voice-status ${voiceStatusClass}`} role="img" aria-label={voiceStatus} title={member.discordUsername ? `${voiceStatus} · Discord: ${member.discordUsername}` : `${voiceStatus} · Link this character with /link in Discord`}><Headphones size={14} aria-hidden="true" /><span>{voiceStatus}</span></span>
      </button>
    </div>
  );
}

function DragPreview({ member }: { member: GuildMember }) {
  return <div className="member-card member-card--compact drag-preview"><span className="class-glyph">{createElement(getClassIcon(member.className), { size: 16 })}</span><span className="member-card__copy"><strong>{member.name}</strong><span>{member.className}</span></span></div>;
}

function DroppableArea({ id, children, className = "" }: { id: DropId; children: React.ReactNode; className?: string }) {
  const { isOver, setNodeRef } = useDroppable({ id });
  return <div ref={setNodeRef} className={`${className} ${isOver ? "is-over" : ""}`}>{children}</div>;
}

function PartyCard({ party, members, active, onSelectMember, onRename, onDelete }: {
  party: Party;
  members: GuildMember[];
  active: boolean;
  onSelectMember: (member: GuildMember) => void;
  onRename: (party: Party) => void;
  onDelete: (party: Party) => void;
}) {
  const partyMembers = getPartyMembers(party, members);
  const inVoiceCount = partyMembers.filter((member) => member.isInMainVoice).length;
  const emptySlots = Math.max(0, DEFAULT_PARTY_CAPACITY - partyMembers.length);
  const { isOver, setNodeRef } = useDroppable({ id: `party:${party.id}` });
  return (
    <section ref={setNodeRef} className={`party-card ${isOver ? "is-over" : ""}`} data-active={active}>
      <div className="party-card__top">
        <div>
          <p className="eyebrow">Active party</p>
          <h2>{party.name}</h2>
        </div>
        <div className="party-card__tools">
          <span className="voice-count"><Headphones size={13} />{inVoiceCount}/{partyMembers.length || 0}</span>
          <span className={partyMembers.length === DEFAULT_PARTY_CAPACITY ? "capacity capacity--full" : "capacity"}>{partyMembers.length} / {DEFAULT_PARTY_CAPACITY}</span>
          <button className="icon-button" type="button" aria-label={`Rename ${party.name}`} onClick={() => onRename(party)}><ChevronDown size={17} /></button>
          <button className="icon-button icon-button--danger" type="button" aria-label={`Delete ${party.name}`} onClick={() => onDelete(party)}><Trash2 size={16} /></button>
        </div>
      </div>
      <div className="party-members">
        {partyMembers.map((member) => <DroppableArea key={member.id} id={`member:${party.id}:${member.id}`} className="member-drop-target"><DraggableMember member={member} onSelect={onSelectMember} /></DroppableArea>)}
        {Array.from({ length: emptySlots }, (_, index) => (
          <div className="empty-slot" key={`${party.id}-slot-${index}`}><Plus size={20} /><span>Empty slot</span></div>
        ))}
        {partyMembers.length === 0 && <p className="drop-hint">Drop here or tap a member to assign.</p>}
      </div>
    </section>
  );
}

function wheelSliceColor(index: number): string {
  const hue = (index * 137.508) % 360;
  const lightness = 38 + (index % 3) * 5;
  return `hsl(${hue} 68% ${lightness}%)`;
}

function getRandomIndex(length: number): number {
  const values = new Uint32Array(1);
  window.crypto.getRandomValues(values);
  return values[0] % length;
}

function getRandomRatio(): number {
  const values = new Uint32Array(1);
  window.crypto.getRandomValues(values);
  return values[0] / 4_294_967_296;
}

function pointOnWheel(angle: number, radius: number): { x: number; y: number } {
  const radians = (angle - 90) * (Math.PI / 180);
  return { x: 120 + radius * Math.cos(radians), y: 120 + radius * Math.sin(radians) };
}

function wheelSlicePath(startAngle: number, endAngle: number): string {
  const start = pointOnWheel(startAngle, 112);
  const end = pointOnWheel(endAngle, 112);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M 120 120 L ${start.x} ${start.y} A 112 112 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
}

function BiddingWheel({ bidders, selectedMemberId, isSpinning, rotationDegrees }: { bidders: GuildMember[]; selectedMemberId: string; isSpinning: boolean; rotationDegrees: number }) {
  const wheelRef = useRef<SVGSVGElement>(null);
  const sliceAngle = 360 / bidders.length;
  const labelFontSize = Math.max(8, Math.min(16, 25 - bidders.length));
  const labelLength = Math.max(32, Math.min(105, sliceAngle * 1.35));

  useEffect(() => {
    if (!isSpinning || !wheelRef.current) return;
    const animation = wheelRef.current.animate(
      [
        { transform: "rotate(0deg) scale(.98)" },
        { transform: `rotate(${rotationDegrees}deg) scale(1)` },
      ],
      { duration: WHEEL_DRAW_DURATION_MS, easing: "cubic-bezier(.08,.67,.16,1)", fill: "both" },
    );
    return () => animation.cancel();
  }, [isSpinning, rotationDegrees]);

  return <svg ref={wheelRef} className="wheel-graphic" style={{ transform: isSpinning ? undefined : `rotate(${rotationDegrees}deg)` } as CSSProperties} viewBox="0 0 240 240" role="img" aria-label="Elimination wheel">
    <circle cx="120" cy="120" r="116" className="wheel-graphic__rim" />
    {bidders.map((member, index) => {
      const startAngle = index * sliceAngle;
      const endAngle = (index + 1) * sliceAngle;
      const middleAngle = startAngle + sliceAngle / 2;
      const label = pointOnWheel(middleAngle, 75);
      const labelRotation = middleAngle - 90 + (middleAngle > 90 && middleAngle < 270 ? 180 : 0);
      return <g key={member.id} className={!isSpinning && member.id === selectedMemberId ? "wheel-slice wheel-slice--winner" : "wheel-slice"}>
        <path d={wheelSlicePath(startAngle, endAngle)} fill={wheelSliceColor(index)} />
        <text x={label.x} y={label.y} fontSize={labelFontSize} textLength={labelLength} lengthAdjust="spacingAndGlyphs" transform={`rotate(${labelRotation} ${label.x} ${label.y})`}>{member.name}</text>
      </g>;
    })}
    <circle cx="120" cy="120" r="20" className="wheel-graphic__hub" />
    <text x="120" y="126" className="wheel-graphic__mark">✦</text>
  </svg>;
}

function AuctionBoard({ pages, members, onCreatePage, onDeletePage, onClearAuction, onRenameItem, onAddBidder, onRemoveBidder, onEliminateBidder }: {
  pages: AuctionPage[];
  members: GuildMember[];
  onCreatePage: () => void;
  onDeletePage: (pageId: string) => void;
  onClearAuction: () => void;
  onRenameItem: (pageId: string, itemId: string, name: string) => void;
  onAddBidder: (pageId: string, itemId: string, memberId: string) => void;
  onRemoveBidder: (pageId: string, itemId: string, memberId: string) => void;
  onEliminateBidder: (pageId: string, itemId: string, memberId: string) => void;
}) {
  const [selectedPageId, setSelectedPageId] = useState(pages[0]?.id ?? "");
  const [wheelSession, setWheelSession] = useState<WheelSpinSession | null>(null);
  const [isWheelSpinning, setIsWheelSpinning] = useState(false);
  const page = pages.find((candidate) => candidate.id === selectedPageId) ?? pages[0];
  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);

  useEffect(() => {
    const eliminatedMember = wheelSession?.eliminatedMember;
    if (!wheelSession || !eliminatedMember || !isWheelSpinning) return;
    const timer = window.setTimeout(() => {
      onEliminateBidder(wheelSession.pageId, wheelSession.itemId, eliminatedMember.id);
      setIsWheelSpinning(false);
    }, WHEEL_DRAW_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [isWheelSpinning, onEliminateBidder, wheelSession]);

  const openEliminationWheel = (pageId: string, itemId: string, itemName: string, bidders: GuildMember[]) => {
    setIsWheelSpinning(false);
    setWheelSession({ pageId, itemId, itemName, bidders, rotationDegrees: 0 });
  };

  const startEliminationRound = (pageId: string, itemId: string, itemName: string, bidders: GuildMember[]) => {
    if (bidders.length < 2) return;
    const eliminatedMember = bidders[getRandomIndex(bidders.length)];
    const eliminatedIndex = bidders.findIndex((member) => member.id === eliminatedMember.id);
    const sliceAngle = 360 / bidders.length;
    const sideOffset = getRandomIndex(2) === 0 ? 0.13 + getRandomRatio() * 0.24 : 0.63 + getRandomRatio() * 0.24;
    const rotationDegrees = 360 * (10 + getRandomIndex(4)) - (eliminatedIndex * sliceAngle + sliceAngle * sideOffset);
    const finalists = bidders.filter((member) => member.id !== eliminatedMember.id);
    setWheelSession({ pageId, itemId, itemName, bidders, eliminatedMember, finalWinner: finalists.length === 1 ? finalists[0] : undefined, rotationDegrees });
    setIsWheelSpinning(true);
  };

  if (!page) return null;

  return (
    <section className="auction-board" aria-label="Guild League auction">
      <div className="workspace-head auction-head"><div><p className="eyebrow">Guild League · Auction</p><h1>Item bids</h1><p className="workspace-subtitle">Choose members from the guild roster to record who wants each item.</p></div><div className="auction-head__actions"><button className="secondary-button" type="button" disabled={pages.length <= 1} onClick={() => { if (!window.confirm(`Delete ${page.name}? Its item bids and winner results will be removed.`)) return; setSelectedPageId(pages.find((candidate) => candidate.id !== page.id)?.id ?? ""); onDeletePage(page.id); }}><Trash2 size={16} />Delete page</button><button className="secondary-button" type="button" onClick={onClearAuction}><Trash2 size={16} />Clear auction</button><button className="primary-button" type="button" onClick={onCreatePage}><Plus size={18} />New page</button></div></div>
      <div className="auction-page-tabs" aria-label="Select auction page">{pages.map((candidate) => <button key={candidate.id} className={candidate.id === page.id ? "auction-page-tab auction-page-tab--active" : "auction-page-tab"} type="button" onClick={() => setSelectedPageId(candidate.id)}>{candidate.name}</button>)}</div>
      <div className="auction-items">{page.items.map((item, index) => {
        const bidders = item.bidderMemberIds.flatMap((memberId) => {
          const member = memberById.get(memberId);
          return member ? [member] : [];
        });
        const eliminatedMemberIds = new Set(item.eliminatedBidderMemberIds ?? []);
        const remainingBidders = bidders.filter((member) => !eliminatedMemberIds.has(member.id));
        const winner = item.winnerMemberId ? memberById.get(item.winnerMemberId) : undefined;
        return <section className="auction-item" key={item.id}>
          <div className="auction-item__top"><p className="eyebrow">Item {index + 1}</p><input aria-label={`Item ${index + 1} name`} defaultValue={item.name} onBlur={(event) => onRenameItem(page.id, item.id, event.target.value)} placeholder="Item name" /></div>
          <div className="auction-item__bid"><select aria-label={`Choose bidder for ${item.name}`} defaultValue="" disabled={members.length === 0} onChange={(event) => { if (event.target.value) onAddBidder(page.id, item.id, event.target.value); event.currentTarget.value = ""; }}><option value="">{members.length === 0 ? "Add guild members first" : "Add guild member as bidder"}</option>{members.map((member) => <option key={member.id} value={member.id} disabled={item.bidderMemberIds.includes(member.id)}>{member.name} · {member.className}</option>)}</select></div>
          <div className="auction-bidders" aria-label={`Bidders for ${item.name}`}>{bidders.length > 0 ? bidders.map((member) => <span className={eliminatedMemberIds.has(member.id) ? "auction-bidder auction-bidder--eliminated" : "auction-bidder"} key={member.id}>{member.name}{eliminatedMemberIds.has(member.id) && <em>Out</em>}<button type="button" aria-label={`Remove ${member.name} from ${item.name}`} onClick={() => onRemoveBidder(page.id, item.id, member.id)}><X size={13} /></button></span>) : <span className="auction-empty">No bidders yet</span>}</div>
          {bidders.length > 1 && <div className="auction-wheel-row">
            <div className="auction-winner"><span>{winner ? <>Winner: <strong>{winner.name}</strong></> : `${remainingBidders.length} members remain`}</span>{remainingBidders.length > 1 && <button className="secondary-button" type="button" onClick={() => openEliminationWheel(page.id, item.id, item.name, remainingBidders)}>Spin to remove</button>}</div>
          </div>}
        </section>;
      })}</div>
      {wheelSession && <div className="wheel-modal-backdrop" role="presentation">
        <section className="wheel-modal" role="dialog" aria-modal="true" aria-labelledby="wheel-title" onMouseDown={(event) => event.stopPropagation()}>
          <button className="icon-button wheel-modal__dismiss" type="button" aria-label="Close elimination wheel" onClick={() => { setIsWheelSpinning(false); setWheelSession(null); }}><X size={20} /></button>
          <p className="eyebrow">Guild League elimination</p><h2 id="wheel-title">{wheelSession.itemName}</h2><p className="wheel-modal__message">{isWheelSpinning ? "The wheel is choosing who is out…" : wheelSession.finalWinner ? "Final elimination!" : wheelSession.eliminatedMember ? "One member is out." : "Press spin when everyone is ready."}</p>
          <div className="wheel-modal__stage"><span className="wheel-pointer" aria-hidden="true" /><BiddingWheel bidders={wheelSession.bidders} selectedMemberId={wheelSession.eliminatedMember?.id ?? ""} isSpinning={isWheelSpinning} rotationDegrees={wheelSession.rotationDegrees} /></div>
          {!isWheelSpinning && !wheelSession.eliminatedMember && <button className="primary-button wheel-modal__close" type="button" onClick={() => startEliminationRound(wheelSession.pageId, wheelSession.itemId, wheelSession.itemName, wheelSession.bidders)}>Spin the wheel</button>}
          {!isWheelSpinning && wheelSession.eliminatedMember && <><p className="wheel-result">{wheelSession.finalWinner ? <><X size={20} /><strong>{wheelSession.eliminatedMember.name}</strong> is out. <Crown size={20} /><strong>{wheelSession.finalWinner.name}</strong> wins this item.</> : <><X size={20} /><strong>{wheelSession.eliminatedMember.name}</strong> is out. Spin again with the remaining members.</>}</p><button className="primary-button wheel-modal__close" type="button" onClick={() => wheelSession.finalWinner ? setWheelSession(null) : startEliminationRound(wheelSession.pageId, wheelSession.itemId, wheelSession.itemName, wheelSession.bidders.filter((member) => member.id !== wheelSession.eliminatedMember?.id))}>{wheelSession.finalWinner ? "Continue" : "Spin again"}</button></>}
        </section>
      </div>}
    </section>
  );
}

function MoveSheet({ member, parties, sourcePartyId, onMove, onOpenReorder, onClose }: { member: GuildMember; parties: Party[]; sourcePartyId?: string; onMove: (destination: Destination) => void; onOpenReorder: (partyId: string) => void; onClose: () => void }) {
  const sourceParty = parties.find((party) => party.id === sourcePartyId);
  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="move-sheet" role="dialog" aria-modal="true" aria-labelledby="move-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="move-sheet__head">
          <div><p className="eyebrow">Move character</p><h2 id="move-title">{member.name}</h2><p>{member.className}</p></div>
          <button className="icon-button" type="button" aria-label="Close move options" onClick={onClose}><X size={19} /></button>
        </div>
        <div className="destination-list">
          {parties.map((party) => {
            const isFull = party.memberIds.length >= DEFAULT_PARTY_CAPACITY;
            const isCurrentParty = sourcePartyId === party.id;
            return <button className="destination" type="button" disabled={isCurrentParty || isFull} key={party.id} onClick={() => onMove({ type: "party", partyId: party.id })}><span><Swords size={18} />{party.name}</span><small>{isCurrentParty ? "Current party" : isFull ? "Full" : `${party.memberIds.length} / ${DEFAULT_PARTY_CAPACITY}`}</small></button>;
          })}
          {sourceParty && sourceParty.memberIds.length > 1 && <button className="destination destination--reorder" type="button" onClick={() => onOpenReorder(sourceParty.id)}><span><ArrowDownUp size={18} />Reorder {sourceParty.name}</span><small>Swap positions</small></button>}
          <button className="destination" type="button" onClick={() => onMove({ type: "reserve" })}><span><Crown size={18} />Reserve</span><small>No limit</small></button>
          <button className="destination destination--muted" type="button" onClick={() => onMove({ type: "unassigned" })}><span><Users size={18} />Unassigned</span><small>Remove assignment</small></button>
        </div>
      </section>
    </div>
  );
}

function ReorderSheet({ member, party, members, onSwap, onBack }: { member: GuildMember; party: Party; members: GuildMember[]; onSwap: (replacementMemberId: string) => void; onBack: () => void }) {
  const partyMembers = getPartyMembers(party, members).filter((partyMember) => partyMember.id !== member.id);
  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onBack}>
      <section className="move-sheet" role="dialog" aria-modal="true" aria-labelledby="swap-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="move-sheet__head"><div><p className="eyebrow">Choose a position</p><h2 id="swap-title">Reorder {party.name}</h2><p>Swap {member.name} with another party member.</p></div><button className="icon-button" type="button" aria-label="Back to move options" onClick={onBack}><X size={19} /></button></div>
        <div className="swap-list">{partyMembers.map((replacement) => <button className="swap-member" type="button" key={replacement.id} onClick={() => onSwap(replacement.id)}><span><ArrowDownUp size={17} />{replacement.name}</span><small>{replacement.className}</small></button>)}</div>
      </section>
    </div>
  );
}

function AddMemberSheet({ onAdd, onClose }: { onAdd: (member: NewMemberInput) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [selectedClassName, setSelectedClassName] = useState("");
  const [customClassName, setCustomClassName] = useState("");
  const [cp, setCp] = useState("");
  const [error, setError] = useState("");

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedCp = cp.trim() ? Number(cp) : undefined;
    const className = selectedClassName === CUSTOM_CLASS_VALUE ? customClassName.trim() : selectedClassName;
    if (!name.trim() || !className.trim()) {
      setError("Enter both a character name and class.");
      return;
    }
    if (parsedCp !== undefined && (!Number.isFinite(parsedCp) || parsedCp < 0)) {
      setError("CP must be a positive number.");
      return;
    }
    onAdd({ name: name.trim(), className: className.trim(), cp: parsedCp });
  };

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="move-sheet add-member-sheet" aria-label="Add member" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="move-sheet__head"><div><p className="eyebrow">Guild roster</p><h2>Add Member</h2><p>New members start in Unassigned.</p></div><button className="icon-button" type="button" aria-label="Close add member" onClick={onClose}><X size={19} /></button></div>
        <label className="form-field"><span>Character name</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Bek" /></label>
        <label className="form-field"><span>Class <small>{RAGNAROK_NEW_WORLD_CLASS_OPTION_COUNT} current jobs</small></span><select value={selectedClassName} onChange={(event) => setSelectedClassName(event.target.value)} aria-label="Ragnarok The New World class"><option value="" disabled>Select a class</option>{RAGNAROK_NEW_WORLD_CLASS_GROUPS.map((group) => <optgroup key={group.label} label={group.label}>{group.jobs.map((job) => <option key={job} value={job}>{job}</option>)}</optgroup>)}<option value={CUSTOM_CLASS_VALUE}>Other / custom class</option></select></label>
        {selectedClassName === CUSTOM_CLASS_VALUE && <label className="form-field"><span>Custom class name</span><input value={customClassName} onChange={(event) => setCustomClassName(event.target.value)} placeholder="Enter your server's class name" /></label>}
        <label className="form-field"><span>CP <small>Optional</small></span><input inputMode="numeric" min="0" type="number" value={cp} onChange={(event) => setCp(event.target.value)} placeholder="e.g. 148200" /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button add-member-submit" type="submit"><Plus size={18} />Add Member</button>
      </form>
    </div>
  );
}

function ImportMembersSheet({ existingMemberNames, onImport, onClose }: { existingMemberNames: string[]; onImport: (members: ImportedMember[]) => void; onClose: () => void }) {
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<MemberImportResult | null>(null);
  const [isReading, setIsReading] = useState(false);

  const selectFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsReading(true);
    setFileName(file.name);
    setResult(await readMemberImportFile(file, existingMemberNames));
    setIsReading(false);
  };

  const validMembers = result?.members ?? [];
  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="move-sheet import-members-sheet" role="dialog" aria-modal="true" aria-labelledby="import-members-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="move-sheet__head"><div><p className="eyebrow">Guild roster</p><h2 id="import-members-title">Import members</h2><p>Use Character Name and Class columns. Existing names are skipped.</p></div><button className="icon-button" type="button" aria-label="Close member import" onClick={onClose}><X size={19} /></button></div>
        <label className="import-file-input"><FileUp size={19} /><span>{fileName || "Choose Excel or CSV file"}</span><small>.xlsx or .csv</small><input type="file" accept=".xlsx,.csv" onChange={(event) => void selectFile(event)} /></label>
        {isReading && <p className="import-feedback">Reading roster…</p>}
        {result?.error && <p className="form-error" role="alert">{result.error}</p>}
        {result && !result.error && <div className="import-preview"><p><strong>{validMembers.length}</strong> new members ready to import.</p>{result.duplicateRowCount > 0 && <p>{result.duplicateRowCount} duplicate name{result.duplicateRowCount === 1 ? " was" : "s were"} skipped.</p>}{result.invalidRowCount > 0 && <p>{result.invalidRowCount} incomplete row{result.invalidRowCount === 1 ? " was" : "s were"} skipped.</p>}{validMembers.length > 0 && <ul>{validMembers.slice(0, 5).map((member) => <li key={member.name}><strong>{member.name}</strong><span>{member.className}</span></li>)}{validMembers.length > 5 && <li>+ {validMembers.length - 5} more members</li>}</ul>}</div>}
        <button className="primary-button add-member-submit" type="button" disabled={validMembers.length === 0 || isReading} onClick={() => onImport(validMembers)}><FileUp size={18} />Import {validMembers.length || ""} member{validMembers.length === 1 ? "" : "s"}</button>
      </section>
    </div>
  );
}

export default function PartySetupPage() {
  const [guildState, setGuildState] = useState<GuildState>(createEmptyGuildState);
  const [isReady, setIsReady] = useState(false);
  const [selectedMember, setSelectedMember] = useState<GuildMember | null>(null);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isImportMembersOpen, setIsImportMembersOpen] = useState(false);
  const [reorderPartyId, setReorderPartyId] = useState<string | null>(null);
  const [activeDragMemberId, setActiveDragMemberId] = useState<string | null>(null);
  const [selectedPartyId, setSelectedPartyId] = useState("");
  const [activeView, setActiveView] = useState<AppView>("party");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [databaseMessage, setDatabaseMessage] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => {
    let isCurrent = true;
    const restoreState = async () => {
      let saved: GuildState;
      if (isSupabaseConfigured()) {
        const remote = await loadSharedGuildState();
        if (remote.error) {
          saved = createEmptyGuildState();
          if (isCurrent) setDatabaseMessage("Shared database is unavailable. Fix the Supabase connection before making changes.");
        } else if (remote.state) {
          saved = remote.state;
        } else {
          saved = createEmptyGuildState();
          const error = await saveSharedGuildState(saved);
          if (error && isCurrent) setDatabaseMessage("Could not create the shared guild roster. Fix the Supabase connection before making changes.");
        }
        const attendance = await loadDiscordVoiceAttendance();
        if (attendance.error) {
          if (isCurrent) setDatabaseMessage("Run the latest Supabase schema to enable Discord voice attendance.");
        } else {
          saved = mergeDiscordVoiceAttendance(saved, attendance.attendance);
        }
      } else {
        saved = loadGuildState();
      }
      if (!isCurrent) return;
      setGuildState(saved);
      setSelectedPartyId((current) => current || saved.parties[0]?.id || "");
      setIsReady(true);
    };
    void restoreState();
    return () => { isCurrent = false; };
  }, []);

  useEffect(() => {
    if (!isReady) return;
    if (isSupabaseConfigured()) {
      void saveSharedGuildState(guildState).then((error) => {
        if (error) setDatabaseMessage("Shared database is unavailable. Changes could not be saved.");
        else setDatabaseMessage("");
      });
    } else {
      saveGuildState(guildState);
    }
  }, [guildState, isReady]);

  useEffect(() => {
    if (!isReady || !isSupabaseConfigured()) return;
    let isCurrent = true;
    const refreshAttendance = () => {
      void (async () => {
        const result = await loadDiscordVoiceAttendance();
        if (!isCurrent || result.error) return;
        setGuildState((current) => mergeDiscordVoiceAttendance(current, result.attendance));
      })();
    };
    const unsubscribe = subscribeToDiscordVoiceAttendance(refreshAttendance);
    return () => {
      isCurrent = false;
      unsubscribe();
    };
  }, [isReady]);

  const unassignedMembers = useMemo(() => getUnassignedMembers(guildState, guildState.members), [guildState]);
  const inVoiceMemberCount = useMemo(() => guildState.members.filter((member) => member.isInMainVoice).length, [guildState.members]);
  const linkedAwayMemberCount = useMemo(() => guildState.members.filter((member) => member.isDiscordLinked && !member.isInMainVoice).length, [guildState.members]);
  const notLinkedMemberCount = useMemo(() => guildState.members.filter((member) => !member.isDiscordLinked).length, [guildState.members]);
  const filteredUnassignedMembers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return unassignedMembers.filter((member) => !needle || `${member.name} ${member.className}`.toLowerCase().includes(needle));
  }, [unassignedMembers, search]);

  const announce = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  };

  const moveSelectedMember = (memberId: string, destination: Destination) => {
    setGuildState((current) => {
      const result = moveMember(current, memberId, destination);
      if (result.error) announce(result.error);
      return result.state;
    });
    setSelectedMember(null);
    setReorderPartyId(null);
  };

  const swapSelectedMemberPosition = (replacementMemberId: string) => {
    if (!selectedMember || !reorderPartyId) return;
    setGuildState((current) => {
      const result = swapMemberPositions(current, reorderPartyId, selectedMember.id, replacementMemberId);
      if (result.error) announce(result.error);
      return result.state;
    });
    setSelectedMember(null);
    setReorderPartyId(null);
  };

  const addMember = (member: NewMemberInput) => {
    const id = globalThis.crypto?.randomUUID?.() ?? `member-${Date.now()}`;
    setGuildState((current) => ({ ...current, members: [...current.members, { ...member, id, isInMainVoice: false }] }));
    setIsAddMemberOpen(false);
    announce(`${member.name} was added to Unassigned.`);
  };

  const importMembers = (members: ImportedMember[]) => {
    setGuildState((current) => ({
      ...current,
      members: [...current.members, ...members.map((member) => ({ ...member, id: globalThis.crypto?.randomUUID?.() ?? `member-${Date.now()}-${member.name}`, isInMainVoice: false }))],
    }));
    setIsImportMembersOpen(false);
    announce(`${members.length} member${members.length === 1 ? "" : "s"} imported to Unassigned.`);
  };

  const createParty = () => {
    const name = window.prompt("Name this party", `Party ${guildState.parties.length + 1}`)?.trim();
    if (!name) return;
    const party = { id: `party-${Date.now()}`, name, memberIds: [] };
    setGuildState((current) => ({ ...current, parties: [...current.parties, party] }));
    setSelectedPartyId(party.id);
  };

  const renameParty = (party: Party) => {
    const name = window.prompt("Rename party", party.name)?.trim();
    if (!name || name === party.name) return;
    setGuildState((current) => ({ ...current, parties: current.parties.map((item) => item.id === party.id ? { ...item, name } : item) }));
  };

  const deleteParty = (party: Party) => {
    const confirmation = party.memberIds.length > 0 ? `Delete ${party.name}? Its ${party.memberIds.length} members will return to Unassigned.` : `Delete ${party.name}?`;
    if (!window.confirm(confirmation)) return;
    setGuildState((current) => ({ ...current, parties: current.parties.filter((item) => item.id !== party.id) }));
    setSelectedPartyId((current) => current === party.id ? guildState.parties.find((item) => item.id !== party.id)?.id ?? "" : current);
  };

  const addAuctionPage = () => {
    setGuildState((current) => {
      const pageNumber = current.auctionPages.length + 1;
      const page = createAuctionPage(`auction-page-${Date.now()}`, `Page ${pageNumber}`);
      return { ...current, auctionPages: [...current.auctionPages, page] };
    });
  };

  const removeAuctionPage = (pageId: string) => {
    setGuildState((current) => ({ ...current, auctionPages: deleteAuctionPage(current.auctionPages, pageId) }));
    announce("Auction page deleted.");
  };

  const clearAuction = () => {
    if (!window.confirm("Clear the entire Auction and reset it to one empty Page 1? This removes every page, item name, bidder, and winner.")) return;
    setGuildState((current) => ({ ...current, auctionPages: clearAuctionPages() }));
    announce("Auction reset to Page 1.");
  };

  const renameAuctionItem = (pageId: string, itemId: string, rawName: string) => {
    const name = rawName.trim() || "Untitled item";
    setGuildState((current) => ({
      ...current,
      auctionPages: current.auctionPages.map((page) => page.id !== pageId ? page : {
        ...page,
        items: page.items.map((item) => item.id === itemId ? { ...item, name } : item),
      }),
    }));
  };

  const addAuctionBidder = (pageId: string, itemId: string, memberId: string) => {
    setGuildState((current) => {
      const item = current.auctionPages.find((page) => page.id === pageId)?.items.find((candidate) => candidate.id === itemId);
      if (!item || item.bidderMemberIds.includes(memberId)) return current;
      return {
        ...current,
        auctionPages: current.auctionPages.map((page) => page.id !== pageId ? page : {
          ...page,
          items: page.items.map((candidate) => candidate.id === itemId ? { ...candidate, bidderMemberIds: [...candidate.bidderMemberIds, memberId], eliminatedBidderMemberIds: [], winnerMemberId: undefined } : candidate),
        }),
      };
    });
  };

  const removeAuctionBidder = (pageId: string, itemId: string, memberId: string) => {
    setGuildState((current) => ({
      ...current,
      auctionPages: current.auctionPages.map((page) => page.id !== pageId ? page : {
        ...page,
        items: page.items.map((item) => item.id === itemId ? { ...item, bidderMemberIds: item.bidderMemberIds.filter((id) => id !== memberId), eliminatedBidderMemberIds: [], winnerMemberId: undefined } : item),
      }),
  }));
  };

  const eliminateAuctionBidder = (pageId: string, itemId: string, memberId: string) => {
    setGuildState((current) => {
      const item = current.auctionPages.find((page) => page.id === pageId)?.items.find((candidate) => candidate.id === itemId);
      const eliminatedBidderMemberIds = item?.eliminatedBidderMemberIds ?? [];
      const remainingBidderIds = item?.bidderMemberIds.filter((id) => !eliminatedBidderMemberIds.includes(id)) ?? [];
      if (!item || !remainingBidderIds.includes(memberId) || remainingBidderIds.length <= 1) return current;
      const nextEliminatedBidderMemberIds = [...eliminatedBidderMemberIds, memberId];
      const nextRemainingBidderIds = item.bidderMemberIds.filter((id) => !nextEliminatedBidderMemberIds.includes(id));
      return {
        ...current,
        auctionPages: current.auctionPages.map((page) => page.id !== pageId ? page : {
          ...page,
          items: page.items.map((candidate) => candidate.id === itemId ? { ...candidate, eliminatedBidderMemberIds: nextEliminatedBidderMemberIds, winnerMemberId: nextRemainingBidderIds.length === 1 ? nextRemainingBidderIds[0] : undefined } : candidate),
        }),
      };
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const memberId = String(event.active.id).replace("member:", "");
    const memberTarget = event.over ? memberDropTargetFromId(String(event.over.id)) : null;
    if (memberTarget) {
      const sourcePartyId = guildState.parties.find((party) => party.memberIds.includes(memberId))?.id;
      if (sourcePartyId === memberTarget.partyId) {
        setGuildState((current) => swapMemberPositions(current, memberTarget.partyId, memberId, memberTarget.memberId).state);
      } else {
        moveSelectedMember(memberId, { type: "party", partyId: memberTarget.partyId });
      }
      return;
    }
    const destination = event.over ? destinationFromDropId(String(event.over.id)) : null;
    if (destination) moveSelectedMember(memberId, destination);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragMemberId(String(event.active.id).replace("member:", ""));
  };

  const activeDragMember = guildState.members.find((member) => member.id === activeDragMemberId);

  return (
    <DndContext id="horizon-party-manager-dnd" sensors={sensors} onDragStart={handleDragStart} onDragEnd={(event) => { handleDragEnd(event); setActiveDragMemberId(null); }} onDragCancel={() => setActiveDragMemberId(null)}>
      <main className={`app-shell ${activeDragMemberId ? "is-dragging" : ""}`}>
        <aside className="sidebar">
          <div className="brand"><span className="brand-mark"><Sparkles size={21} /></span><span><strong>HorizOn</strong><small>Guild League</small></span></div>
          <nav><button className={activeView === "party" ? "nav-item nav-item--active" : "nav-item"} type="button" onClick={() => setActiveView("party")}><Swords size={19} />Party Setup</button><button className={activeView === "auction" ? "nav-item nav-item--active" : "nav-item"} type="button" onClick={() => setActiveView("auction")}><Hammer size={19} />Auction</button></nav>
          <div className="sidebar-note"><Crown size={17} /><span>Ready for<br /><strong>Guild League</strong></span></div>
        </aside>

        <header className="mobile-header"><div className="brand"><span className="brand-mark"><Sparkles size={18} /></span><strong>HorizOn</strong></div><div className="mobile-view-tabs"><button className={activeView === "party" ? "mobile-view-tab mobile-view-tab--active" : "mobile-view-tab"} type="button" onClick={() => setActiveView("party")}>Party</button><button className={activeView === "auction" ? "mobile-view-tab mobile-view-tab--active" : "mobile-view-tab"} type="button" onClick={() => setActiveView("auction")}>Auction</button></div><button className="icon-button" type="button" aria-label="Menu"><Menu size={20} /></button></header>

        {activeView === "party" && <aside className="member-pool" id="member-pool">
          <DroppableArea id="unassigned" className="unassigned-zone drop-zone">
          <div className="pool-title"><div><p className="eyebrow">Guild roster</p><h1>Unassigned <span>{unassignedMembers.length}</span></h1></div><div className="pool-actions"><button className="icon-button" type="button" aria-label="Import members" onClick={() => setIsImportMembersOpen(true)}><FileUp size={17} /></button><button className="icon-button" type="button" aria-label="Add member" onClick={() => setIsAddMemberOpen(true)}><Plus size={18} /></button></div></div>
          <label className="search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or class" aria-label="Search unassigned members" /></label>
          <div className="member-list">
            {filteredUnassignedMembers.map((member) => <DraggableMember key={member.id} member={member} compact onSelect={setSelectedMember} />)}
            {filteredUnassignedMembers.length === 0 && <p className="empty-list">{unassignedMembers.length === 0 ? "No unassigned members yet." : "No matching members."}</p>}
          </div>
          </DroppableArea>
        </aside>}

        {activeView === "party" ? <section className="workspace" id="party-setup">
          <div className="workspace-head"><div><p className="eyebrow">Guild League · Party setup</p><h1>Build the lineup</h1><p className="workspace-subtitle">Assign every member once, then check your live main voice channel.</p></div><div className="workspace-head__actions"><div className="attendance-summary" aria-label={`Guild attendance: ${inVoiceMemberCount} in voice, ${linkedAwayMemberCount} away, ${notLinkedMemberCount} not linked`}><span className="attendance-summary__item attendance-summary__item--present"><Headphones size={14} />{inVoiceMemberCount} In voice</span><span className="attendance-summary__item attendance-summary__item--away">{linkedAwayMemberCount} Away</span><span className="attendance-summary__item">{notLinkedMemberCount} Not linked</span></div><button className="primary-button" type="button" onClick={createParty}><Plus size={18} />Create Party</button></div></div>
          <div className="mobile-party-tabs" aria-label="Select party">
            {guildState.parties.map((party) => <button key={party.id} className={selectedPartyId === party.id ? "party-tab party-tab--active" : "party-tab"} type="button" onClick={() => setSelectedPartyId(party.id)}>{party.name}</button>)}
          </div>
          <div className="party-grid">
            {guildState.parties.map((party) => <PartyCard key={party.id} party={party} members={guildState.members} active={party.id === selectedPartyId} onSelectMember={setSelectedMember} onRename={renameParty} onDelete={deleteParty} />)}
            {guildState.parties.length === 0 && <div className="no-parties"><Swords size={25} /><h2>No parties yet</h2><p>Create your first party to start organizing HorizOn.</p><button className="primary-button" type="button" onClick={createParty}><Plus size={18} />Create Party</button></div>}
          </div>
          <DroppableArea id="reserve" className="reserve-panel drop-zone">
            <div className="reserve-panel__head"><div><p className="eyebrow">Flexible bench</p><h2><Crown size={19} /> Reserve <span>{guildState.reserveMemberIds.length}</span></h2></div><small>No party capacity</small></div>
            <div className="reserve-members">{guildState.members.filter((member) => guildState.reserveMemberIds.includes(member.id)).map((member) => <DraggableMember compact key={member.id} member={member} onSelect={setSelectedMember} />)}{guildState.reserveMemberIds.length === 0 && <p className="empty-list">Drop members here to keep them ready.</p>}</div>
          </DroppableArea>
          <div className="workspace-footer"><button type="button" onClick={() => { setGuildState((current) => resetGuildState(current)); announce("Party assignments reset."); }}><RotateCcw size={16} />Reset Party Setup</button></div>
        </section> : <section className="workspace auction-workspace" id="auction"><AuctionBoard pages={guildState.auctionPages} members={guildState.members} onCreatePage={addAuctionPage} onDeletePage={removeAuctionPage} onClearAuction={clearAuction} onRenameItem={renameAuctionItem} onAddBidder={addAuctionBidder} onRemoveBidder={removeAuctionBidder} onEliminateBidder={eliminateAuctionBidder} /></section>}
        {databaseMessage && <p className="database-notice" role="status">{databaseMessage}</p>}
        {toast && <p className="toast" role="status">{toast}</p>}
      </main>
      <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>{activeDragMember ? <DragPreview member={activeDragMember} /> : null}</DragOverlay>
      {selectedMember && !reorderPartyId && <MoveSheet member={selectedMember} parties={guildState.parties} sourcePartyId={guildState.parties.find((party) => party.memberIds.includes(selectedMember.id))?.id} onMove={(destination) => moveSelectedMember(selectedMember.id, destination)} onOpenReorder={setReorderPartyId} onClose={() => setSelectedMember(null)} />}
      {selectedMember && reorderPartyId && guildState.parties.find((party) => party.id === reorderPartyId) && <ReorderSheet member={selectedMember} party={guildState.parties.find((party) => party.id === reorderPartyId)!} members={guildState.members} onSwap={swapSelectedMemberPosition} onBack={() => setReorderPartyId(null)} />}
      {isAddMemberOpen && <AddMemberSheet onAdd={addMember} onClose={() => setIsAddMemberOpen(false)} />}
      {isImportMembersOpen && <ImportMembersSheet existingMemberNames={guildState.members.map((member) => member.name)} onImport={importMembers} onClose={() => setIsImportMembersOpen(false)} />}
    </DndContext>
  );
}
