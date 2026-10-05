'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  ArrowUpRight,
  AtSign,
  Ban,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  FileText,
  Kanban,
  Mail,
  MapPin,
  Minus,
  Plus,
  RotateCcw,
  Send,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  addrUsers,
  CATL,
  chance,
  dupsOf,
  expired,
  fmtDate,
  hasDraft,
  inCrm,
  isKnown,
  keyDate,
  live,
  normCity,
  okUrl,
  REASONS,
  STAGE_LABEL,
  STATUSES,
  TIER,
  zone,
  type RadarIndex,
} from '@/lib/radar/logic';
import { buildMail, emailsOf, KINDS, kindOf, langOf, mailtoOf, type MailKind, type MailLang } from '@/lib/radar/mail-templates';
import type { Lead } from '@/lib/radar/types';
import { ChanceBadge, Tag, TIER_BAR } from './radar-ui';
import { useRadarActions } from './use-radar-actions';

// ---------------------------------------------------------------- mail composer

function MailComposer({ lead, idx, onClose }: { lead: Lead; idx: RadarIndex; onClose: () => void }) {
  const actions = useRadarActions();
  const [kind, setKind] = useState<MailKind>(() => kindOf(lead));
  const [lang, setLang] = useState<MailLang>(() => langOf(lead));
  const initial = useMemo(() => buildMail(lead, kind, lang), [lead, kind, lang]);
  const [to, setTo] = useState(emailsOf(lead.email).join(', '));
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const reset = (k: MailKind, l: MailLang) => {
    const m = buildMail(lead, k, l);
    setSubject(m.subject);
    setBody(m.body);
  };
  const recipients = emailsOf(to);
  const used = addrUsers(idx, recipients, lead.id);
  const form = lead.contactForm && okUrl(lead.contactForm.url) ? lead.contactForm : (lead.links || []).find((x) => /form|candid|soumi|submi|contact|booking|apply/i.test((x.label || '') + ' ' + x.url));

  const copy = async (text: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(msg);
    } catch {
      toast.error('Copie impossible : sélectionne le texte à la main');
    }
  };

  return (
    <div className="space-y-3 rounded-xl border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold">
          <Mail className="h-4 w-4 text-primary" /> Brouillon d&apos;email
        </h4>
        <div className="flex gap-1.5">
          <Select
            value={kind}
            onValueChange={(v) => {
              setKind(v as MailKind);
              reset(v as MailKind, lang);
            }}
          >
            <SelectTrigger className="h-8 w-auto text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(KINDS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={lang}
            onValueChange={(v) => {
              setLang(v as MailLang);
              reset(kind, v as MailLang);
            }}
          >
            <SelectTrigger className="h-8 w-auto text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fr">Français</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Destinataire(s)</Label>
          <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="prog@lieu.fr" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Objet</Label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
      </div>
      {used.length > 0 && (
        <p className="rounded-md bg-orange-500/10 px-2.5 py-2 text-xs text-orange-600 dark:text-orange-400">
          Cette adresse a déjà été sollicitée pour : {used.map((x) => x.name + (x.draftAt ? ` (${fmtDate(x.draftAt)})` : '')).join(', ')}. Regroupe les demandes ou adapte le
          message pour ne pas envoyer deux fois la même chose.
        </p>
      )}
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[300px] font-mono text-xs leading-relaxed" />
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" className="gap-1.5">
          <a
            href={mailtoOf({ to, subject, body })}
            target="_blank"
            rel="noopener"
            onClick={() => {
              void actions.draftOpened(lead, recipients);
              toast.success('Ouvert dans Mail. Une fois envoyé : « Contacté par mail ».', { duration: 6000 });
            }}
          >
            <Send className="h-3.5 w-3.5" /> Ouvrir dans Mail{recipients.length ? '' : ' (sans destinataire)'}
          </a>
        </Button>
        {!recipients.length && form && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => {
              void copy(body, 'Message copié : colle-le dans le formulaire (⌘V)');
              window.open(form.url, '_blank', 'noopener');
            }}
          >
            <ExternalLink className="h-3.5 w-3.5" /> Copier + ouvrir {form.label || 'le formulaire'}
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={!recipients.length}
          title="Pour faire créer le brouillon dans Mail par Claude : « crée les brouillons en attente »"
          onClick={async () => {
            await actions.queueDraft(lead, recipients, subject, body);
            toast.success('Brouillon en file : demande à Claude « crée les brouillons en attente »');
          }}
        >
          File pour Claude
        </Button>
        <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => copy(`À : ${to}\nObjet : ${subject}\n\n${body}`, 'Email copié')}>
          <Copy className="h-3.5 w-3.5" /> Copier
        </Button>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={onClose}>
          Fermer
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">Vérifie que le compte expéditeur dans Mail est bien booking@kruzberg.com.</p>
    </div>
  );
}

