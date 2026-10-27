import type { Member } from '../parties/types';
import type { GovContext, Action } from './state';
import type { GovState, SwitchingRequest } from './types';
import { confidenceVote } from './parliament';
import { PLAYER_ID } from '../election/types';

const clamp = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

export function seedSwitchingRequests(ctx: GovContext, members: Member[]): SwitchingRequest[] {
  const rival = Object.keys(ctx.result.seats).find((id) => id !== PLAYER_ID && (ctx.result.seats[id] ?? 0) > 0) ?? 'IND';
  const oppositionMember = members.find((m) => m.status === 'active');
  return [
    { id: 'switch-in-1', direction: 'in', politicianName: 'Kabir Malhotra', partyId: rival, constituency: 'C-042', loyalty: 63, reason: 'Our party has no credible path to government.', status: 'pending' },
    { id: 'switch-in-2', direction: 'in', politicianName: 'Nandita Rao', partyId: rival, constituency: 'C-117', loyalty: 48, reason: 'I want a ministry with real delivery power.', status: 'pending' },
    ...(oppositionMember ? [{ id: `switch-out-${oppositionMember.id}`, direction: 'out' as const, politicianName: oppositionMember.name, partyId: PLAYER_ID, constituency: oppositionMember.preferredConstituency, loyalty: oppositionMember.loyalty, reason: oppositionMember.opposesLeadership ? 'I no longer trust the party leadership.' : 'I have been promised a stronger political future.', memberId: oppositionMember.id, status: 'pending' as const }] : []),
  ];
}

export function breakAlliance(s: GovState, ctx: GovContext, partnerId: string, day: number): Action {
  if (s.status !== 'governing') return { ok: false, error: 'The government has already fallen.' };
  if (!s.partners.includes(partnerId)) return { ok: false, error: 'That party is not supporting your government.' };
  const next = { ...s, partners: s.partners.filter((p) => p !== partnerId), satisfaction: { ...s.satisfaction } };
  delete next.satisfaction[partnerId];
  const seats = [ctx.government.leaderId, ...next.partners].reduce((n, p) => n + (ctx.result.seats[p] ?? 0), 0);
  if (seats < 91) {
    const vote = confidenceVote({ seed: ctx.seed, day, seats: ctx.result.seats, ideologies: ctx.ideologies, leaderId: ctx.government.leaderId, govParties: [ctx.government.leaderId, ...next.partners], approval: next.approval });
    const survived = vote.survives;
    return { ok: true, state: { ...next, status: survived ? 'governing' : 'fallen', fallenReason: survived ? null : `Lost a confidence vote after ending the alliance with ${partnerId}.`, history: [`Day ${day}: Alliance with ${partnerId} ended. ${survived ? 'Confidence vote survived.' : 'Confidence vote lost; the government fell.'}`, ...next.history].slice(0, 40) }, message: survived ? `Alliance ended. Confidence vote survived with ${vote.yes} votes.` : `Alliance ended. Confidence vote lost (${vote.yes} yes). The government has fallen.` };
  }
  return { ok: true, state: { ...next, history: [`Day ${day}: Alliance with ${partnerId} ended by the Prime Minister.`, ...next.history].slice(0, 40) }, message: `Alliance with ${partnerId} ended. Your government still has ${seats} seats.` };
}

export function applyIncomingSwitch(s: GovState, req: SwitchingRequest, day: number, negotiated: boolean): Action {
  if (s.status !== 'governing') return { ok: false, error: 'The government has fallen.' };
  const boost = negotiated ? 8 : 2;
  return { ok: true, state: { ...s, approval: clamp(s.approval + boost), history: [`Day ${day}: ${req.politicianName} joined the ruling party${negotiated ? ' after negotiations' : ''}.`, ...s.history].slice(0, 40) }, message: `${req.politicianName} has joined the ruling party.` };
}

export function applyOutgoingSwitch(s: GovState, req: SwitchingRequest, day: number): Action {
  if (s.status !== 'governing') return { ok: false, error: 'The government has fallen.' };
  return { ok: true, state: { ...s, approval: clamp(s.approval - 4), history: [`Day ${day}: ${req.politicianName} defected to the opposition.`, ...s.history].slice(0, 40) }, message: `${req.politicianName} left the ruling party. Anti-defection rules require a by-election review.` };
}

export function resignMinister(s: GovState, memberId: string, day: number): GovState {
  const cabinet = Object.fromEntries(Object.entries(s.cabinet).filter(([, id]) => id !== memberId));
  return { ...s, cabinet, approval: clamp(s.approval - 2), history: [`Day ${day}: A minister resigned from the cabinet.`, ...s.history].slice(0, 40) };
}
