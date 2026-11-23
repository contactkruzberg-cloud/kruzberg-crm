import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import MailComposer from 'nodemailer/lib/mail-composer';
import { withSignature } from './signature';
import { composeBodies } from './compose';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'ssl0.ovh.net',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // STARTTLS on port 587
  auth: {
    user: process.env.SMTP_USER || 'booking@kruzberg.com',
    pass: process.env.SMTP_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
  cc?: string;
  /** Threading: the message answered and the chain before it. */
  inReplyTo?: string | null;
  references?: string | null;
}

export async function sendEmail({ to, subject, body, replyTo, cc, inReplyTo, references }: SendEmailParams) {
  if (!process.env.SMTP_PASSWORD) {
    throw new Error('SMTP_PASSWORD not configured');
  }

  const user = process.env.SMTP_USER || 'booking@kruzberg.com';
  const from = `"KRUZBERG" <${user}>`;
  // Sent by the CRM itself: Apple Mail won't add Greg's signature, so we do.
  // Links typed [texte](adresse) leave as real links (HTML) + "texte <adresse>" (text).
  const { text, html, hasLinks } = composeBodies(withSignature(body));
  // Our own Message-ID: the copy in « Envoyés » and the CRM share it (no duplicate on sync).
  const messageId = `<crm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}@${user.split('@')[1] || 'kruzberg.com'}>`;
  const mail = {
    from,
    to,
    cc: cc || undefined,
    subject,
    text,
    html: hasLinks ? html : undefined,
    replyTo: replyTo || user,
    messageId,
    inReplyTo: inReplyTo || undefined,
    references: references || undefined,
    date: new Date(),
  };

  await transporter.sendMail(mail);

  // Save to IMAP Sent folder so it appears in Mail / OVH webmail.
  try {
    const raw = await new MailComposer(mail).compile().build();
    await saveToSentFolder(raw);
  } catch (err) {
    // Don't fail the send if IMAP save fails
    console.error('Failed to save to Sent folder:', err);
  }

  return { messageId, body: text };
}

async function saveToSentFolder(rawMessage: Buffer) {
  const imapPassword = process.env.IMAP_PASSWORD || process.env.SMTP_PASSWORD;
  if (!imapPassword) return;

  const client = new ImapFlow({
    host: process.env.IMAP_HOST || 'ssl0.ovh.net',
    port: parseInt(process.env.IMAP_PORT || '993'),
    secure: true,
    auth: {
      user: process.env.IMAP_USER || process.env.SMTP_USER || 'booking@kruzberg.com',
      pass: imapPassword,
    },
    logger: false,
  });

  try {
    await client.connect();
    const date = new Date();
    const mailboxes = await client.list();
    const sentBox =
      mailboxes.find((m) => m.specialUse === '\\Sent') ??
      mailboxes.find((m) => /^(inbox[./])?(sent|sent messages|envoy&aok-s|envoy[ée]s)$/i.test(m.path));
    if (sentBox) await client.append(sentBox.path, rawMessage, ['\\Seen'], date);
    await client.logout();
  } catch (err) {
    try { await client.logout(); } catch { /* ignore */ }
    throw err;
  }
}
