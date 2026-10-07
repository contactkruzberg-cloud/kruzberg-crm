// Follow-up email ("Relancer" in the pipeline), written by Claude from the
// deal's history. Pure functions: the route gathers the data, this builds the prompt.
import type { Activity, Contact, Deal, Venue } from '@/types/database';
import type { SentMessage } from '@/lib/email/sent';

export const RELANCE_INSTRUCTIONS = `Tu rédiges des mails de relance de booking pour KRUZBERG, au nom de Greg (Greg Nacht), qui s'occupe du booking.

LE GROUPE (faits vérifiés : n'invente rien d'autre, ne déforme rien)
- KRUZBERG : quatuor lyonnais de post-punk noisy (guitares saturées, basse pulsante, batterie nerveuse, voix entre passages scandés et chantés), entre Joy Division et IDLES ; influences citées dans nos mails : Fontaines D.C., IDLES, Shame. En live, une montée en pression tenue du premier au dernier morceau.
- Accompagnement pro : Le Labo du Conservatoire (Lyon). En préparation : un EP pour 2027.
- SORTIES, dans l'ordre (un triptyque de trois singles, désormais complet) :
  1. « BlackMud Manor » — 12 septembre 2025 (premier single)
  2. « Where I Belong » — 3 avril 2026 (avec une live session vidéo : https://youtu.be/PIi2OHkTvxw)
  3. « Two½ Hotel Stars » (« Two and a Half Hotel Stars ») — 17 juillet 2026 : c'est notre DERNIER single, il clôt le triptyque.
  Écris toujours ces titres exactement ainsi. Ne dis jamais que « Where I Belong » est le dernier single. Ne parle d'une sortie que si c'est utile au message, avec sa vraie date.
- Liens autorisés (1 ou 2 au maximum par mail) : écoute https://open.spotify.com/artist/6bEitWn6HPHOWjZU023ELn · live session https://youtu.be/PIi2OHkTvxw · dossier de presse https://kruzberg.com/wp-content/uploads/2026/05/KRUZBERG_EPK_2026.pdf (EN : https://kruzberg.com/wp-content/uploads/2026/05/KRUZBERG_EPK_2026_EN.pdf) · site kruzberg.com · Instagram @kruzberg_noise.

CE QU'EST UNE BONNE RELANCE
- Courte : 60 à 120 mots, 2 ou 3 petits paragraphes. Pas de pavé, pas de liste à puces.
- Précise et propre à CETTE opportunité : elle rappelle en une phrase le premier message (sa date, ce qui était demandé : date précise, 1re partie, festival, représentation, label…) sans le recopier, avec les vrais noms (lieu, festival, groupe, date) tirés du contexte.
- Elle apporte UNE raison concrète de répondre maintenant quand le contexte en fournit une : date de concert ou deadline qui approche, ou une NOUVEAUTÉ réelle depuis le premier mail. Compare la date du premier mail aux dates de sortie : si « Two½ Hotel Stars » (17/07/2026) est sorti APRÈS le premier mail, c'est une vraie nouvelle à mentionner (« depuis mon message, nous avons sorti Two½ Hotel Stars, qui clôt notre triptyque ») ; s'il est sorti avant, n'en fais pas une nouveauté. Sinon, reste simple.
- Une seule demande claire à la fin (une réponse, même négative ; un créneau ; la bonne personne à contacter).
- Ton : chaleureux, direct, pro, sans flagornerie ni excuses (« désolé de vous relancer », « je me permets de revenir vers vous » interdits), sans pression.
- Tutoiement si le contact est noté « tu » ou si le premier mail tutoyait ; sinon vouvoiement.
- Langue : celle du premier mail ; à défaut, français pour la France, la Belgique francophone, la Suisse romande et le Québec ; anglais ailleurs.
- 2e relance ou plus : encore plus court, et propose de clore poliment (« si ce n'est pas le moment, un simple non me va très bien »).
- Salutation avec le prénom du contact s'il est connu (« Bonjour Sylvain, »).
- PAS DE SIGNATURE : Greg a déjà sa signature automatique dans Mail. Termine par une courte formule de politesse (« Belle journée, », « À bientôt, », « Merci d'avance, ») et RIEN après : ni prénom, ni nom du groupe, ni email, ni téléphone.
- Objet : si un premier mail existe, « Re: <son objet exact> » ; sinon un objet court et précis (lieu + date ou type de demande).
- Corps en texte brut : pas de Markdown, pas de gras, pas de titres.
- N'invente AUCUN fait : ni date, ni chiffre d'écoute, ni concert passé, ni nom, ni lien absent de ces consignes ou du contexte. N'utilise pas de placeholder entre crochets.`;

