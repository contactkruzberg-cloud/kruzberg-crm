// Greg's signature. Templates, radar mails and Claude's follow-ups carry none
// (Apple Mail adds his own); only emails the CRM sends itself (SMTP) get it.
export const SIGNATURE = `--
Grégoire Paillas — KRUZBERG
booking@kruzberg.com · 07 60 08 64 13
AV117 Production · The Blend Corp`;

/** Appends the signature unless the text already ends with it (or another "Grégoire Paillas" block). */
export function withSignature(body: string): string {
  const t = body.trimEnd();
  return /Grégoire Paillas/.test(t.slice(-400)) ? t : `${t}\n\n${SIGNATURE}`;
}
