import { describe, expect, test } from 'vitest';
import { cleanBody, linkify, prettyUrl, withoutSignature } from '../text';

describe('cleanBody', () => {
  test('HTML in the text part (ESNS) becomes plain text, links kept', () => {
    const esns =
      '<p>Dear&nbsp;Grégoire Paillas,</p>\n\n<p>Thank you for applying Kruzberg for ESNS 2027.<br />\n<br />\nYour application ID is 64ad<br />\n<a href="https://artist.esns.nl/app/64ad/">https://artist.esns.nl/app/64ad</a></p>\n<p>ESNS Bookings Department<br />\n<a href="mailto:bookings@esns.nl?subject=ESNS" target="_blank">bookings@esns.nl</a></p>\n<p>&nbsp;</p>';
    expect(cleanBody(esns)).toBe(
      'Dear Grégoire Paillas,\n\nThank you for applying Kruzberg for ESNS 2027.\n\nYour application ID is 64ad\nhttps://artist.esns.nl/app/64ad/\n\nESNS Bookings Department\nbookings@esns.nl',
    );
  });

  test('a labelled link keeps its label', () => {
    expect(cleanBody('<p>Voir <a href="https://x.fr/epk.pdf">notre dossier</a> ici</p><br>')).toBe('Voir notre dossier <https://x.fr/epk.pdf> ici');
  });

  test('plain text is left alone (entities decoded)', () => {
    expect(cleanBody('Salut,\n\nÇa marche pour le 14 &amp; le 15 !')).toBe('Salut,\n\nÇa marche pour le 14 & le 15 !');
  });
});

describe('linkify', () => {
  test('Apple Mail "label <url>" → the label is the link', () => {
    expect(linkify('Dossier de presse <https://kruzberg.com/EPK.pdf>')).toEqual([{ t: 'link', href: 'https://kruzberg.com/EPK.pdf', label: 'Dossier de presse' }]);
  });

  test('several links on one line, labels cut at separators and parentheses', () => {
    const toks = linkify('Kit Promo <https://drive.google.com/x> - Vidéo Live Session <https://youtu.be/P> - Écoute et informations <https://kruzberg.com/>');
    expect(toks.filter((t) => t.t === 'link').map((t) => (t as { label: string }).label)).toEqual(['Kit Promo', 'Vidéo Live Session', 'Écoute et informations']);
    const style = linkify('Style : Post-Punk  (Vidéo Teaser Live ici <https://youtube.com/shorts/T>)');
    expect(style).toEqual([
      { t: 'text', v: 'Style : Post-Punk  (' },
      { t: 'link', href: 'https://youtube.com/shorts/T', label: 'Vidéo Teaser Live ici' },
      { t: 'text', v: ')' },
    ]);
  });

  test('bare URL (trailing punctuation left out) and email address', () => {
    expect(linkify('Site : https://www.esns.nl/apply. Écris à bookings@esns.nl')).toEqual([
      { t: 'text', v: 'Site : ' },
      { t: 'link', href: 'https://www.esns.nl/apply', label: 'esns.nl' },
      { t: 'text', v: '. Écris à ' },
      { t: 'link', href: 'mailto:bookings@esns.nl', label: 'bookings@esns.nl' },
    ]);
  });

  test('pretty urls', () => {
    expect(prettyUrl('https://kruzberg.com/wp-content/uploads/2026/05/KRUZBERG_EPK_2026.pdf')).toBe('kruzberg.com · KRUZBERG_EPK_2026.pdf');
    expect(prettyUrl('https://drive.google.com/drive/folders/1PP?usp=share_link')).toBe('drive.google.com');
  });
});

describe('withoutSignature', () => {
  test('our signature and the -- block go', () => {
    expect(withoutSignature('Merci !\n\nGrégoire Paillas — KRUZBERG\nbooking@kruzberg.com · 07 60')).toBe('Merci !');
    expect(withoutSignature('Merci !\n-- \nJulie\nProg')).toBe('Merci !');
  });
});

describe('linkify labels', () => {
  test('the label stops at the end of the previous sentence', () => {
    expect(linkify('On aimerait jouer au Sonic en mars. Dossier de presse <https://k.com/EPK.pdf>')).toEqual([
      { t: 'text', v: 'On aimerait jouer au Sonic en mars. ' },
      { t: 'link', href: 'https://k.com/EPK.pdf', label: 'Dossier de presse' },
    ]);
  });
  test('"Lien : <url>" shows the short url', () => {
    expect(linkify('Lien : <https://www.k.com/x>')).toEqual([
      { t: 'text', v: 'Lien : ' },
      { t: 'link', href: 'https://www.k.com/x', label: 'k.com' },
    ]);
  });
});
