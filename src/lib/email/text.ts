// Turning a mail body into something readable in a chat bubble: HTML that some
// senders put in the text part, Apple Mail's "label <url>" links, signatures.

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…', ndash: '–', mdash: '—', euro: '€' };

export function decodeEntities(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** True when a "plain text" body is in fact HTML. */
export function looksLikeHtml(s: string) {
  return (s.match(/<\/?(p|br|div|a|span|table|tr|td|li|ul|ol|strong|b|em|i|html|body|font|h[1-6])\b[^>]*>/gi) ?? []).length >= 2;
}

/** HTML → text; links kept as "label <url>" (rendered as clickable labels). */
export function htmlToText(html: string) {
  let s = html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    // In HTML, raw line breaks mean nothing: only tags break lines.
    .replace(/\s*\n\s*/g, ' ')
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, inner: string) => {
      const label = decodeEntities(inner.replace(/<[^>]+>/g, '')).trim();
      const mail = href.startsWith('mailto:') ? href.slice(7).split('?')[0] : null;
      if (!label || label === href || label === mail || /^(https?:\/\/|www\.)/i.test(label)) return mail ?? href;
      return `${label} \u0001${href}\u0002`;
    })
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h[1-6]|table|ul|ol)>/gi, '\n\n')
    .replace(/<\/(div|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  s = decodeEntities(s).replace(/\u0001/g, '<').replace(/\u0002/g, '>');
  return s
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The readable text of a body, whatever the sender put in it. */
export function cleanBody(text: string) {
  const t = (text || '').replace(/\r/g, '');
  return (looksLikeHtml(t) ? htmlToText(t) : decodeEntities(t)).replace(/\n{3,}/g, '\n\n').trim();
}

/** Drops the signature block: ours (known), or anything after the "-- " delimiter. */
export function withoutSignature(text: string) {
  let t = text;
  const ours = t.search(/\n\s*(--\s*\n\s*)?Grégoire Paillas\s*[—–-]\s*KRUZBERG/);
  if (ours >= 0) t = t.slice(0, ours);
  const dash = t.search(/\n--\s?\n/);
  if (dash >= 0) t = t.slice(0, dash);
  return t.trim();
}

// ---------------------------------------------------------------- links

export type Token = { t: 'text'; v: string } | { t: 'link'; href: string; label: string };

const URL_TAIL = /[).,;:!?'"»]+$/;

/** "drive.google.com", "kruzberg.com · KRUZBERG_EPK_2026.pdf" */
export function prettyUrl(href: string) {
  if (href.startsWith('mailto:')) return href.slice(7).split('?')[0];
  try {
    const u = new URL(href.startsWith('www.') ? `https://${href}` : href);
    const host = u.hostname.replace(/^www\./, '');
    const last = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? '');
    return /\.[a-z0-9]{2,4}$/i.test(last) && last.length <= 40 ? `${host} · ${last}` : host;
  } catch {
    return href;
  }
}

// Where the label of an Apple Mail "label <url>" link starts, looking back.
const LABEL_STARTS = ['(', ' - ', ' – ', ' | ', '• ', ' / '];

/**
 * Splits one line into text and links: "label <url>" (Apple Mail), bare URLs,
 * www. hosts and email addresses.
 */
export function linkify(line: string): Token[] {
  const out: Token[] = [];
  const re = /<((?:https?:\/\/|mailto:)[^>\s]+)>|((?:https?:\/\/|www\.)[^\s<>]+)|([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  const text = (v: string) => {
    if (!v) return;
    const prev = out[out.length - 1];
    if (prev?.t === 'text') prev.v += v;
    else out.push({ t: 'text', v });
  };
  while ((m = re.exec(line))) {
    let pending = line.slice(last, m.index);
    if (m[1]) {
      const href = m[1];
      let cut = 0;
      for (const d of LABEL_STARTS) {
        const i = pending.lastIndexOf(d);
        if (i >= 0) cut = Math.max(cut, i + d.length);
      }
      const label = pending.slice(cut).trim();
      if (label && label.length <= 60) {
        text(pending.slice(0, cut) + pending.slice(cut).match(/^\s*/)![0]);
        out.push({ t: 'link', href, label });
      } else {
        text(pending);
        out.push({ t: 'link', href, label: prettyUrl(href) });
      }
      last = re.lastIndex;
    } else if (m[2]) {
      let raw = m[2];
      const tail = raw.match(URL_TAIL)?.[0] ?? '';
      raw = raw.slice(0, raw.length - tail.length);
      const href = raw.startsWith('www.') ? `https://${raw}` : raw;
      text(pending);
      out.push({ t: 'link', href, label: prettyUrl(href) });
      if (tail) text(tail);
      last = re.lastIndex;
    } else {
      text(pending);
      out.push({ t: 'link', href: `mailto:${m[3]}`, label: m[3] });
      last = re.lastIndex;
    }
    pending = '';
  }
  text(line.slice(last));
  return out;
}
