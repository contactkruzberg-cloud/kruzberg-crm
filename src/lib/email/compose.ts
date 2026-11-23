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
