import { decodeEntities } from './text';
// What Greg types in the CRM → the mail that leaves: links written
// [texte](adresse) become real links (HTML part), with a plain-text part in
// Apple Mail's "texte <adresse>" form for clients that show text only.

const LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;

/** "kruzberg.com/epk" → "https://kruzberg.com/epk"; only web and mail links. */
export function normalizeHref(raw: string): string | null {
  const h = raw.trim();
  if (/^mailto:[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(h)) return h;
  if (/^[^\s@/]+@[^\s@]+\.[a-z]{2,}$/i.test(h)) return `mailto:${h}`;
  if (/^https?:\/\/[^\s]+\.[^\s]+/i.test(h)) return h;
  if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(h)) return `https://${h}`;
  return null;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function composeBodies(body: string): { text: string; html: string; hasLinks: boolean } {
  let hasLinks = false;
  const text = body.replace(LINK, (m, label: string, href: string) => {
    const h = normalizeHref(href);
    if (!h) return m;
    hasLinks = true;
    return `${label} <${h}>`;
  });

  // HTML: escape everything, then rebuild the links, then auto-link bare URLs.
  const parts: string[] = [];
  let last = 0;
  for (const m of body.matchAll(LINK)) {
    const h = normalizeHref(m[2]);
    if (!h) continue;
    parts.push(autolink(esc(body.slice(last, m.index))));
    parts.push(`<a href="${esc(h)}">${esc(m[1])}</a>`);
    last = m.index! + m[0].length;
  }
  parts.push(autolink(esc(body.slice(last))));
  const inner = parts.join('').replace(/\n/g, '<br>\n');
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#1d1d1f">${inner}</div>`;
  return { text, html, hasLinks };
}

/** Bare https:// URLs in already-escaped text become links too. */
function autolink(escaped: string) {
  return escaped.replace(/(^|[\s(])(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g, (_, pre: string, url: string) => `${pre}<a href="${url}">${url}</a>`);
}

/** Inserts [label](href) in place of the selection [start, end). */
export function insertLink(value: string, start: number, end: number, label: string, href: string) {
  const md = `[${label.replace(/[[\]]/g, '')}](${href})`;
  return { value: value.slice(0, start) + md + value.slice(end), caret: start + md.length };
}

/**
 * Rich text copied from a page, a mail or a document (clipboard text/html)
 * → what the composer holds: plain text, links kept as [label](url).
 * Null when the copied text has no link (the plain paste is then enough).
 */
export function pastedHtmlToComposer(html: string): string | null {
  if (!/<a\b[^>]*href=/i.test(html)) return null;
  const strip = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
  let found = false;
  let s = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(head|style|script)\b[\s\S]*?<\/\1>/gi, '')
    // Links first: [label](url), or the bare url when the label is the url itself.
    .replace(/<a\b[^>]*?href\s*=\s*("([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi, (m, _q, h1: string, h2: string, inner: string) => {
      const href = normalizeHref(decodeEntities(h1 ?? h2 ?? ''));
      const label = strip(inner);
      if (!href || !label) return label || m.replace(/<[^>]+>/g, '');
      found = true;
      const bare = href.replace(/^mailto:/, '').replace(/\/$/, '');
      return label.replace(/\/$/, '') === bare || `https://${label}`.replace(/\/$/, '') === bare ? href.replace(/^mailto:/, '') : `\u0001${label.replace(/[[\]]/g, '')}\u0002${href}\u0003`;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/(div|h[1-6]|tr|blockquote|ul|ol)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  if (!found) return null;
  s = decodeEntities(s)
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  // Markers → markdown links, once the text is decoded (an entity can't break them).
  return s.replace(/\u0001([^\u0002]*)\u0002([^\u0003]*)\u0003/g, (_m, label: string, href: string) => `[${label}](${href})`);
}
