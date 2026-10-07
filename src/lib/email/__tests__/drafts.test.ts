import { describe, expect, it } from 'vitest';
import { buildReplyDraft } from '../drafts';

describe('reply draft', () => {
  it('threads on the first email and quotes it', async () => {
    const raw = (
      await buildReplyDraft(
        {
          to: ['sylvain@podium.agency'],
          cc: ['simon@podium.agency'],
          subject: 'Re: Booking - Kruzberg - Post-Punk',
          body: 'Bonjour Sylvain,\n\nJe reviens vers vous…\n\nGreg — KRUZBERG',
          replyTo: { messageId: '<abc@kruzberg.com>', references: '<older@x>', date: '2026-09-16T17:26:00Z', from: 'KRUZBERG <booking@kruzberg.com>', text: 'Bonjour,\nVoici notre EPK.' },
        },
        '"KRUZBERG" <booking@kruzberg.com>',
      )
    ).toString('utf8');
    expect(raw).toMatch(/^In-Reply-To: <abc@kruzberg\.com>/m);
    expect(raw).toMatch(/^References: <older@x> <abc@kruzberg\.com>/m);
    expect(raw).toMatch(/^Cc: simon@podium\.agency/m);
    expect(raw).toContain('Subject: Re: Booking - Kruzberg - Post-Punk');
  });
});

import { withSignature } from '../signature';
describe('signature on CRM-sent mail', () => {
  it('is added once', () => {
    const once = withSignature('Bonjour,\n\nMerci,');
    expect(once).toContain('Grégoire Paillas — KRUZBERG');
    expect(withSignature(once)).toBe(once);
  });
});
