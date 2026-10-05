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