// ---------------------------------------------------------------- panel

export function LeadPanel({
  lead,
  idx,
  composeOnOpen,
  onClose,
  onJump,
}: {
  lead: Lead;
  idx: RadarIndex;
  composeOnOpen?: boolean;
  onClose: () => void;
  onJump: (id: string) => void;
}) {
  const actions = useRadarActions();
  const [composing, setComposing] = useState(!!composeOnOpen);
  const [notes, setNotes] = useState(lead.notes || '');
  const [otherReason, setOtherReason] = useState('');
  const [lastLead, setLastLead] = useState(lead.id);
  if (lastLead !== lead.id) {
    setLastLead(lead.id);
    setComposing(!!composeOnOpen);
    setNotes(lead.notes || '');
    setOtherReason('');
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const c = chance(lead);
  const [tierLabel, tier] = TIER(c.sc);
  const k = keyDate(lead);
  const C = inCrm(lead);
  const ex = expired(lead);
  const st = lead.status || 'nouveau';
  const dups = live(lead) ? dupsOf(idx, lead) : [];
  const neighbours = live(lead) && lead.city ? (idx.city.get(normCity(lead.city))?.items ?? []).filter((x) => x.id !== lead.id) : [];
  const crmPath = lead.crmUrl ? (() => { try { const u = new URL(lead.crmUrl!); return u.pathname + u.search; } catch { return null; } })() : null;
  const facts: [string, React.ReactNode][] = [
    ['Organisation', lead.org],
    ['Salle', lead.venue],
    ['Date', lead.eventDate ? (/^\d{4}-\d{2}-\d{2}$/.test(lead.eventDate) ? fmtDate(lead.eventDate) : lead.eventDate) : null],
    ['Deadline', lead.deadline ? fmtDate(lead.deadline) : null],
    ['Jauge', lead.capacity ? (/^\s*[\d\s~≈.,-]+\s*$/.test(String(lead.capacity)) ? `${lead.capacity} pl.` : String(lead.capacity)) : null],
    ['1re partie', lead.support],
    ['Qui décide', lead.decider ? `${lead.decider}${lead.deciderWho ? ' · ' + lead.deciderWho : ''}` : null],
    ['Contact', lead.contact],
    ['Contacté', lead.contactedAt ? fmtDate(lead.contactedAt) + (lead.contactChannel ? ' · par ' + lead.contactChannel : '') : null],
    ['Ajoutée', fmtDate(lead.addedAt)],
    ['Vérifié', lead.verified],
  ];

  return (
    <motion.aside
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 26, stiffness: 220 }}
      className="fixed right-0 top-0 z-50 flex h-screen w-full max-w-xl flex-col border-l bg-card shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>{CATL[lead.cat] || lead.cat}</span>·<span>{zone(lead)}</span>
            {lead.type && <>· <span>{lead.type}</span></>}
          </div>
          <h2 className="mt-0.5 text-lg font-semibold leading-tight">{lead.name}</h2>
          {(lead.city || lead.venue) && (
            <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              {[lead.venue, lead.city, lead.country && lead.country !== 'FR' ? lead.country : null].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ChanceBadge lead={lead} className="text-sm" />
          <Button variant="ghost" size="icon" onClick={onClose} title="Fermer (Échap)">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b px-4 py-2.5">
        {C ? (
          <>
            {crmPath && (
              <Button asChild size="sm" className="gap-1.5">
                <Link href={crmPath}>
                  <Kanban className="h-3.5 w-3.5" /> Ouvrir dans le pipeline
                </Link>
              </Button>
            )}
            <Button size="sm" variant="outline" className="gap-1.5" disabled={actions.busy} onClick={() => actions.sendToPipeline(lead)} title="Renvoie les infos à jour (ne change pas l'étape)">
              <RotateCcw className="h-3.5 w-3.5" /> Resynchro
            </Button>
          </>
        ) : isKnown(lead) ? (
          <>
            {lead._known!.path && (
              <Button asChild size="sm" className="gap-1.5">
                <Link href={lead._known!.path}>
                  <Kanban className="h-3.5 w-3.5" /> Voir dans le CRM
                </Link>
              </Button>
            )}
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => actions.dismiss(lead, 'Déjà contacté').then(onClose)}>
              <Ban className="h-3.5 w-3.5" /> Écarter (déjà contacté)
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto gap-1.5 text-muted-foreground"
              title="Fausse alerte : la piste revient dans le radar"
              onClick={() => actions.patch(lead.id, { knownIgnore: true }).then(() => toast.success('Remise dans le radar'))}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Pas un doublon
            </Button>
          </>
        ) : lead.dismissed || ex ? (
          lead.dismissed && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => actions.restore(lead)}>
              <RotateCcw className="h-3.5 w-3.5" /> Restaurer
            </Button>
          )
        ) : (
          <>
            <Button size="sm" className="gap-1.5" onClick={() => setComposing(true)}>
              <Mail className="h-3.5 w-3.5" /> {lead.email ? 'Email' : 'Message'}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Check className="h-3.5 w-3.5" /> Contacté <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel className="text-xs">Contacté aujourd&apos;hui → pipeline</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {['email', 'formulaire', 'DM / téléphone'].map((ch) => (
                  <DropdownMenuItem key={ch} onClick={() => actions.markContacted(lead, ch)}>
                    Par {ch}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant="outline" className="gap-1.5" disabled={actions.busy} onClick={() => actions.sendToPipeline(lead)} title="Envoie au pipeline : la piste quitte alors le radar">
              <Plus className="h-3.5 w-3.5" /> Pipeline
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="ml-auto gap-1.5 text-muted-foreground hover:text-destructive">
                  <Ban className="h-3.5 w-3.5" /> Écarter
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs">Pourquoi ? (affine la veille)</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {REASONS.map((r, i) => (
                  <DropdownMenuItem key={r} onClick={() => actions.dismiss(lead, r).then(onClose)}>
                    {r}
                    <span className="ml-auto text-[10px] text-muted-foreground">{i + 1}</span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <div className="flex gap-1 p-1" onKeyDown={(e) => e.stopPropagation()}>
                  <Input value={otherReason} onChange={(e) => setOtherReason(e.target.value)} placeholder="Autre raison…" className="h-7 text-xs" />
                  <Button size="sm" className="h-7" disabled={!otherReason.trim()} onClick={() => actions.dismiss(lead, otherReason.trim()).then(onClose)}>
                    OK
                  </Button>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-5 p-4">
          {/* Status line */}
          <div className="flex flex-wrap gap-1.5">
            {k && (
              <Tag tone={k.n < 0 ? 'muted' : k.n <= 14 ? 'urgent' : 'warn'}>
                {k.kind} {fmtDate(k.d)}
                {k.n >= 0 ? ` · J-${k.n}` : ''}
              </Tag>
            )}
            {C && <Tag tone="crm">Pipeline · {STAGE_LABEL[lead.crmStage || ''] || lead.crmStage || '—'}</Tag>}
            {isKnown(lead) && <Tag tone="warn">Déjà connue : {lead._known!.why}</Tag>}
            {lead.dismissed && <Tag tone="muted">Écartée{lead.dismissReason ? ` : ${lead.dismissReason}` : ''}</Tag>}
            {ex && !lead.dismissed && !C && <Tag tone="muted">périmée</Tag>}
            {hasDraft(lead) && !C && <Tag tone={lead.draftState === 'pending' ? 'warn' : 'ok'}>{lead.draftState === 'pending' ? 'brouillon en file' : `brouillon ${fmtDate(lead.draftAt)}`}</Tag>}
            {dups.map((d) => (
              <Tag key={d.id} tone="warn" className="cursor-pointer underline decoration-dotted" onClick={() => onJump(d.id)}>
                doublon ? {d.name}
              </Tag>
            ))}
          </div>

          {composing && !C && <MailComposer lead={lead} idx={idx} onClose={() => setComposing(false)} />}

          {/* Chances */}
          <div className="rounded-xl border p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">
                Chances : {c.sc}/100 · {tierLabel}
              </span>
              <span className="text-[11px] text-muted-foreground">{c.src}</span>
            </div>
            {c.why && <p className="mt-1 text-sm text-muted-foreground">{c.why}</p>}
            <div className="mt-3 space-y-1.5">
              {c.parts.map(([label, v]) => (
                <div key={label} className="grid grid-cols-[minmax(0,1fr)_100px_36px] items-center gap-2 text-xs text-muted-foreground">
                  <span className="truncate">{label}</span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <span className={cn('block h-full rounded-full', TIER_BAR[tier])} style={{ width: `${v}%` }} />
                  </span>
                  <span className="text-right font-mono">{v}</span>
                </div>
              ))}
            </div>
            {!C && live(lead) && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                Ton avis{c.adj ? ` (${c.adj > 0 ? '+' : ''}${c.adj})` : ''} :
                <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[11px]" onClick={() => actions.adjustChance(lead, 10)}>
                  <Plus className="h-3 w-3" /> Plus réaliste
                </Button>
                <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[11px]" onClick={() => actions.adjustChance(lead, -10)}>
                  <Minus className="h-3 w-3" /> Moins réaliste
                </Button>
                {!!c.adj && (
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => actions.adjustChance(lead, 0)}>
                    Réinitialiser
                  </Button>
                )}
              </div>
            )}
          </div>

          {(lead.why || lead.action) && (
            <div className="space-y-2">
              {lead.why && <p className="text-sm">{lead.why}</p>}
              {lead.action && (
                <div className="rounded-lg border-l-2 border-primary bg-primary/5 px-3 py-2 text-sm">
                  <span className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Prochaine action</span>
                  {lead.action}
                </div>
              )}
            </div>
          )}

          {/* Contact */}
          <div className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contact</h3>
            {lead.email ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono">{lead.email}</span>
                <Button size="icon" variant="ghost" className="h-6 w-6" title="Copier" onClick={() => navigator.clipboard.writeText(lead.email!).then(() => toast.success('Email copié'))}>
                  <Copy className="h-3 w-3" />
                </Button>
                {lead.emailSource && /^https?:/.test(lead.emailSource) && (
                  <a href={lead.emailSource} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-primary">
                    source ↗
                  </a>
                )}
              </div>
            ) : (
              <p className="text-sm text-orange-600 dark:text-orange-400">Aucune adresse programmation publiée</p>
            )}
            {lead.contactRoute && <p className="text-sm text-muted-foreground">{lead.contactRoute}</p>}
            <div className="flex flex-wrap gap-1.5">
              {lead.contactForm && okUrl(lead.contactForm.url) && (
                <Button asChild size="sm" variant="outline" className="h-7 gap-1 text-xs">
                  <a href={lead.contactForm.url} target="_blank" rel="noreferrer">
                    <FileText className="h-3 w-3" /> {lead.contactForm.label || 'Formulaire'}
                  </a>
                </Button>
              )}
              {lead.instagram && okUrl(lead.instagram) && /instagram\.com/.test(lead.instagram) && (
                <Button asChild size="sm" variant="outline" className="h-7 gap-1 text-xs">
                  <a href={lead.instagram} target="_blank" rel="noreferrer">
                    <AtSign className="h-3 w-3" /> Instagram
                  </a>
                </Button>
              )}
            </div>
            {lead.emailGeneric && (
              <p className="text-xs text-muted-foreground">
                Générique : <span className="font-mono">{lead.emailGeneric}</span> (boîte générale, dernier recours)
              </p>
            )}
          </div>

          {/* Facts */}
          <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
            {facts
              .filter(([, v]) => v)
              .map(([label, v]) => (
                <div key={label} className="contents">
                  <dt className="text-xs text-muted-foreground pt-0.5">{label}</dt>
                  <dd className="break-words">{v}</dd>
                </div>
              ))}
          </dl>

          {(lead.links || []).length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
              {(lead.links || [])
                .filter((x) => x && /^https?:\/\//.test(x.url))
                .map((x) => (
                  <a key={x.url} href={x.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">
                    {x.label || 'Lien'} <ArrowUpRight className="h-3 w-3" />
                  </a>
                ))}
            </div>
          )}

          {neighbours.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Aussi à {String(lead.city).split(/[(,]/)[0].trim()} (pour grouper une date ou une tournée) :
              <div className="mt-1.5 flex flex-wrap gap-1">
                {neighbours.slice(0, 12).map((x) => (
                  <button key={x.id} type="button" onClick={() => onJump(x.id)} className="rounded border px-1.5 py-0.5 hover:border-primary hover:text-foreground">
                    {x.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {/* Triage & notes */}
          {!C && !lead.dismissed && !ex && (
            <div className="space-y-1.5">
              <Label className="text-xs">Statut · « contacté » et au-delà envoient la piste au pipeline</Label>
              <Select value={st} onValueChange={(v) => actions.setStatus(lead, v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => notes !== (lead.notes || '') && actions.patch(lead.id, { notes }).then(() => toast.success('Notes enregistrées'))}
              placeholder="Réponse, info utile, idée…"
              className="min-h-[80px]"
            />
          </div>
        </div>
      </ScrollArea>
    </motion.aside>
  );
}
