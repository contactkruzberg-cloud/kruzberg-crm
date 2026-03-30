import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';

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
}

export async function sendEmail({ to, subject, body, replyTo }: SendEmailParams) {
  if (!process.env.SMTP_PASSWORD) {
    throw new Error('SMTP_PASSWORD not configured');
  }

  const from = `"KRUZBERG" <${process.env.SMTP_USER || 'booking@kruzberg.com'}>`;

  const info = await transporter.sendMail({
    from,
    to,
    subject,
    text: body,
    replyTo: replyTo || process.env.SMTP_USER || 'booking@kruzberg.com',
  });

  // Save to IMAP Sent folder so it appears in OVH webmail
  try {
    await saveToSentFolder({ from, to, subject, body });
  } catch (err) {
    // Don't fail the send if IMAP save fails
    console.error('Failed to save to Sent folder:', err);
  }

  return { messageId: info.messageId };
}

async function saveToSentFolder({ from, to, subject, body }: { from: string; to: string; subject: string; body: string }) {
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
    const dateStr = date.toUTCString();

    // Build raw RFC 2822 email
    const rawMessage = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Date: ${dateStr}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      body,
    ].join('\r\n');

    // Try common Sent folder names (OVH uses "Sent" or "INBOX.Sent")
    const sentFolders = ['Sent', 'INBOX.Sent', 'Envoy&AOk-s', 'INBOX.Envoy&AOk-s'];
    let saved = false;

    for (const folder of sentFolders) {
      try {
        await client.append(folder, rawMessage, ['\\Seen'], date);
        saved = true;
        break;
      } catch {
        // Try next folder name
      }
    }

    if (!saved) {
      // List mailboxes to find the right one
      const mailboxes = await client.list();
      const sentBox = mailboxes.find((m) =>
        m.specialUse === '\\Sent' ||
        m.path.toLowerCase().includes('sent') ||
        m.path.toLowerCase().includes('envoy')
      );
      if (sentBox) {
        await client.append(sentBox.path, rawMessage, ['\\Seen'], date);
      }
    }

    await client.logout();
  } catch (err) {
    try { await client.logout(); } catch { /* ignore */ }
    throw err;
  }
}
