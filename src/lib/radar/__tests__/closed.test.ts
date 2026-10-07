import { describe, expect, it } from 'vitest';
import { archived, closedReason, live } from '../logic';
import type { Lead } from '../types';

const lead = (over: Partial<Lead>): Lead => ({ id: 'sp-x', cat: 'support', name: 'X', ...over });

describe('closed leads (date fermée)', () => {
  it('detects a closed date written only in the contact route (Boy Harsher)', () => {
    const l = lead({
      action: "Demander au Transbordeur si les 'guests' sont déjà bookés ; sinon proposer un slot local.",
      contactRoute:
        'Date fermée (Choir Boy en 1re partie sur toute la tournée, concert présenté par Persona Grata) ; ne pas démarcher. Pour une future date Persona Grata : DM Instagram @agency.personagrata.',
    });
    expect(closedReason(l)).toBe('Date fermée (Choir Boy en 1re partie sur toute la tournée, concert présenté par Persona Grata)');
    expect(live(l)).toBe(false);
    expect(archived(l)).toBe(true);
  });

  it('detects "ne plus démarcher" / "plateau bouclé" in the action', () => {
    expect(closedReason(lead({ action: 'Ne plus démarcher : 1re partie annoncée (Foncedalle).' }))).toBe('Ne plus démarcher : 1re partie annoncée (Foncedalle)');
    expect(closedReason(lead({ action: 'Plateau bouclé (4 groupes) : ne pas candidater sur le 20/11 ; garder le contact GZ.' }))).toBe(
      'Plateau bouclé (4 groupes) : ne pas candidater sur le 20/11',
    );
  });

  it('uses the explicit flag, and lets Greg reopen a lead', () => {
    expect(closedReason(lead({ closed: true, closedReason: 'Support attribué à Brother Junior' }))).toBe('Support attribué à Brother Junior');
    const reopened = lead({ closed: false, contactRoute: 'Date fermée (support de tournée).' });
    expect(closedReason(reopened)).toBeNull();
    expect(live(reopened)).toBe(true);
  });

  it('leaves open leads alone', () => {
    const l = lead({ action: 'Mail court à programmation@epiceriemoderne.com dès maintenant', contactRoute: 'Formulaire booking uniquement.' });
    expect(closedReason(l)).toBeNull();
    expect(live(l)).toBe(true);
  });
});
