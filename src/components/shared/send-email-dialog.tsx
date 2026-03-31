'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useTemplates } from '@/hooks/use-templates';
import { useSendEmail } from '@/hooks/use-send-email';
import { resolveTemplate, formatDate } from '@/lib/utils';
import { Send, Copy, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Deal, Contact, Venue, Template } from '@/types/database';

interface SendEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal?: Deal;
  contact?: Contact | null;
  venue?: Venue | null;
  suggestedCategory?: string;
}

export function SendEmailDialog({
  open,
  onOpenChange,
  deal,
  contact,
  venue,
  suggestedCategory,
}: SendEmailDialogProps) {
  const { data: templates } = useTemplates();
  const sendEmail = useSendEmail();

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  // Build variables for template resolution
  const variables: Record<string, string> = {
    nom_contact: contact?.name || 'Contact',
    nom_lieu: venue?.name || deal?.venue?.name || '',
    date_dernier_mail: deal?.last_message_at
      ? formatDate(deal.last_message_at)
      : '[DATE]',
    single: 'Where I Belong',
    nom_groupe: 'KRUZBERG',
  };

  // Auto-select best template based on deal stage
  useEffect(() => {
    if (!templates || templates.length === 0) return;

    const category = suggestedCategory || getSuggestedCategory(deal);
    const match = templates.find((t) => t.category === category);
    if (match && !selectedTemplateId) {
      setSelectedTemplateId(match.id);
    }
  }, [templates, deal, suggestedCategory, selectedTemplateId]);

  // Auto-fill recipient only when dialog opens
  useEffect(() => {
    if (!open) return;
    const email = contact?.email || venue?.email || deal?.contact?.email || deal?.venue?.email || '';
    if (email && !email.startsWith('http')) {
      setTo(email);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Apply template
  useEffect(() => {
    if (!selectedTemplateId || !templates) return;
    const template = templates.find((t) => t.id === selectedTemplateId);
    if (!template) return;

    setSubject(resolveTemplate(template.subject, variables));
    setBody(resolveTemplate(template.body, variables));
  }, [selectedTemplateId, templates]);

  const handleSend = () => {
    if (!to || !subject || !body) {
      toast.error('Tous les champs sont requis');
      return;
    }

    sendEmail.mutate(
      {
        to,
        subject,
        emailBody: body,
        dealId: deal?.id,
        contactId: contact?.id || deal?.contact_id || undefined,
        venueId: venue?.id || deal?.venue_id || undefined,
        templateId: selectedTemplateId || undefined,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setSelectedTemplateId('');
          setTo('');
          setSubject('');
          setBody('');
        },
      }
    );
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(body);
    toast.success('Copié dans le presse-papier');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            Envoyer un email
          </DialogTitle>
          <DialogDescription>
            {venue?.name || deal?.venue?.name || 'Nouveau message'}
            {contact?.name && ` — ${contact.name}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template selector */}
          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1.5">
              <Wand2 className="h-3 w-3" />
              Template
            </Label>
            <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir un template..." />
              </SelectTrigger>
              <SelectContent>
                {templates?.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* To */}
          <div className="space-y-2">
            <Label className="text-xs">Destinataire</Label>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="email@venue.com"
              type="email"
            />
          </div>

          {/* Subject */}
          <div className="space-y-2">
            <Label className="text-xs">Objet</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Objet du message"
            />
          </div>

          {/* Body */}
          <div className="space-y-2">
            <Label className="text-xs">Message</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="min-h-[250px] font-mono text-sm"
            />
          </div>

          {/* Info badges */}
          <div className="flex gap-2 flex-wrap">
            {contact?.tone && (
              <Badge variant="outline" className="text-[10px]">
                Ton : {contact.tone}
              </Badge>
            )}
            {deal?.stage && (
              <Badge variant="outline" className="text-[10px]">
                Stage : {deal.stage.replace('_', ' ')}
              </Badge>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-between pt-2">
            <Button variant="outline" size="sm" onClick={handleCopy} className="gap-2">
              <Copy className="h-3.5 w-3.5" />
              Copier
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Annuler
              </Button>
              <Button
                onClick={handleSend}
                disabled={sendEmail.isPending || !to}
                className="gap-2"
              >
                <Send className="h-4 w-4" />
                {sendEmail.isPending ? 'Envoi...' : 'Envoyer'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function getSuggestedCategory(deal?: Deal): string {
  if (!deal) return 'first_contact';
  switch (deal.stage) {
    case 'a_contacter':
      return 'first_contact';
    case 'contacte':
      return 'relance_1';
    case 'relance':
      return 'relance_2';
    case 'confirme':
      return 'confirmation';
    default:
      return 'first_contact';
  }
}
