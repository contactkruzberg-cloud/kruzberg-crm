import { NextResponse } from 'next/server';
import { markSeenOnServer } from '@/lib/email/mailbox';
import { emailContext } from '@/lib/email/server-context';

// Opening a conversation marks its messages read, in the CRM and in the mailbox.
export async function POST(request: Request) {
  const ctx = await emailContext(request);
  if (!ctx) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  const { ids } = (await request.json().catch(() => ({}))) as { ids?: string[] };
  if (!ids?.length) return NextResponse.json({ updated: 0 });

  const { data, error } = await ctx.db.from('emails').update({ seen: true }).in('id', ids.slice(0, 500)).eq('user_id', ctx.userId).select('folder, uid');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await markSeenOnServer((data ?? []).filter((r) => r.uid != null && r.folder !== 'CRM').map((r) => ({ folder: r.folder as string, uid: Number(r.uid) }))).catch((e) =>
    console.error('IMAP \\Seen failed', e),
  );
  return NextResponse.json({ updated: data?.length ?? 0 });
}
