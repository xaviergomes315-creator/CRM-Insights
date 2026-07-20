import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Megaphone, Plus, Search, Play, X, Loader2, Users,
  CheckCircle2, XCircle, Clock, Send, AlertCircle, Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchCampaigns, createCampaign, startCampaign, cancelCampaign,
  type Campaign, type CampaignStatus, type CreateCampaignPayload,
} from '@/lib/campaigns-api';
import {
  fetchConversations, fetchTemplates, extractTemplateVars,
  type WaConversation, type WaTemplate,
} from '@/lib/whatsapp-api';

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<CampaignStatus, {
  label: string;
  icon:  React.ElementType;
  cls:   string;
}> = {
  draft:     { label: 'Draft',     icon: Clock,         cls: 'bg-gray-100 text-gray-600 border-gray-200'    },
  running:   { label: 'Running',   icon: Loader2,        cls: 'bg-blue-100 text-blue-700 border-blue-200'    },
  completed: { label: 'Completed', icon: CheckCircle2,   cls: 'bg-green-100 text-green-700 border-green-200' },
  cancelled: { label: 'Cancelled', icon: XCircle,        cls: 'bg-red-100 text-red-600 border-red-200'       },
};

function StatusBadge({ status }: { status: CampaignStatus }) {
  const { label, icon: Icon, cls } = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cls}`}>
      <Icon size={12} className={status === 'running' ? 'animate-spin' : ''} />
      {label}
    </span>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function CampaignProgressBar({ campaign }: { campaign: Campaign }) {
  const { total_count, sent_count, failed_count, cancelled_count } = campaign;
  const total = Math.max(total_count, 1); // avoid /0

  const sentPct      = (sent_count      / total) * 100;
  const failedPct    = (failed_count    / total) * 100;
  const cancelledPct = (cancelled_count / total) * 100;
  const donePct      = sentPct + failedPct + cancelledPct;

  return (
    <div className="space-y-1.5">
      {/* Bar */}
      <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden flex">
        <div
          className="h-full bg-green-500 transition-all duration-500"
          style={{ width: `${sentPct}%` }}
        />
        <div
          className="h-full bg-red-400 transition-all duration-500"
          style={{ width: `${failedPct}%` }}
        />
        <div
          className="h-full bg-gray-300 transition-all duration-500"
          style={{ width: `${cancelledPct}%` }}
        />
      </div>
      {/* Labels */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
            {sent_count} sent
          </span>
          {failed_count > 0 && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-red-400" />
              {failed_count} failed
            </span>
          )}
          {cancelled_count > 0 && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-gray-300" />
              {cancelled_count} cancelled
            </span>
          )}
        </div>
        <span className="font-medium text-gray-700">
          {Math.round(donePct)}% · {total_count} total
        </span>
      </div>
    </div>
  );
}

// ── Campaign card ─────────────────────────────────────────────────────────────

interface CampaignCardProps {
  campaign:  Campaign;
  onStart:   (id: string) => void;
  onCancel:  (id: string) => void;
  starting:  boolean;
  cancelling: boolean;
}

function CampaignCard({ campaign, onStart, onCancel, starting, cancelling }: CampaignCardProps) {
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const canStart  = campaign.status === 'draft';
  const canCancel = campaign.status === 'draft' || campaign.status === 'running';

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow p-5 flex flex-col gap-4">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{campaign.name}</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Created {fmtDate(campaign.created_at)}
            {campaign.started_at && ` · Started ${fmtDate(campaign.started_at)}`}
            {campaign.completed_at && ` · Done ${fmtDate(campaign.completed_at)}`}
          </p>
        </div>
        <StatusBadge status={campaign.status} />
      </div>

      {/* Message preview */}
      <div className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2 line-clamp-2 border border-gray-100">
        {campaign.message_type === 'template' ? (
          <span className="italic text-gray-400">Template message · {campaign.total_count} recipients</span>
        ) : (
          campaign.body || <span className="italic text-gray-400">No message body</span>
        )}
      </div>

      {/* Progress */}
      {campaign.status !== 'draft' && (
        <CampaignProgressBar campaign={campaign} />
      )}

      {campaign.status === 'draft' && (
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <Users size={13} />
          <span>{campaign.total_count} conversation{campaign.total_count !== 1 ? 's' : ''} selected</span>
          {campaign.scheduled_at && (
            <>
              <span>·</span>
              <Calendar size={13} />
              <span>Scheduled {fmtDate(campaign.scheduled_at)}</span>
            </>
          )}
        </div>
      )}

      {/* Actions */}
      {(canStart || canCancel) && (
        <div className="flex items-center justify-end gap-2 pt-1 border-t border-gray-100">
          {canCancel && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onCancel(campaign.id)}
              disabled={cancelling}
              className="text-red-500 hover:text-red-700 hover:bg-red-50"
            >
              {cancelling ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
              Cancel
            </Button>
          )}
          {canStart && (
            <Button
              size="sm"
              onClick={() => onStart(campaign.id)}
              disabled={starting}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
            >
              {starting ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              Start Campaign
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Create campaign sheet ─────────────────────────────────────────────────────

interface CreateSheetProps {
  open:    boolean;
  onClose: () => void;
  token:   string;
}

function CreateCampaignSheet({ open, onClose, token }: CreateSheetProps) {
  const qc = useQueryClient();

  // Form state
  const [name,            setName]            = useState('');
  const [messageType,     setMessageType]     = useState<'text' | 'template'>('text');
  const [body,            setBody]            = useState('');
  const [templateId,      setTemplateId]      = useState('');
  const [templateParams,  setTemplateParams]  = useState<string[]>([]);
  const [convSearch,      setConvSearch]      = useState('');
  const [selectedConvIds, setSelectedConvIds] = useState<Set<string>>(new Set());
  const [scheduledAt,     setScheduledAt]     = useState('');
  const [startImmediately, setStartImmediately] = useState(false);

  // Fetch conversations for recipient selection
  const { data: convsData, isLoading: convsLoading } = useQuery({
    queryKey: ['wa-conversations-for-campaign'],
    queryFn:  () => fetchConversations(token, 0, 200, 'active'),
    enabled:  open,
  });

  // Fetch approved templates
  const { data: tplData, isLoading: tplLoading } = useQuery({
    queryKey: ['wa-templates-approved'],
    queryFn:  () => fetchTemplates(token, 'approved'),
    enabled:  open && messageType === 'template',
  });

  const conversations: WaConversation[] = convsData?.conversations ?? [];
  const templates:     WaTemplate[]     = tplData?.templates ?? [];

  // Filtered conversation list
  const filteredConvs = useMemo(() => {
    const q = convSearch.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(c =>
      c.contact_name?.toLowerCase().includes(q) ||
      c.contact_phone.includes(q),
    );
  }, [conversations, convSearch]);

  // Template variable slots
  const selectedTemplate = templates.find(t => t.id === templateId);
  const varIndices = selectedTemplate ? extractTemplateVars(selectedTemplate.body_text) : [];

  function handleTemplateChange(id: string) {
    setTemplateId(id);
    setTemplateParams([]);
  }

  function setParam(idx: number, val: string) {
    setTemplateParams(prev => {
      const next = [...prev];
      next[idx] = val;
      return next;
    });
  }

  function toggleConv(id: string) {
    setSelectedConvIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedConvIds.size === filteredConvs.length) {
      setSelectedConvIds(new Set());
    } else {
      setSelectedConvIds(new Set(filteredConvs.map(c => c.id)));
    }
  }

  function resetForm() {
    setName(''); setMessageType('text'); setBody('');
    setTemplateId(''); setTemplateParams([]); setConvSearch('');
    setSelectedConvIds(new Set()); setScheduledAt(''); setStartImmediately(false);
  }

  const createMutation = useMutation({
    mutationFn: async (payload: CreateCampaignPayload & { andStart: boolean }) => {
      const { andStart, ...rest } = payload;
      const res = await createCampaign(token, rest);
      if (andStart) await startCampaign(token, res.campaign.id);
      return { campaign: res.campaign, andStart };
    },
    onSuccess: ({ campaign, andStart }) => {
      qc.invalidateQueries({ queryKey: ['wa-campaigns'] });
      toast.success(andStart
        ? `Campaign "${campaign.name}" created and started — ${campaign.total_count} messages queued.`
        : `Campaign "${campaign.name}" saved as draft.`
      );
      resetForm();
      onClose();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  function submit(andStart: boolean) {
    if (!name.trim()) { toast.error('Campaign name is required.'); return; }
    if (messageType === 'text' && !body.trim()) { toast.error('Message body is required.'); return; }
    if (messageType === 'template' && !templateId) { toast.error('Please select a template.'); return; }
    if (selectedConvIds.size === 0) { toast.error('Select at least one conversation.'); return; }

    const payload: CreateCampaignPayload & { andStart: boolean } = {
      name:            name.trim(),
      messageType,
      conversationIds: Array.from(selectedConvIds),
      andStart,
      ...(messageType === 'text'
        ? { body: body.trim() }
        : { templateId, templateParams }),
      ...(scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
    };
    createMutation.mutate(payload);
  }

  const busy = createMutation.isPending;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v && !busy) { resetForm(); onClose(); } }}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <Megaphone size={20} className="text-blue-600" />
            New Campaign
          </SheetTitle>
          <SheetDescription>
            Send a message to multiple WhatsApp conversations in one go.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-6 py-5 space-y-6">

            {/* Campaign name */}
            <div className="space-y-1.5">
              <Label htmlFor="camp-name">Campaign name <span className="text-red-500">*</span></Label>
              <Input
                id="camp-name"
                placeholder="e.g. July Promotion Blast"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={busy}
              />
            </div>

            {/* Message type */}
            <div className="space-y-2">
              <Label>Message type</Label>
              <div className="grid grid-cols-2 gap-2">
                {(['text', 'template'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setMessageType(t)}
                    disabled={busy}
                    className={`px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                      messageType === t
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {t === 'text' ? '💬 Text' : '📋 Template'}
                  </button>
                ))}
              </div>
            </div>

            {/* Text body */}
            {messageType === 'text' && (
              <div className="space-y-1.5">
                <Label htmlFor="camp-body">Message <span className="text-red-500">*</span></Label>
                <Textarea
                  id="camp-body"
                  placeholder="Type your message here…"
                  rows={4}
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  disabled={busy}
                  className="resize-none"
                />
                <p className="text-xs text-gray-400 text-right">{body.length}/4096</p>
              </div>
            )}

            {/* Template picker */}
            {messageType === 'template' && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Template <span className="text-red-500">*</span></Label>
                  {tplLoading ? (
                    <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                      <Loader2 size={14} className="animate-spin" /> Loading templates…
                    </div>
                  ) : templates.length === 0 ? (
                    <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <AlertCircle size={14} />
                      No approved templates found.
                    </div>
                  ) : (
                    <Select value={templateId} onValueChange={handleTemplateChange} disabled={busy}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a template…" />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map(t => (
                          <SelectItem key={t.id} value={t.id}>
                            <span className="font-medium">{t.name}</span>
                            <span className="text-gray-400 ml-2 text-xs">{t.language}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Template preview + params */}
                {selectedTemplate && (
                  <div className="space-y-3 bg-gray-50 rounded-lg p-3 border border-gray-100">
                    <p className="text-xs text-gray-500 font-medium">Preview</p>
                    <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                      {selectedTemplate.body_text}
                    </p>
                    {varIndices.length > 0 && (
                      <>
                        <Separator />
                        <p className="text-xs text-gray-500 font-medium">Variable values</p>
                        {varIndices.map((n, i) => (
                          <div key={n} className="space-y-1">
                            <Label className="text-xs">{`{{${n}}}`}</Label>
                            <Input
                              placeholder={`Value for {{${n}}}`}
                              value={templateParams[i] ?? ''}
                              onChange={e => setParam(i, e.target.value)}
                              disabled={busy}
                              className="h-8 text-sm"
                            />
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            <Separator />

            {/* Recipient conversations */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <Users size={14} className="text-gray-400" />
                  Recipients <span className="text-red-500">*</span>
                </Label>
                {selectedConvIds.size > 0 && (
                  <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                    {selectedConvIds.size} selected
                  </span>
                )}
              </div>

              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <Input
                  placeholder="Search by name or phone…"
                  value={convSearch}
                  onChange={e => setConvSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                  disabled={busy}
                />
              </div>

              {convsLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-3 justify-center">
                  <Loader2 size={14} className="animate-spin" /> Loading conversations…
                </div>
              ) : filteredConvs.length === 0 ? (
                <div className="text-sm text-gray-400 text-center py-4">
                  {conversations.length === 0 ? 'No conversations found.' : 'No results for this search.'}
                </div>
              ) : (
                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  {/* Select all row */}
                  <label className="flex items-center gap-3 px-3 py-2 bg-gray-50 border-b border-gray-100 cursor-pointer hover:bg-gray-100 transition-colors">
                    <Checkbox
                      checked={filteredConvs.length > 0 && filteredConvs.every(c => selectedConvIds.has(c.id))}
                      onCheckedChange={toggleAll}
                      disabled={busy}
                    />
                    <span className="text-xs font-medium text-gray-500">
                      Select all ({filteredConvs.length})
                    </span>
                  </label>

                  <ScrollArea className="max-h-52">
                    {filteredConvs.map(conv => (
                      <label
                        key={conv.id}
                        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
                      >
                        <Checkbox
                          checked={selectedConvIds.has(conv.id)}
                          onCheckedChange={() => toggleConv(conv.id)}
                          disabled={busy}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">
                            {conv.contact_name || conv.contact_phone}
                          </p>
                          {conv.contact_name && (
                            <p className="text-xs text-gray-400">{conv.contact_phone}</p>
                          )}
                        </div>
                        {conv.status !== 'active' && (
                          <span className="text-xs text-gray-400 capitalize">{conv.status}</span>
                        )}
                      </label>
                    ))}
                  </ScrollArea>
                </div>
              )}
            </div>

            {/* Optional: schedule */}
            <div className="space-y-1.5">
              <Label htmlFor="camp-scheduled" className="flex items-center gap-1.5">
                <Calendar size={14} className="text-gray-400" />
                Schedule (optional)
              </Label>
              <Input
                id="camp-scheduled"
                type="datetime-local"
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
                disabled={busy}
                className="text-sm"
              />
              <p className="text-xs text-gray-400">
                Leave blank to send immediately when started.
              </p>
            </div>

          </div>
        </ScrollArea>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t bg-gray-50 flex items-center gap-2 justify-end">
          <Button
            variant="ghost"
            onClick={() => { resetForm(); onClose(); }}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => submit(false)}
            disabled={busy || selectedConvIds.size === 0}
          >
            {busy && !startImmediately ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
            Save as Draft
          </Button>
          <Button
            onClick={() => { setStartImmediately(true); submit(true); }}
            disabled={busy || selectedConvIds.size === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
          >
            {busy && startImmediately ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Create & Start
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const STATUS_TABS: { value: CampaignStatus | 'all'; label: string }[] = [
  { value: 'all',       label: 'All'       },
  { value: 'draft',     label: 'Draft'     },
  { value: 'running',   label: 'Running'   },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function WhatsAppCampaignsPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? '';
  const qc    = useQueryClient();

  const [activeTab,       setActiveTab]       = useState<CampaignStatus | 'all'>('all');
  const [sheetOpen,       setSheetOpen]       = useState(false);
  const [cancelTarget,    setCancelTarget]    = useState<Campaign | null>(null);
  const [actionCampaignId, setActionCampaignId] = useState<string | null>(null);

  // Fetch ALL campaigns (no status filter) so every tab's counts stay accurate.
  // Client-side filtering handles the active tab display.
  const { data, isLoading, isError } = useQuery({
    queryKey: ['wa-campaigns'],
    queryFn:  () => fetchCampaigns(token, { limit: 100 }),
    enabled: !!token,
    refetchInterval: 5_000, // poll so running campaigns update
  });

  const allCampaigns: Campaign[] = data?.items ?? [];

  // Filter for the currently active tab
  const campaigns = useMemo(() =>
    activeTab === 'all'
      ? allCampaigns
      : allCampaigns.filter(c => c.status === activeTab),
  [allCampaigns, activeTab]);

  // Start mutation
  const startMutation = useMutation({
    mutationFn: (id: string) => startCampaign(token, id),
    onMutate:   (id) => setActionCampaignId(id),
    onSuccess:  (res) => {
      qc.invalidateQueries({ queryKey: ['wa-campaigns'] });
      toast.success(`Campaign started — ${res.queued} messages queued.`);
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => setActionCampaignId(null),
  });

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelCampaign(token, id),
    onMutate:   (id) => setActionCampaignId(id),
    onSuccess:  (res) => {
      qc.invalidateQueries({ queryKey: ['wa-campaigns'] });
      toast.success(`Campaign "${res.campaign.name}" cancelled.`);
      setCancelTarget(null);
    },
    onError: (err: Error) => { toast.error(err.message); setCancelTarget(null); },
    onSettled: () => setActionCampaignId(null),
  });

  // Summary counts derived from the unfiltered list so every tab badge is accurate
  const counts = useMemo(() => ({
    all:       allCampaigns.length,
    draft:     allCampaigns.filter(c => c.status === 'draft').length,
    running:   allCampaigns.filter(c => c.status === 'running').length,
    completed: allCampaigns.filter(c => c.status === 'completed').length,
    cancelled: allCampaigns.filter(c => c.status === 'cancelled').length,
  }), [allCampaigns]);

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Megaphone size={24} className="text-blue-600" />
            WhatsApp Campaigns
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Broadcast messages to multiple conversations at once.
          </p>
        </div>
        <Button
          onClick={() => setSheetOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 shrink-0"
        >
          <Plus size={16} />
          New Campaign
        </Button>
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit flex-wrap">
        {STATUS_TABS.map(tab => {
          const count = counts[tab.value];
          return (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeTab === tab.value
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                  activeTab === tab.value
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-200 text-gray-500'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Campaign grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
          <Loader2 size={20} className="animate-spin" />
          <span>Loading campaigns…</span>
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
          <AlertCircle size={32} className="text-red-300" />
          <p className="text-sm">Failed to load campaigns.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ['wa-campaigns'] })}
          >
            Retry
          </Button>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-gray-400">
          <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
            <Megaphone size={28} className="text-blue-300" />
          </div>
          <div className="text-center">
            <p className="font-medium text-gray-500">No campaigns yet</p>
            <p className="text-sm mt-1">
              {activeTab === 'all'
                ? 'Create your first campaign to send a message to multiple contacts.'
                : `No ${activeTab} campaigns.`}
            </p>
          </div>
          {activeTab === 'all' && (
            <Button
              onClick={() => setSheetOpen(true)}
              variant="outline"
              className="gap-1.5"
            >
              <Plus size={14} />
              Create your first campaign
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {campaigns.map(campaign => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              onStart={(id) => startMutation.mutate(id)}
              onCancel={(id) => setCancelTarget(campaigns.find(c => c.id === id) ?? null)}
              starting={startMutation.isPending && actionCampaignId === campaign.id}
              cancelling={cancelMutation.isPending && actionCampaignId === campaign.id}
            />
          ))}
        </div>
      )}

      {/* Create sheet */}
      <CreateCampaignSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        token={token}
      />

      {/* Cancel confirmation dialog */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(v) => { if (!v) setCancelTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel <strong>{cancelTarget?.name}</strong> and stop any pending
              messages from being sent. Messages already sent will not be recalled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelMutation.isPending}>Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancelTarget && cancelMutation.mutate(cancelTarget.id)}
              disabled={cancelMutation.isPending}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-500"
            >
              {cancelMutation.isPending
                ? <><Loader2 size={14} className="animate-spin mr-1" /> Cancelling…</>
                : 'Yes, cancel campaign'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
