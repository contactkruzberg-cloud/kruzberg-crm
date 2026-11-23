import { ImapFlow, type ListResponse } from 'imapflow';
import { simpleParser } from 'mailparser';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ownText } from './sent';
import { domainOf, normAddr, peersOf } from './messages';

// Copies booking@'s mail (OVH IMAP) into the `emails` table, folder by folder,
// in small batches so a first sync of years of mail can run over several
// calls. Incremental afterwards: only uids above the last one read.

const SKIP_FOLDER = /draft|brouillon|trash|corbeille|deleted|junk|spam|ind[ée]sirable|outbox|bo[iî]te d.envoi|notes|templates|mod[eè]les/i;
const SENT = /sent|envoy/i;
const BULK_FROM = /^(no-?reply|ne-?pas-?repondre|donotreply|mailer-daemon|postmaster|notifications?|newsletter|news|info-?lettre|bounce)/i;

export function imapClient() {
  if (!process.env.IMAP_PASSWORD) throw new Error('IMAP_PASSWORD manquant sur le serveur');
  return new ImapFlow({
    host: process.env.IMAP_HOST || 'ssl0.ovh.net',
    port: parseInt(process.env.IMAP_PORT || '993'),
    secure: true,
    auth: { user: ownAddress(), pass: process.env.IMAP_PASSWORD },
    logger: false,
  });
}

export const ownAddress = () => (process.env.IMAP_USER || 'booking@kruzberg.com').toLowerCase();

/** Folders worth reading, inbox and sent first. */
export function foldersToSync(boxes: Pick<ListResponse, 'path' | 'specialUse' | 'flags'>[]) {
  const ok = boxes.filter((b) => !b.flags?.has('\\Noselect') && !SKIP_FOLDER.test(b.path) && !['\\Trash', '\\Junk', '\\Drafts'].includes(b.specialUse ?? ''));
  const rank = (b: (typeof ok)[number]) => (b.path.toUpperCase() === 'INBOX' ? 0 : b.specialUse === '\\Sent' || SENT.test(b.path) ? 1 : 2);
  return ok.sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path));
}

export interface SyncResult {
  inserted: number;
  /** Inbound messages inserted by this call (for reply detection). */
  newInbound: { peers: string[]; peer_domains: string[]; sent_at: string; subject: string; from_name: string | null; from_addr: string }[];
  remaining: boolean;
  folders: { path: string; read: number; done: boolean }[];
}

type HeaderMap = Map<string, unknown>;
const header = (h: HeaderMap, k: string) => {
  const v = h.get(k);
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v && 'text' in v) return String((v as { text: string }).text);
  return String(v);
};

