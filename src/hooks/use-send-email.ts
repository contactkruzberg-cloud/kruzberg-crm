'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface SendEmailParams {
  to: string;
  subject: string;
  emailBody: string;
  dealId?: string;
  contactId?: string;
  venueId?: string;
  templateId?: string;
}

export function useSendEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: SendEmailParams) => {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur envoi');
      return data;
    },
    onSuccess: () => {
      toast.success('Email envoyé !');
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      queryClient.invalidateQueries({ queryKey: ['template_sends'] });
    },
    onError: (error: Error) => {
      toast.error(`Erreur : ${error.message}`);
    },
  });
}

export function useSyncEmails() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/email/sync');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur sync');
      return data as { emailsChecked: number; newReplies: number };
    },
    onSuccess: (data) => {
      if (data.newReplies > 0) {
        toast.success(`${data.newReplies} nouvelle(s) réponse(s) détectée(s) !`);
        queryClient.invalidateQueries({ queryKey: ['deals'] });
        queryClient.invalidateQueries({ queryKey: ['activities'] });
      } else {
        toast.info(`${data.emailsChecked} emails vérifiés — aucune nouvelle réponse`);
      }
    },
    onError: (error: Error) => {
      toast.error(`Erreur sync : ${error.message}`);
    },
  });
}
