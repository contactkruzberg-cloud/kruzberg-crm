'use client';

import { toast } from 'sonner';
import { useRadarCrm, useRadarWrite } from '@/hooks/use-radar';
import { ADV, STAGE_LABEL, STATUS_TO_STAGE, today } from '@/lib/radar/logic';
import type { Lead } from '@/lib/radar/types';

const dFR = () => new Date().toLocaleDateString('fr-FR');

/** Radar actions, with the same rules as the former artifact. */
export function useRadarActions() {
  const write = useRadarWrite();
  const crm = useRadarCrm();

  const patch = (id: string, data: Record<string, unknown>) => write.mutateAsync({ op: 'update', collection: 'leads', id, data });

  /** Sends to the pipeline (or moves the stage of the linked deal). Returns an error message or null. */
  const toPipeline = async (lead: Lead, stage?: string, note?: string, statusLabel?: string): Promise<string | null> => {
    try {
      const r = await crm.mutateAsync({ lead, stage, note, statusLabel });
      return r ? null : 'échec';
    } catch (err) {
      return err instanceof Error ? err.message : 'échec';
    }
  };

  const sendToPipeline = async (lead: Lead) => {
    const er = await toPipeline(lead);
    if (er) toast.error(`Pas envoyé au pipeline : ${er}`);
    else toast.success(lead.crmId ? `${lead.name} resynchronisée dans le pipeline` : `${lead.name} → pipeline. Elle quitte le radar (onglet « Dans le pipeline »).`);
  };

  /** "Contacté" by a channel: status + date, then the pipeline takes over. */
  const markContacted = async (lead: Lead, channel: string) => {
    await patch(lead.id, { status: 'contacté', statusAt: today(), contactChannel: channel, contactedAt: today() });
    const er = await toPipeline({ ...lead, status: 'contacté' }, 'contacte', `Contacté par ${channel} le ${dFR()} (radar)`, 'contacté');
    if (er) toast.error(`Enregistré ici mais pas dans le pipeline : ${er}`);
    else toast.success(`${lead.name} → pipeline (${STAGE_LABEL.contacte}). Suivi désormais dans le pipeline.`);
  };

  const setStatus = async (lead: Lead, status: string) => {
    const data: Record<string, unknown> = { status, statusAt: today() };
    if (status === 'contacté' && !lead.contactedAt) data.contactedAt = today();
    await patch(lead.id, data);
    if (ADV.includes(status)) {
      const stage = STATUS_TO_STAGE[status];
      const note = status === 'contacté' && lead.contactChannel ? `Contacté par ${lead.contactChannel} le ${dFR()} (radar)` : `Radar : statut → ${status} le ${dFR()}`;
      const er = await toPipeline({ ...lead, ...data }, stage, note, status);
      if (er) toast.error(`Enregistré ici mais pas dans le pipeline : ${er}`);
      else toast.success(`${lead.name} → pipeline (${STAGE_LABEL[stage]})`);
    } else {
      toast.success(`Statut : ${status}`);
    }
  };

  const dismiss = async (lead: Lead, reason: string) => {
    await patch(lead.id, { dismissed: true, dismissReason: reason, dismissedAt: today() });
    toast.success(`Écartée : ${lead.name} · « ${reason} »`, {
      action: { label: 'Annuler', onClick: () => void restore(lead, true) },
    });
  };

  const restore = async (lead: Lead, silent = false) => {
    await patch(lead.id, { dismissed: false, dismissReason: '', dismissedAt: '' });
    if (!silent) toast.success('Restaurée');
  };

  const adjustChance = (lead: Lead, delta: number) => {
    const v = delta === 0 ? 0 : Math.max(-30, Math.min(30, (Number(lead.chanceAdj) || 0) + delta));
    return patch(lead.id, { chanceAdj: v });
  };

  /** Draft opened in Mail (mailto). */
  const draftOpened = (lead: Lead, to: string[]) =>
    patch(lead.id, {
      draftState: 'created',
      draftAt: today(),
      draftTo: to.join(', '),
      draftVia: 'mailto',
      status: lead.status && lead.status !== 'nouveau' ? lead.status : 'à contacter',
    });

  /** Draft queued for Claude ("crée les brouillons en attente"). */
  const queueDraft = async (lead: Lead, to: string[], subject: string, body: string) => {
    await write.mutateAsync({
      op: 'add',
      collection: 'outbox',
      data: { leadId: lead.id, leadName: lead.name, to, subject, body, state: 'pending', createdAt: new Date().toISOString() },
    });
    await patch(lead.id, { draftState: 'pending', draftTo: to.join(', '), status: lead.status && lead.status !== 'nouveau' ? lead.status : 'à contacter' });
  };

  return { patch, toPipeline, sendToPipeline, markContacted, setStatus, dismiss, restore, adjustChance, draftOpened, queueDraft, busy: crm.isPending };
}
