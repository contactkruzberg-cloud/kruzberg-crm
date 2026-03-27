import nodemailer from 'nodemailer';

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

  const info = await transporter.sendMail({
    from: `"KRUZBERG" <${process.env.SMTP_USER || 'booking@kruzberg.com'}>`,
    to,
    subject,
    text: body,
    replyTo: replyTo || process.env.SMTP_USER || 'booking@kruzberg.com',
  });

  return { messageId: info.messageId };
}
