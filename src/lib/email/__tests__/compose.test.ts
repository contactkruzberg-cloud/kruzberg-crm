import { describe, expect, test } from 'vitest';
import { composeBodies, insertLink, normalizeHref, pastedHtmlToComposer } from '../compose';

describe('normalizeHref', () => {
  test('web and mail links, scheme added when missing', () => {
    expect(normalizeHref('kruzberg.com/epk')).toBe('https://kruzberg.com/epk');
    expect(normalizeHref('www.youtube.com/watch?v=1')).toBe('https://www.youtube.com/watch?v=1');
    expect(normalizeHref('https://youtu.be/x')).toBe('https://youtu.be/x');
    expect(normalizeHref('prog@sonic.fr')).toBe('mailto:prog@sonic.fr');
    expect(normalizeHref('javascript:alert(1)')).toBeNull();
    expect(normalizeHref('pas une adresse')).toBeNull();
  });
});

describe('composeBodies', () => {
  test('links become real links in HTML and "label <url>" in text', () => {
    const r = composeBodies('Bonjour,\nDossier de presse : [notre EPK](kruzberg.com/epk.pdf) & live https://youtu.be/x.');
    expect(r.hasLinks).toBe(true);
    expect(r.text).toBe('Bonjour,\nDossier de presse : notre EPK <https://kruzberg.com/epk.pdf> & live https://youtu.be/x.');
    expect(r.html).toContain('Bonjour,<br>\nDossier de presse : <a href="https://kruzberg.com/epk.pdf">notre EPK</a> &amp; live <a href="https://youtu.be/x">https://youtu.be/x</a>.');
  });

  test('HTML typed by hand is escaped, invalid links left as typed', () => {
    const r = composeBodies('<b>salut</b> [x](javascript:alert(1))');
    expect(r.html).toContain('&lt;b&gt;salut&lt;/b&gt; [x](javascript:alert(1))');
    expect(r.hasLinks).toBe(false);
  });
});

describe('insertLink', () => {
  test('replaces the selection', () => {
    expect(insertLink('Voir le dossier ici', 5, 15, 'le dossier', 'https://k.com')).toEqual({ value: 'Voir [le dossier](https://k.com) ici', caret: 32 });
  });
});

describe('pastedHtmlToComposer', () => {
  test('rich text keeps its links as [label](url)', () => {
    const html =
      '<meta charset="utf-8"><div>Kit Promo - <a href="https://drive.google.com/x">Vidéo Live Session</a> - <a href="https://kruzberg.com/">kruzberg.com</a></div><div>Écrire à <a href="mailto:booking@kruzberg.com">booking@kruzberg.com</a>&nbsp;!</div>';
    expect(pastedHtmlToComposer(html)).toBe('Kit Promo - [Vidéo Live Session](https://drive.google.com/x) - https://kruzberg.com/\nÉcrire à booking@kruzberg.com !');
  });
  test('no link: plain paste', () => {
    expect(pastedHtmlToComposer('<p>Bonjour</p>')).toBeNull();
    expect(pastedHtmlToComposer('')).toBeNull();
  });
  test('paragraphs and lists', () => {
    expect(pastedHtmlToComposer('<p>Style : <a href="https://youtu.be/T">Teaser</a></p><ul><li>Un</li><li>Deux</li></ul>')).toBe('Style : [Teaser](https://youtu.be/T)\n\n- Un\n- Deux');
  });
});
