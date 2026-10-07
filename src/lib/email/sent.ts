import { ImapFlow } from 'imapflow';

// Recipients of everything sent from booking@kruzberg.com (OVH "Sent" folder),
// so the radar never proposes an address that was already written to.

export interface SentRecipient {
  email: string;
  lastAt: string; // ISO date of the latest message sent to this address
  subject: string; // subject of that latest message
  count: number;
}

const SENT_NAMES = /^(inbox[./])?(sent|sent items|sent messages|envoy&aok-s|[ée]l[ée]ments envoy[ée]s|envoy[ée]s)$/i;

export async function fetchSentRecipients(sinceDays = 3 * 365): Promise<SentRecipient[]> {
  if (!process.env.IMAP_PASSWORD) throw new Error('IMAP_PASSWORD not configured');
  const own = (process.env.IMAP_USER || 'booking@kruzberg.com').toLowerCase();

  const client = new ImapFlow({
    host: process.env.IMAP_HOST || 'ssl0.ovh.net',
    port: parseInt(process.env.IMAP_PORT || '993'),
    secure: true,
    auth: { user: own, pass: process.env.IMAP_PASSWORD },
    logger: false,
  });

  const byAddr = new Map<string, SentRecipient>();
  try {
    await client.connect();
    const boxes = await client.list();
    const sent = boxes.find((b) => b.specialUse === '\\Sent') ?? boxes.find((b) => SENT_NAMES.test(b.path));
    if (!sent) throw new Error('Dossier « Envoyés » introuvable');

    const lock = await client.getMailboxLock(sent.path);
    try {
      const since = new Date(Date.now() - sinceDays * 864e5);
      for await (const msg of client.fetch({ since }, { envelope: true })) {
        const env = msg.envelope;
        if (!env) continue;
        const at = (env.date ? new Date(env.date) : new Date()).toISOString();
        for (const a of [...(env.to ?? []), ...(env.cc ?? []), ...(env.bcc ?? [])]) {
          const email = (a.address || '').trim().toLowerCase();
          if (!email.includes('@') || email === own || email.endsWith('@kruzberg.com')) continue;
          const cur = byAddr.get(email);
          if (!cur) byAddr.set(email, { email, lastAt: at, subject: env.subject || '', count: 1 });
          else {
            cur.count++;
            if (at > cur.lastAt) {
              cur.lastAt = at;
              cur.subject = env.subject || '';
            }
          }
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (error) {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
    throw error;
  }
  return [...byAddr.values()];
}

// Kept 10 min per server instance: the Sent folder is scanned at most that often.
let cache: { at: number; data: SentRecipient[] } | null = null;
const TTL = 10 * 60_000;

/** Cached scan; on failure, returns the last good scan (if any) with the error. */
export async function sentRecipientsCached(force = false): Promise<{ data: SentRecipient[]; error?: string }> {
  if (!force && cache && Date.now() - cache.at < TTL) return { data: cache.data };
  try {
    const data = await fetchSentRecipients();
    cache = { at: Date.now(), data };
    return { data };
  } catch (err) {
    console.error('[radar] sent scan failed', err);
    return { data: cache?.data ?? [], error: err instanceof Error ? err.message : 'échec IMAP' };
  }
}

export interface SentMessage {
  subject: string;
  date: string; // ISO
  to: string;
  /** Plain-text body, quoted history and signature noise trimmed, max ~4000 chars. */
  text: string;
}

type BodyNode = { type?: string; part?: string; childNodes?: BodyNode[]; disposition?: string };

function findPart(node: BodyNode | undefined, type: string): string | null {
  if (!node) return null;
  if (node.type === type && node.disposition !== 'attachment') return node.part || '1';
  for (const c of node.childNodes ?? []) {
    const p = findPart(c, type);
    if (p) return p;
  }
  return null;
}

const stripHtml = (h: string) =>
  h
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"');

/** Drop the quoted history ("> …", "Le … a écrit :") so only what we wrote remains. */
function ownText(t: string) {
  const lines = t.replace(/\r/g, '').split('\n');
  const cut = lines.findIndex((l) => /^(>|Le .+ a écrit\s*:|On .+ wrote:|-----Original Message|De\s*:.+@)/i.test(l.trim()));
  return (cut >= 0 ? lines.slice(0, cut) : lines).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 4000);
}

/** Latest message sent from booking@ to one of these addresses (OVH "Sent" folder), or null. */
export async function fetchLastSentTo(addresses: string[]): Promise<SentMessage | null> {
  const targets = [...new Set(addresses.map((a) => a.trim().toLowerCase()).filter((a) => a.includes('@')))];
  if (!targets.length || !process.env.IMAP_PASSWORD) return null;
  const client = new ImapFlow({
    host: process.env.IMAP_HOST || 'ssl0.ovh.net',
    port: parseInt(process.env.IMAP_PORT || '993'),
    secure: true,
    auth: { user: process.env.IMAP_USER || 'booking@kruzberg.com', pass: process.env.IMAP_PASSWORD },
    logger: false,
  });
  try {
    await client.connect();
    const boxes = await client.list();
    const sent = boxes.find((b) => b.specialUse === '\\Sent') ?? boxes.find((b) => SENT_NAMES.test(b.path));
    if (!sent) return null;
    const lock = await client.getMailboxLock(sent.path);
    try {
      let best: { uid: number; date: Date; subject: string; to: string; body?: BodyNode } | null = null;
      for (const addr of targets) {
        const uids = await client.search({ to: addr }, { uid: true });
        if (!uids || !uids.length) continue;
        // The highest UIDs are the most recent; check the last few for the latest date.
        for await (const msg of client.fetch(uids.slice(-5), { envelope: true, bodyStructure: true }, { uid: true })) {
          const date = msg.envelope?.date ? new Date(msg.envelope.date) : new Date(0);
          if (!best || date > best.date) best = { uid: msg.uid, date, subject: msg.envelope?.subject || '', to: addr, body: msg.bodyStructure as BodyNode };
        }
      }
      if (!best) return null;
      const plain = findPart(best.body, 'text/plain');
      const html = plain ? null : findPart(best.body, 'text/html');
      let text = '';
      const part = plain || html;
      if (part) {
        const dl = await client.download(String(best.uid), part, { uid: true });
        const chunks: Buffer[] = [];
        for await (const c of dl.content) chunks.push(Buffer.from(c));
        text = Buffer.concat(chunks).toString('utf8');
        if (html) text = stripHtml(text);
      }
      return { subject: best.subject, date: best.date.toISOString(), to: best.to, text: ownText(text) };
    } finally {
      lock.release();
    }
  } finally {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }
}
