// Greg's signature, copied from his Apple Mail signature « BOOKING » (with the
// band photo). Templates, radar mails and Claude's follow-ups carry none
// (Apple Mail adds his own); only emails the CRM sends itself (SMTP) get it.
// The link is written [texte](adresse): composeBodies turns it into a real link.
export const SIGNATURE = `Grégoire Paillas — KRUZBERG
booking@kruzberg.com · 07 60 08 64 13
AV117 Production · The Blend Corp

[Écoute et informations](https://kruzberg.com)`;

/** Content-ID of the signature photo, attached inline to each mail. */
export const SIGNATURE_PHOTO_CID = 'signature-photo@kruzberg.com';

/** The photo under the signature (HTML part); its width as Apple Mail shows it. */
export const SIGNATURE_PHOTO_HTML = `<br><img src="cid:${SIGNATURE_PHOTO_CID}" alt="KRUZBERG" width="480" height="600" style="display:block;width:480px;max-width:100%;height:auto;border:0">`;

/** Appends the signature unless the text already ends with it (or another "Grégoire Paillas" block). */
export function withSignature(body: string): string {
  const t = body.trimEnd();
  return /Grégoire Paillas/.test(t.slice(-400)) ? t : `${t}\n\n${SIGNATURE}`;
}