/** Request / result stored in the radar outbox (id relance-<dealId>), written back by the Claude routine. */
export interface RelanceDoc {
  kind: 'relance';
  state: 'requested' | 'ready' | 'error' | 'sent';
  dealId: string;
  label: string;
  to: string;
  /** How to write it (RELANCE_INSTRUCTIONS, kept in the code so it can evolve without editing the routine). */
  instructions: string;
  /** Everything Claude needs (built by buildRelancePrompt), so the routine has nothing to look up. */
  prompt: string;
  basedOn: { lastSent: { subject: string; date: string } | null; relances: number; searchedIn?: string; addresses?: string[] };
  requestedAt: string;
  /** The email the follow-up answers (same thread): headers, recipients, quoted text. */
  thread?: { messageId: string | null; references: string | null; date: string; from: string; text: string; toAll: string[]; cc: string[] } | null;
  /** Reply draft saved in booking@'s Drafts folder (Message-ID, to open it in Mail). */
  draft?: { messageId: string; savedAt: string } | null;
  subject?: string;
  body?: string;
  readyAt?: string;
  error?: string;
}

export const relanceDocId = (dealId: string) => `relance-${dealId}`;

export interface RelanceContext {
  deal: Deal;
  venue?: Venue | null;
  contact?: Contact | null;
  activities: Pick<Activity, 'type' | 'channel' | 'content' | 'created_at'>[];
  lastSent: SentMessage | null;
  /** Radar lead behind the deal, when it came from the radar (why / support / deadline…). */
  lead?: Record<string, unknown> | null;
  today: string;
}

const d = (s?: string | null) => (s ? s.slice(0, 10) : null);
const clip = (s: unknown, n: number) => {
  const t = String(s ?? '').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
};

/** Number of follow-ups already done (relance activities, or stage "relancé" without history). */
export function relanceCount(ctx: Pick<RelanceContext, 'deal' | 'activities'>): number {
  const n = ctx.activities.filter((a) => a.type === 'relance').length;
  return n || (ctx.deal.stage === 'relance' ? 1 : 0);
}

export function buildRelancePrompt(ctx: RelanceContext): string {
  const { deal, venue, contact, lastSent, lead } = ctx;
  const lines: string[] = [`Date du jour : ${ctx.today}`, ''];
  lines.push('OPPORTUNITÉ');
  if (deal.title) lines.push(`- Intitulé : ${deal.title}`);
  lines.push(`- Étape : ${deal.stage}`);
  if (deal.first_contact_at) lines.push(`- Premier contact : ${d(deal.first_contact_at)}`);
  if (deal.last_message_at) lines.push(`- Dernier message envoyé : ${d(deal.last_message_at)}${deal.last_relance_method ? ` (via ${deal.last_relance_method})` : ''}`);
  lines.push(`- Relances déjà faites : ${relanceCount(ctx)} (la prochaine sera donc la relance n° ${relanceCount(ctx) + 1})`);
  if (deal.concert_date) lines.push(`- Date de concert visée : ${d(deal.concert_date)}`);
  if (deal.response) lines.push(`- Réponse notée : ${clip(deal.response, 400)}`);
  if (deal.notes) lines.push(`- Notes de Greg : ${clip(deal.notes, 800)}`);
  if (deal.tags?.length) lines.push(`- Tags : ${deal.tags.join(', ')}`);

  if (venue) {
    lines.push('', 'LIEU');
    lines.push(`- ${venue.name} (${venue.type}), ${[venue.city, venue.country].filter(Boolean).join(', ')}${venue.capacity ? `, ${venue.capacity} places` : ''}`);
    if (venue.similar_bands) lines.push(`- Groupes comparables programmés : ${clip(venue.similar_bands, 300)}`);
    if (venue.application_deadline) lines.push(`- Deadline annuelle de candidature (MM-JJ) : ${venue.application_deadline}`);
    if (venue.notes) lines.push(`- Notes : ${clip(venue.notes, 500)}`);
  }
  if (contact) {
    lines.push('', 'CONTACT');
    lines.push(`- ${contact.name}${contact.role ? `, ${contact.role}` : ''} · ton : ${contact.tone}`);
    if (contact.notes) lines.push(`- Notes : ${clip(contact.notes, 400)}`);
  }
  if (lead) {
    const pick = ['cat', 'name', 'venue', 'eventDate', 'deadline', 'support', 'why', 'action', 'contactRoute'] as const;
    const got = pick.filter((k) => lead[k]).map((k) => `- ${k} : ${clip(lead[k], 300)}`);
    if (got.length) lines.push('', 'PISTE DU RADAR (origine de l’opportunité)', ...got);
  }
  if (lastSent) {
    lines.push('', `PREMIER MAIL / DERNIER MAIL ENVOYÉ (le ${d(lastSent.date)}, à ${lastSent.to})`, `Objet : ${lastSent.subject}`, '---', lastSent.text || '(corps illisible)', '---');
  } else {
    lines.push('', 'Aucun mail envoyé retrouvé dans la boîte booking@ pour ce contact (le premier contact a pu se faire par un autre canal).');
  }
  const hist = ctx.activities.filter((a) => a.type !== 'status_change').slice(0, 12);
  if (hist.length) {
    lines.push('', 'HISTORIQUE (du plus récent au plus ancien)');
    for (const a of hist) lines.push(`- ${d(a.created_at)} · ${a.type}${a.channel ? ` (${a.channel})` : ''} : ${clip(a.content, 500).replace(/\n+/g, ' / ')}`);
  }
  lines.push('', 'Rédige la relance (objet + corps en texte brut).');
  return lines.join('\n');
}
