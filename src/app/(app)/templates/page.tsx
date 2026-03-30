'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTemplates, useCreateTemplate, useUpdateTemplate, useDeleteTemplate, useTemplateSends } from '@/hooks/use-templates';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TEMPLATE_CATEGORIES, type Template, type TemplateCategory } from '@/types/database';
import { resolveTemplate, formatDate } from '@/lib/utils';
import { Plus, Copy, Trash2, Mail, Clock, FileText, Eye, Send, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { useActivities } from '@/hooks/use-activities';

const SAMPLE_VARIABLES: Record<string, string> = {
  nom_contact: 'Marie Martin',
  nom_lieu: 'Le Petit Bain',
  date_dernier_mail: '15 mars 2026',
  single: 'Fractures',
  nom_groupe: 'KRUZBERG',
};

export default function TemplatesPage() {
  const { data: templates, isLoading } = useTemplates();
  const { data: sends } = useTemplateSends();
  const { data: emailActivities } = useActivities(500);
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const deleteTemplate = useDeleteTemplate();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<TemplateCategory>('first_contact');
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [tab, setTab] = useState('editor');
  const [pageTab, setPageTab] = useState<'templates' | 'history'>('templates');
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);

  const selectedTemplate = templates?.find((t) => t.id === selectedId);

  const selectTemplate = (t: Template) => {
    setSelectedId(t.id);
    setEditName(t.name);
    setEditCategory(t.category);
    setEditSubject(t.subject);
    setEditBody(t.body);
  };

  const handleCreate = async () => {
    const t = await createTemplate.mutateAsync({
      name: 'Nouveau template',
      category: 'first_contact',
      subject: 'Demande de concert — KRUZBERG',
      body: 'Bonjour {{nom_contact}},\n\nJe me permets de vous contacter au nom de KRUZBERG...\n\nCordialement,\nKRUZBERG',
    });
    selectTemplate(t);
    toast.success('Template créé');
  };

  const handleSave = () => {
    if (!selectedId) return;
    updateTemplate.mutate({
      id: selectedId,
      name: editName,
      category: editCategory,
      subject: editSubject,
      body: editBody,
    }, {
      onSuccess: () => toast.success('Template sauvegardé'),
    });
  };

  const handleDelete = () => {
    if (!selectedId) return;
    if (!confirm('Supprimer ce template ?')) return;
    deleteTemplate.mutate(selectedId, {
      onSuccess: () => {
        setSelectedId(null);
        toast.success('Template supprimé');
      },
    });
  };

  const handleCopy = () => {
    const resolved = resolveTemplate(editBody, SAMPLE_VARIABLES);
    navigator.clipboard.writeText(resolved);
    toast.success('Copié dans le presse-papier');
  };

  const preview = resolveTemplate(editBody, SAMPLE_VARIABLES);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-96 lg:col-span-2" />
        </div>
      </div>
    );
  }

  // Build unified email history
  interface SentEmail {
    id: string;
    to: string;
    subject: string;
    body: string;
    date: string;
    venueName: string | null;
    contactName: string | null;
    templateName: string | null;
  }

  // Parse activities — handle both new format (À:/Objet:/body) and old format (Email envoyé : "subject" → to)
  const sentEmails: SentEmail[] = (emailActivities || [])
    .filter((a) => a.type === 'email_sent')
    .map((a) => {
      if (a.content.includes('\nObjet :')) {
        // New format
        const lines = a.content.split('\n');
        return {
          id: a.id,
          to: lines[0]?.replace('À : ', '') || '',
          subject: lines[1]?.replace('Objet : ', '') || '',
          body: lines.slice(3).join('\n'),
          date: a.created_at,
          venueName: a.venue ? (a.venue as { name: string }).name : null,
          contactName: a.contact ? (a.contact as { name: string }).name : null,
          templateName: null,
        };
      }
      // Old format: 'Email envoyé : "subject" → to'
      const oldMatch = a.content.match(/Email envoyé : "(.+?)" → (.+)/);
      return {
        id: a.id,
        to: oldMatch?.[2] || '',
        subject: oldMatch?.[1] || a.content,
        body: '',
        date: a.created_at,
        venueName: a.venue ? (a.venue as { name: string }).name : null,
        contactName: a.contact ? (a.contact as { name: string }).name : null,
        templateName: null,
      };
    });

  // Parse template_sends — handle both new format (À:/Objet:/body) and old format (raw body)
  const templateSendEmails: SentEmail[] = (sends || [])
    .map((s) => {
      if (s.generated_body.startsWith('À : ')) {
        // New format
        const lines = s.generated_body.split('\n');
        return {
          id: s.id,
          to: lines[0]?.replace('À : ', '') || '',
          subject: lines[1]?.replace('Objet : ', '') || '',
          body: lines.slice(3).join('\n'),
          date: s.created_at,
          venueName: s.deal?.venue ? (s.deal.venue as { name: string }).name : null,
          contactName: s.contact ? (s.contact as { name: string }).name : null,
          templateName: s.template?.name || null,
        };
      }
      // Old format: generated_body is the raw email body
      return {
        id: s.id,
        to: s.contact ? (s.contact as { email?: string }).email || '' : '',
        subject: s.template?.subject || '',
        body: s.generated_body,
        date: s.created_at,
        venueName: s.deal?.venue ? (s.deal.venue as { name: string }).name : null,
        contactName: s.contact ? (s.contact as { name: string }).name : null,
        templateName: s.template?.name || null,
      };
    });

  // Merge and deduplicate
  const allEmails: SentEmail[] = [...sentEmails];
  for (const ts of templateSendEmails) {
    const isDuplicate = allEmails.some((e) =>
      Math.abs(new Date(e.date).getTime() - new Date(ts.date).getTime()) < 5000 &&
      e.to === ts.to
    );
    if (!isDuplicate) allEmails.push(ts);
  }
  allEmails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold">Templates & Communications</h1>
          <Tabs value={pageTab} onValueChange={(v) => setPageTab(v as 'templates' | 'history')}>
            <TabsList>
              <TabsTrigger value="templates" className="gap-2">
                <FileText className="h-3.5 w-3.5" />
                Templates
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-2">
                <Send className="h-3.5 w-3.5" />
                Emails envoyés ({allEmails.length})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        {pageTab === 'templates' && (
          <Button size="sm" className="gap-2" onClick={handleCreate}>
            <Plus className="h-4 w-4" />
            Nouveau template
          </Button>
        )}
      </div>

      {pageTab === 'history' && (
        <div className="space-y-2">
          {allEmails.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground border rounded-xl border-dashed">
              <Send className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Aucun email envoyé depuis le CRM</p>
              <p className="text-xs mt-1">Les emails envoyés apparaîtront ici avec leur contenu complet</p>
            </div>
          ) : (
            allEmails.map((email) => {
              const isExpanded = expandedEmailId === email.id;
              return (
                <div
                  key={email.id}
                  className="rounded-lg border bg-card overflow-hidden transition-shadow hover:shadow-sm"
                >
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer"
                    onClick={() => setExpandedEmailId(isExpanded ? null : email.id)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">{email.subject || '(sans objet)'}</p>
                        {'templateName' in email && email.templateName && (
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {email.templateName}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>→ {email.to}</span>
                        {'venueName' in email && email.venueName && (
                          <span>• {email.venueName}</span>
                        )}
                        {email.contactName && (
                          <span>• {email.contactName}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      <span className="text-xs text-muted-foreground">{formatDate(email.date)}</span>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="border-t px-4 py-3 bg-muted/30">
                      <div className="whitespace-pre-wrap text-sm leading-relaxed max-h-80 overflow-y-auto">
                        {email.body}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs gap-1.5"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(email.body);
                            toast.success('Corps du mail copié');
                          }}
                        >
                          <Copy className="h-3 w-3" />
                          Copier le corps
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {pageTab === 'templates' && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Template list */}
        <div className="space-y-3">
          <ScrollArea className="h-[calc(100vh-250px)]">
            <div className="space-y-2 pr-2">
              {TEMPLATE_CATEGORIES.map((cat) => {
                const catTemplates = (templates || []).filter((t) => t.category === cat.key);
                if (catTemplates.length === 0) return null;
                return (
                  <div key={cat.key}>
                    <p className="text-xs text-muted-foreground font-medium px-1 mb-1.5">
                      {cat.label}
                    </p>
                    {catTemplates.map((t) => (
                      <div
                        key={t.id}
                        onClick={() => selectTemplate(t)}
                        className={`p-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm mb-1.5 ${
                          selectedId === t.id ? 'border-primary/50 bg-primary/5' : ''
                        }`}
                      >
                        <p className="text-sm font-medium truncate">{t.name}</p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {t.subject}
                        </p>
                      </div>
                    ))}
                  </div>
                );
              })}
              {(!templates || templates.length === 0) && (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Aucun template</p>
                  <p className="text-xs mt-1">Créez votre premier template</p>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Send log summary */}
          {sends && sends.length > 0 && (
            <Card>
              <CardHeader className="p-3 pb-2">
                <CardTitle className="text-xs flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />
                  Derniers envois
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 space-y-1.5">
                {sends.slice(0, 3).map((s) => (
                  <div key={s.id} className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {s.template?.name || 'Template'}
                    </span>
                    {' → '}
                    {s.contact ? (s.contact as { name: string }).name : 'Contact'}
                    <span className="ml-1">{formatDate(s.created_at)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Editor / Preview */}
        <div className="lg:col-span-2">
          {selectedId ? (
            <Card>
              <CardContent className="p-5 space-y-4">
                <Tabs value={tab} onValueChange={setTab}>
                  <div className="flex items-center justify-between">
                    <TabsList>
                      <TabsTrigger value="editor" className="gap-2">
                        <Mail className="h-3.5 w-3.5" />
                        Éditeur
                      </TabsTrigger>
                      <TabsTrigger value="preview" className="gap-2">
                        <Eye className="h-3.5 w-3.5" />
                        Aperçu
                      </TabsTrigger>
                    </TabsList>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={handleCopy}>
                        <Copy className="h-3.5 w-3.5 mr-1.5" />
                        Copier
                      </Button>
                      <Button variant="ghost" size="sm" onClick={handleDelete} className="text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <TabsContent value="editor" className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs">Nom</Label>
                        <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Catégorie</Label>
                        <Select value={editCategory} onValueChange={(v) => setEditCategory(v as TemplateCategory)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {TEMPLATE_CATEGORIES.map((c) => (
                              <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Objet</Label>
                      <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Corps du message</Label>
                      <Textarea
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        className="min-h-[300px] font-mono text-sm"
                      />
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs text-muted-foreground">Variables :</p>
                      {Object.keys(SAMPLE_VARIABLES).map((v) => (
                        <Badge
                          key={v}
                          variant="outline"
                          className="text-[10px] cursor-pointer hover:bg-primary/10"
                          onClick={() => setEditBody((b) => b + `{{${v}}}`)}
                        >
                          {`{{${v}}}`}
                        </Badge>
                      ))}
                    </div>

                    <Button onClick={handleSave} disabled={updateTemplate.isPending}>
                      {updateTemplate.isPending ? 'Sauvegarde...' : 'Sauvegarder'}
                    </Button>
                  </TabsContent>

                  <TabsContent value="preview">
                    <div className="rounded-lg border p-6 bg-white dark:bg-zinc-950 space-y-3">
                      <div className="border-b pb-3">
                        <p className="text-sm">
                          <span className="text-muted-foreground">Objet :</span>{' '}
                          <span className="font-medium">{resolveTemplate(editSubject, SAMPLE_VARIABLES)}</span>
                        </p>
                      </div>
                      <div className="whitespace-pre-wrap text-sm leading-relaxed">
                        {preview}
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground border rounded-xl border-dashed">
              <div className="text-center">
                <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Sélectionnez un template pour l&apos;éditer</p>
              </div>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
