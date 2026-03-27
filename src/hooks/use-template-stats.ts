'use client';

import { useMemo } from 'react';
import { useTemplates, useTemplateSends } from '@/hooks/use-templates';
import { useDeals } from '@/hooks/use-deals';
import { useActivities } from '@/hooks/use-activities';
import type { Template, DealStage, VenueType } from '@/types/database';

export interface TemplateStats {
  templateId: string;
  templateName: string;
  category: string;
  sendCount: number;
  replyCount: number;
  responseRate: number;
}

export function useTemplateStats(): TemplateStats[] {
  const { data: templates } = useTemplates();
  const { data: sends } = useTemplateSends();
  const { data: activities } = useActivities(500);

  return useMemo(() => {
    if (!templates || !sends) return [];

    // Count sends per template
    const sendsByTemplate = new Map<string, string[]>();
    for (const send of sends) {
      const dealIds = sendsByTemplate.get(send.template_id) || [];
      if (send.deal_id) dealIds.push(send.deal_id);
      sendsByTemplate.set(send.template_id, dealIds);
    }

    // Count replies per deal
    const repliedDeals = new Set<string>();
    if (activities) {
      for (const a of activities) {
        if (a.type === 'reply_received' && a.deal_id) {
          repliedDeals.add(a.deal_id);
        }
      }
    }

    return templates.map((t) => {
      const dealIds = sendsByTemplate.get(t.id) || [];
      const sendCount = dealIds.length;
      const replyCount = dealIds.filter((id) => repliedDeals.has(id)).length;
      const responseRate = sendCount > 0 ? Math.round((replyCount / sendCount) * 100) : 0;

      return {
        templateId: t.id,
        templateName: t.name,
        category: t.category,
        sendCount,
        replyCount,
        responseRate,
      };
    });
  }, [templates, sends, activities]);
}

export function useSuggestedTemplate(
  stage?: DealStage,
  venueType?: VenueType
): Template | null {
  const { data: templates } = useTemplates();
  const stats = useTemplateStats();

  return useMemo(() => {
    if (!templates || templates.length === 0) return null;

    // Determine the best category for this stage
    let targetCategory: string;
    switch (stage) {
      case 'a_contacter':
        targetCategory = 'first_contact';
        break;
      case 'contacte':
        targetCategory = 'relance_1';
        break;
      case 'relance':
        targetCategory = 'relance_2';
        break;
      case 'confirme':
        targetCategory = 'confirmation';
        break;
      default:
        targetCategory = 'first_contact';
    }

    // Filter templates by category
    const candidates = templates.filter((t) => t.category === targetCategory);
    if (candidates.length === 0) return templates[0];
    if (candidates.length === 1) return candidates[0];

    // If venue is a festival, prefer festival templates
    if (venueType === 'festival') {
      const festivalTemplate = candidates.find(
        (t) => t.name.toLowerCase().includes('festival')
      );
      if (festivalTemplate) return festivalTemplate;
    }

    // Pick the one with the best response rate (if we have stats)
    const candidateStats = candidates.map((t) => ({
      template: t,
      stats: stats.find((s) => s.templateId === t.id),
    }));

    const withData = candidateStats.filter((c) => c.stats && c.stats.sendCount > 0);
    if (withData.length > 0) {
      withData.sort((a, b) => (b.stats?.responseRate || 0) - (a.stats?.responseRate || 0));
      return withData[0].template;
    }

    return candidates[0];
  }, [templates, stats, stage, venueType]);
}
