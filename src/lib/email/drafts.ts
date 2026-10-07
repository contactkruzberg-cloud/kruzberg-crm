import { ImapFlow } from 'imapflow';
import MailComposer from 'nodemailer/lib/mail-composer';

// Reply drafts in booking@'s "Drafts" folder (OVH IMAP): Apple Mail shows them
// in Brouillons, and because they carry In-Reply-To / References of the first
// email, the follow-up stays in the same thread (for Greg and the recipient).

const DRAFT_NAMES = /^(inbox[./])?(drafts|brouillons)$/i;

export interface ReplyDraft {
  to: string[];
  cc?: string[];
  subject: string;
  /** Text Greg wrote (the follow-up). */
  body: string;
  /** The message being replied to: threading headers + quoted text. */
  replyTo?: { messageId: string | null; references: string | null; date: string; from: string; text: string } | null;
}

/** "Le 16 sept. 2026 à 19:26, KRUZBERG <booking@…> a écrit :" + "> " lines, like Apple Mail. */
export function quoteOf(r: NonNullable<ReplyDraft['replyTo']>): string {
  const d = new Date(r.date);
  const when = `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Paris' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })}`;
  const quoted = r.text
    .split('\n')
    .map((l) => (l ? `> ${l}` : '>'))
    .join('\n');
  return `Le ${when}, ${r.from} a écrit :\n\n${quoted}`;
}

export function buildReplyDraft(d: ReplyDraft, from: string, messageId?: string): Promise<Buffer> {
  const r = d.replyTo;
  const refs = r?.messageId ? [r.references, r.messageId].filter(Boolean).join(' ') : undefined;
  const mail = new MailComposer({
    from,
    to: d.to.join(', '),
    cc: d.cc?.length ? d.cc.join(', ') : undefined,
    subject: d.subject,
    text: r?.text ? `${d.body}\n\n${quoteOf(r)}\n` : d.body,
    inReplyTo: r?.messageId || undefined,
    references: refs,
    date: new Date(),
    messageId,
  });
  return mail.compile().build();
}

/** Saves the draft in booking@'s Drafts folder. */
export async function saveReplyDraft(d: ReplyDraft): Promise<{ folder: string; messageId: string }> {
  const user = process.env.IMAP_USER || 'booking@kruzberg.com';
  if (!process.env.IMAP_PASSWORD) throw new Error('IMAP_PASSWORD manquant');
  // Our own Message-ID, so the CRM can open the draft in Mail (message:// link).
  const messageId = `<relance-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}@kruzberg.com>`;
  const raw = await buildReplyDraft(d, `"KRUZBERG" <${user}>`, messageId);
  const client = new ImapFlow({
    host: process.env.IMAP_HOST || 'ssl0.ovh.net',
    port: parseInt(process.env.IMAP_PORT || '993'),
    secure: true,
    auth: { user, pass: process.env.IMAP_PASSWORD },
    logger: false,
  });
  try {
    await client.connect();
    const boxes = await client.list();
    const drafts = boxes.find((b) => b.specialUse === '\\Drafts') ?? boxes.find((b) => DRAFT_NAMES.test(b.path));
    if (!drafts) throw new Error('Dossier « Brouillons » introuvable dans la boîte booking@');
    await client.append(drafts.path, raw, ['\\Draft', '\\Seen'], new Date());
    return { folder: drafts.path, messageId };
  } finally {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }
}
