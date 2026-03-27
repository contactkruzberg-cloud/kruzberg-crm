import { ImapFlow } from 'imapflow';

export interface IncomingEmail {
  messageId: string;
  from: string;
  fromName: string;
  to: string;
  subject: string;
  date: Date;
  textBody: string;
  inReplyTo: string | null;
}

export async function fetchNewEmails(since: Date): Promise<IncomingEmail[]> {
  if (!process.env.IMAP_PASSWORD) {
    throw new Error('IMAP_PASSWORD not configured');
  }

  const client = new ImapFlow({
    host: process.env.IMAP_HOST || 'ssl0.ovh.net',
    port: parseInt(process.env.IMAP_PORT || '993'),
    secure: true,
    auth: {
      user: process.env.IMAP_USER || 'booking@kruzberg.com',
      pass: process.env.IMAP_PASSWORD,
    },
    logger: false,
  });

  const emails: IncomingEmail[] = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      const sinceStr = since.toISOString().split('T')[0];

      for await (const message of client.fetch(
        { since: sinceStr },
        {
          envelope: true,
          source: false,
          bodyStructure: true,
          headers: ['in-reply-to', 'references'],
        }
      )) {
        if (!message.envelope) continue;

        const fromAddr = message.envelope.from?.[0];
        const toAddr = message.envelope.to?.[0];
        const senderEmail = fromAddr ? `${fromAddr.address}` : '';

        // Skip our own sent emails
        const ourEmail = process.env.IMAP_USER || 'booking@kruzberg.com';
        if (senderEmail.toLowerCase() === ourEmail.toLowerCase()) continue;

        const headersBuffer = message.headers;
        let inReplyTo: string | null = null;
        if (headersBuffer) {
          const headersStr = headersBuffer.toString();
          const match = headersStr.match(/in-reply-to:\s*<?([^>\r\n]+)>?/i);
          inReplyTo = match ? match[1].trim() : null;
        }

        emails.push({
          messageId: message.envelope.messageId || '',
          from: senderEmail,
          fromName: fromAddr?.name || senderEmail,
          to: toAddr ? `${toAddr.address}` : '',
          subject: message.envelope.subject || '',
          date: message.envelope.date ? new Date(message.envelope.date) : new Date(),
          textBody: '', // We only need metadata for matching
          inReplyTo,
        });
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (error) {
    console.error('IMAP fetch error:', error);
    try { await client.logout(); } catch { /* ignore */ }
    throw error;
  }

  return emails;
}