export async function syncMailbox(db: SupabaseClient, userId: string, { budgetMs = 45_000, batch = 120 } = {}): Promise<SyncResult> {
  const started = Date.now();
  const own = ownAddress();
  const ownDomain = domainOf(own);
  const client = imapClient();
  const result: SyncResult = { inserted: 0, newInbound: [], remaining: false, folders: [] };

  const { data: states } = await db.from('email_sync_state').select('folder, uid_validity, last_uid').eq('user_id', userId);
  const stateOf = new Map((states ?? []).map((s) => [s.folder as string, s as { folder: string; uid_validity: string | null; last_uid: number }]));

  try {
    await client.connect();
    for (const box of foldersToSync(await client.list())) {
      if (Date.now() - started > budgetMs) {
        result.remaining = true;
        break;
      }
      const lock = await client.getMailboxLock(box.path);
      try {
        const mb = client.mailbox && typeof client.mailbox === 'object' ? client.mailbox : null;
        const validity = mb ? String(mb.uidValidity) : '';
        const st = stateOf.get(box.path);
        const lastUid = st && st.uid_validity === validity ? Number(st.last_uid) : 0;
        const pending = mb && mb.exists ? ((await client.search({ uid: `${lastUid + 1}:*` }, { uid: true })) || []).filter((u) => u > lastUid).sort((a, b) => a - b) : [];
        const take = pending.slice(0, batch);
        const isSent = box.specialUse === '\\Sent' || SENT.test(box.path);
        const rows: Record<string, unknown>[] = [];
        let maxUid = lastUid;

        if (take.length) {
          for await (const msg of client.fetch(take.join(','), { uid: true, envelope: true, flags: true, source: { start: 0, maxLength: 400_000 } }, { uid: true })) {
            maxUid = Math.max(maxUid, msg.uid);
            const env = msg.envelope;
            if (!env || !msg.source) continue;
            const parsed = await simpleParser(msg.source).catch(() => null);
            const h = (parsed?.headers ?? new Map()) as HeaderMap;
            const from = normAddr(env.from?.[0]?.address);
            const out = isSent || from === own || domainOf(from) === ownDomain;
            // Newsletters and robots: not a conversation.
            if (!out && (h.has('list-unsubscribe') || h.has('list-id') || /bulk|list/i.test(header(h, 'precedence')) || /auto-/i.test(header(h, 'auto-submitted')) || BULK_FROM.test(from)))
              continue;
            const to = (env.to ?? []).map((a) => normAddr(a.address)).filter(Boolean);
            const cc = (env.cc ?? []).map((a) => normAddr(a.address)).filter(Boolean);
            const { peers, domains } = peersOf({ from, to, cc }, ownDomain);
            if (!peers.length) continue;
            const text = (parsed?.text || (typeof parsed?.html === 'string' ? parsed.html.replace(/<[^>]+>/g, ' ') : '') || '').replace(/\r/g, '');
            const sentAt = (env.date ? new Date(env.date) : msg.internalDate ? new Date(msg.internalDate) : new Date()).toISOString();
            const messageId = env.messageId || null;
            rows.push({
              user_id: userId,
              message_key: messageId || `${box.path}#${validity}#${msg.uid}`,
              message_id: messageId,
              folder: box.path,
              uid: msg.uid,
              direction: out ? 'out' : 'in',
              from_addr: from,
              from_name: env.from?.[0]?.name || null,
              to_addrs: to,
              cc_addrs: cc,
              peers,
              peer_domains: domains,
              subject: env.subject || '',
              sent_at: sentAt,
              body_text: ownText(text),
              full_text: text.slice(0, 20_000),
              in_reply_to: env.inReplyTo || null,
              refs: header(h, 'references') || null,
              has_attachments: (parsed?.attachments?.length ?? 0) > 0,
              seen: out || !!msg.flags?.has('\\Seen'),
            });
          }
        }

        if (rows.length) {
          const { data: inserted, error } = await db
            .from('emails')
            .upsert(rows, { onConflict: 'user_id,message_key', ignoreDuplicates: true })
            .select('direction, peers, peer_domains, sent_at, subject, from_name, from_addr');
          if (error) throw new Error(error.message);
          result.inserted += inserted?.length ?? 0;
          for (const r of inserted ?? []) if (r.direction === 'in') result.newInbound.push(r as SyncResult['newInbound'][number]);
        }
        const done = pending.length <= take.length;
        if (!done) result.remaining = true;
        await db
          .from('email_sync_state')
          .upsert({ user_id: userId, folder: box.path, uid_validity: validity, last_uid: maxUid, done, synced_at: new Date().toISOString() }, { onConflict: 'user_id,folder' });
        result.folders.push({ path: box.path, read: take.length, done });
      } finally {
        lock.release();
      }
    }
  } finally {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }
  return result;
}

/** Marks messages as read on the server too (best effort). */
export async function markSeenOnServer(items: { folder: string; uid: number }[]) {
  if (!items.length) return;
  const client = imapClient();
  try {
    await client.connect();
    const byFolder = new Map<string, number[]>();
    for (const i of items) byFolder.set(i.folder, [...(byFolder.get(i.folder) ?? []), i.uid]);
    for (const [folder, uids] of byFolder) {
      const lock = await client.getMailboxLock(folder);
      try {
        await client.messageFlagsAdd(uids.join(','), ['\\Seen'], { uid: true });
      } finally {
        lock.release();
      }
    }
  } finally {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }
}
