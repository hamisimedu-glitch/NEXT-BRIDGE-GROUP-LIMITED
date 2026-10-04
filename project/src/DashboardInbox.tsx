import { FormEvent, RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Bell, Check, CircleAlert, MessageCircle, RotateCw, X } from 'lucide-react';
import type { AdminUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

type InboxMode = 'staff' | 'client';
type ClientInboxTab = 'notifications' | 'messages';
type DashboardMessage = { id: string; client_id: string; sender_id: string; sender_role: 'STAFF' | 'CLIENT'; body: string; read_at: string | null; created_at: string };
type InboxNotification = { id: string; title: string; body: string; kind: string; read_at: string | null; created_at: string };
type InboxClient = { id: string; full_name: string | null; email: string | null };

export default function DashboardInbox({ user, mode }: { user: AdminUser; mode: InboxMode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [clientTab, setClientTab] = useState<ClientInboxTab>('notifications');
  const [messages, setMessages] = useState<DashboardMessage[]>([]);
  const [notifications, setNotifications] = useState<InboxNotification[]>([]);
  const [clients, setClients] = useState<InboxClient[]>([]);
  const [selectedClientId, setSelectedClientId] = useState(mode === 'client' ? user.id : '');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const lastReadMessage = useRef('');
  const historyEnd = useRef<HTMLDivElement>(null);
  const threadId = mode === 'client' ? user.id : selectedClientId;

  const refresh = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    const messageQuery = supabase.from('dashboard_messages').select('*').order('created_at', { ascending: false }).limit(500);
    const scopedMessageQuery = mode === 'client' ? messageQuery.eq('client_id', user.id) : messageQuery;
    const notificationQuery = mode === 'client'
      ? supabase.from('client_notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30)
      : Promise.resolve({ data: [], error: null });
    const clientQuery = mode === 'staff'
      ? supabase.rpc('list_document_client_profiles')
      : Promise.resolve({ data: [], error: null });
    const [messageResult, notificationResult, clientResult] = await Promise.all([scopedMessageQuery, notificationQuery, clientQuery]);

    if (messageResult.error) setError(`Inbox could not be loaded: ${messageResult.error.message}`);
    else {
      const rows = (messageResult.data ?? []) as DashboardMessage[];
      setMessages([...rows].reverse());
      setError('');
      if (mode === 'staff') {
        const latestInbound = [...rows].reverse().find((message) => message.sender_role === 'CLIENT');
        const directory = (clientResult.data ?? []) as InboxClient[];
        setClients(directory);
        setSelectedClientId((current) => current || latestInbound?.client_id || directory[0]?.id || '');
      }
    }
    if (mode === 'client') {
      if (notificationResult.error) setError(`Notifications could not be loaded: ${notificationResult.error.message}`);
      setNotifications((notificationResult.data ?? []) as InboxNotification[]);
    }
    setLoading(false);
  }, [mode, user.id]);

  useEffect(() => {
    if (mode !== 'client') return;
    setSelectedClientId(user.id);
  }, [mode, user.id]);

  useEffect(() => {
    let channel = supabase.channel(`dashboard-inbox-${mode}-${user.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'dashboard_messages',
        ...(mode === 'client' ? { filter: `client_id=eq.${user.id}` } : {}),
      }, () => { void refresh(); });
    if (mode === 'client') {
      channel = channel.on('postgres_changes', {
        event: '*', schema: 'public', table: 'client_notifications', filter: `user_id=eq.${user.id}`,
      }, () => { void refresh(); });
    }
    channel.subscribe((status) => setRealtimeConnected(status === 'SUBSCRIBED'));
    void refresh();
    return () => {
      setRealtimeConnected(false);
      void supabase.removeChannel(channel);
    };
  }, [mode, refresh, user.id]);

  const incomingRole = mode === 'staff' ? 'CLIENT' : 'STAFF';
  const unreadMessageCount = messages.filter((message) => message.sender_role === incomingRole && !message.read_at).length;
  const unreadNotificationCount = notifications.filter((notification) => !notification.read_at).length;
  const unreadCount = unreadMessageCount + unreadNotificationCount;
  const threadMessages = useMemo(() => {
    if (!threadId) return [];
    return messages.filter((message) => message.client_id === threadId);
  }, [messages, threadId]);
  const selectedClient = clients.find((client) => client.id === threadId);

  useEffect(() => {
    if (mode === 'client' && clientTab !== 'messages') return;
    if (!isOpen || !threadId) return;
    const unread = threadMessages.find((message) => message.sender_role === incomingRole && !message.read_at);
    if (!unread || lastReadMessage.current === unread.id) return;
    lastReadMessage.current = unread.id;
    void supabase.rpc('mark_dashboard_messages_read', { p_client_id: threadId }).then(({ error: readError }) => {
      if (readError) setError(`Messages could not be marked as read: ${readError.message}`);
      else void refresh();
    });
  }, [clientTab, incomingRole, isOpen, mode, refresh, threadId, threadMessages]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isOpen]);

  useEffect(() => { historyEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [threadMessages]);

  const openInbox = () => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    setIsOpen(true);
    void refresh(true);
  };

  const markNotificationsRead = async (notificationIds: string[]) => {
    if (!notificationIds.length) return;
    const readAt = new Date().toISOString();
    const { error: readError } = await supabase.from('client_notifications').update({ read_at: readAt }).eq('user_id', user.id).in('id', notificationIds);
    if (readError) {
      setError(`Notifications could not be marked as read: ${readError.message}`);
      return;
    }
    setNotifications((current) => current.map((notification) => notificationIds.includes(notification.id) ? { ...notification, read_at: readAt } : notification));
  };

  const markAllNotificationsRead = () => markNotificationsRead(notifications.filter((notification) => !notification.read_at).map((notification) => notification.id));

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !threadId || sending) return;
    setSending(true);
    setError('');
    const { error: sendError } = await supabase.from('dashboard_messages').insert({
      client_id: threadId,
      sender_id: user.id,
      sender_role: mode === 'staff' ? 'STAFF' : 'CLIENT',
      body,
    });
    if (sendError) setError(`Message could not be sent: ${sendError.message}`);
    else {
      setDraft('');
      await refresh();
    }
    setSending(false);
  };

  const formatTime = (value: string) => new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

  if (mode === 'client') return <ClientInboxDrawer
    user={user}
    isOpen={isOpen}
    onToggle={openInbox}
    onClose={() => setIsOpen(false)}
    tab={clientTab}
    onTabChange={setClientTab}
    notifications={notifications}
    unreadNotifications={unreadNotificationCount}
    messages={threadMessages}
    unreadMessages={unreadMessageCount}
    loading={loading}
    error={error}
    realtimeConnected={realtimeConnected}
    onRefresh={() => void refresh(true)}
    onMarkRead={(id: string) => void markNotificationsRead([id])}
    onMarkAllRead={() => void markAllNotificationsRead()}
    draft={draft}
    onDraftChange={setDraft}
    sending={sending}
    onSend={sendMessage}
    historyEnd={historyEnd}
  />;

  return <div className="relative">
    <button type="button" aria-label={`Open messages and notifications${unreadCount ? `, ${unreadCount} unread` : ''}`} aria-expanded={isOpen} onClick={openInbox} className="relative inline-flex h-10 shrink-0 items-center justify-center gap-2 border border-[#0d4055] bg-[#0d4055] px-3 text-white shadow-sm transition hover:bg-[#123b4b]">
      <Bell size={20} strokeWidth={2.2} /><span className="hidden text-xs font-semibold sm:inline">Inbox</span>
      {unreadCount > 0 && <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-[#a55445] px-1 text-[10px] font-bold leading-none text-white">{unreadCount > 99 ? '99+' : unreadCount}</span>}
    </button>

    {isOpen && <section aria-label="Messages and notifications" className="absolute right-0 top-full z-[60] mt-2 flex h-[min(72vh,620px)] w-[min(92vw,440px)] flex-col border border-[#c9c5bd] bg-white text-[#17232b] shadow-2xl">
      <header className="flex items-center justify-between border-b border-[#e2ded5] px-4 py-3">
        <div><p className="eyebrow text-[#087f88]">{mode === 'staff' ? 'Client communications' : 'NBG communications'}</p><h2 className="mt-1 text-base font-semibold text-[#123b4b]">Messages & notifications</h2><p className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-500"><span className={`size-1.5 rounded-full ${realtimeConnected ? 'bg-[#2e8b57]' : 'bg-[#bd8a42]'}`} />{realtimeConnected ? 'Live updates' : 'Connecting...'}</p></div>
        <div className="flex items-center gap-1"><button type="button" onClick={() => void refresh()} title="Refresh inbox" aria-label="Refresh inbox" className="grid size-8 place-items-center text-slate-500 hover:bg-slate-100"><RotateCw size={15} /></button><button type="button" onClick={() => setIsOpen(false)} title="Close inbox" aria-label="Close inbox" className="grid size-8 place-items-center text-slate-500 hover:bg-slate-100"><X size={16} /></button></div>
      </header>

      {mode === 'staff' && <label className="grid gap-1 border-b border-[#eeeae2] px-4 py-3"><span className="eyebrow text-slate-500">Client conversation</span><select value={selectedClientId} onChange={(event) => setSelectedClientId(event.target.value)} className="admin-input w-full"><option value="">Select a client...</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.full_name || client.email || client.id.slice(0, 8)}</option>)}</select></label>}

      <div className="min-h-0 flex-1 overflow-y-auto bg-[#f7f6f2] p-4">
        {error && <p role="alert" className="mb-3 flex gap-2 border border-[#e4b8ad] bg-[#fff7f4] p-3 text-xs text-[#a55445]"><CircleAlert size={14} className="shrink-0" />{error}</p>}
        {loading && <p className="py-8 text-center text-xs text-slate-500">Loading inbox...</p>}
        {!loading && !threadId && <div className="py-10 text-center"><MessageCircle size={22} className="mx-auto text-slate-300" /><p className="mt-2 text-xs text-slate-500">Choose a client to start a conversation.</p></div>}
        {!loading && threadId && threadMessages.length === 0 && <div className="py-10 text-center"><MessageCircle size={22} className="mx-auto text-slate-300" /><p className="mt-2 text-xs text-slate-500">No messages yet{mode === 'staff' ? ` with ${selectedClient?.full_name || 'this client'}` : ' with the NBG team'}.</p></div>}
        {threadMessages.map((message) => {
          const mine = message.sender_id === user.id;
          return <article key={message.id} className={`mb-3 flex ${mine ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[88%] border px-3 py-2.5 ${mine ? 'border-[#087f88] bg-[#087f88] text-white' : 'border-[#e1ddd5] bg-white text-[#24383d]'}`}><p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide opacity-70">{mine ? 'You' : message.sender_role === 'STAFF' ? 'NBG team' : selectedClient?.full_name || 'Client'}{mine && message.read_at && <Check size={11} aria-label="Read" />}</p><p className="whitespace-pre-wrap break-words text-xs leading-5">{message.body}</p><p className="mt-2 text-right text-[9px] opacity-60">{formatTime(message.created_at)}</p></div></article>;
        })}
        <div ref={historyEnd} />
      </div>

      <form onSubmit={sendMessage} className="border-t border-[#e2ded5] bg-white p-3">
        <label className="sr-only" htmlFor={`message-${mode}`}>Write a message</label>
        <textarea id={`message-${mode}`} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={4000} rows={2} disabled={!threadId || sending} placeholder={mode === 'staff' ? 'Write to this client...' : 'Write to the NBG team...'} className="admin-input w-full resize-none text-xs disabled:bg-slate-50" />
        <div className="mt-2 flex items-center justify-between"><span className="text-[10px] text-slate-400">{draft.length}/4000</span><button type="submit" disabled={!threadId || !draft.trim() || sending} className="inline-flex items-center gap-2 bg-[#0d4055] px-3 py-2 text-xs font-semibold text-white hover:bg-[#123b4b] disabled:opacity-50">{sending ? 'Sending...' : 'Send message'} <ArrowUp size={14} /></button></div>
      </form>
    </section>}
  </div>;
}

function ClientInboxDrawer({ user, isOpen, onToggle, onClose, tab, onTabChange, notifications, unreadNotifications, messages, unreadMessages, loading, error, realtimeConnected, onRefresh, onMarkRead, onMarkAllRead, draft, onDraftChange, sending, onSend, historyEnd }: {
  user: AdminUser;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  tab: ClientInboxTab;
  onTabChange: (tab: ClientInboxTab) => void;
  notifications: InboxNotification[];
  unreadNotifications: number;
  messages: DashboardMessage[];
  unreadMessages: number;
  loading: boolean;
  error: string;
  realtimeConnected: boolean;
  onRefresh: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  draft: string;
  onDraftChange: (value: string) => void;
  sending: boolean;
  onSend: (event: FormEvent<HTMLFormElement>) => void;
  historyEnd: RefObject<HTMLDivElement>;
}) {
  const formatTime = (value: string) => new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  return <>
    <button type="button" aria-label={`Open NBG inbox${unreadNotifications + unreadMessages ? `, ${unreadNotifications + unreadMessages} unread` : ''}`} aria-expanded={isOpen} onClick={onToggle} className="relative inline-flex h-10 shrink-0 items-center justify-center gap-2 border border-[#0d4055] bg-[#0d4055] px-3 text-white shadow-sm transition hover:bg-[#123b4b]"><Bell size={19} /><span className="hidden text-xs font-semibold sm:inline">Inbox</span>{unreadNotifications + unreadMessages > 0 && <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-[#a55445] px-1 text-[10px] font-bold leading-none text-white">{unreadNotifications + unreadMessages > 99 ? '99+' : unreadNotifications + unreadMessages}</span>}</button>
    {isOpen && <>
      <button type="button" aria-label="Close inbox overlay" onClick={onClose} className="fixed inset-0 z-[70] bg-[#071116]/45" />
      <aside role="dialog" aria-modal="true" aria-label="NBG client inbox" className="fixed inset-y-0 right-0 z-[71] flex w-full max-w-[440px] flex-col border-l border-[#c9c5bd] bg-[#f7f6f2] text-[#17232b] shadow-2xl">
        <header className="flex items-start justify-between gap-4 bg-[#0d4055] px-5 py-5 text-white"><div><p className="text-[9px] font-semibold uppercase tracking-[.2em] text-[#8de7e2]">Private client inbox</p><h2 className="mt-1 font-serif text-2xl">Your NBG updates</h2><p className="mt-1 text-xs text-white/65">{user.email}</p><p className="mt-3 flex items-center gap-2 text-[10px] text-white/70"><span className={`size-1.5 rounded-full ${realtimeConnected ? 'bg-[#8de7e2]' : 'bg-[#d5a85f]'}`} />{realtimeConnected ? 'Live connection' : 'Reconnecting'}</p></div><div className="flex gap-1"><button type="button" onClick={onRefresh} title="Refresh inbox" aria-label="Refresh inbox" className="grid size-9 place-items-center text-white/75 hover:bg-white/10 hover:text-white"><RotateCw size={16} /></button><button type="button" onClick={onClose} title="Close inbox" aria-label="Close inbox" className="grid size-9 place-items-center text-white/75 hover:bg-white/10 hover:text-white"><X size={18} /></button></div></header>
        <nav aria-label="Inbox sections" className="grid grid-cols-2 border-b border-[#d8d4cb] bg-white"><button type="button" onClick={() => onTabChange('notifications')} aria-current={tab === 'notifications' ? 'page' : undefined} className={`border-b-2 px-4 py-3 text-xs font-semibold ${tab === 'notifications' ? 'border-[#087f88] text-[#087f88]' : 'border-transparent text-slate-500'}`}>Notifications{unreadNotifications > 0 && <span className="ml-2 text-[10px]">{unreadNotifications}</span>}</button><button type="button" onClick={() => onTabChange('messages')} aria-current={tab === 'messages' ? 'page' : undefined} className={`border-b-2 px-4 py-3 text-xs font-semibold ${tab === 'messages' ? 'border-[#087f88] text-[#087f88]' : 'border-transparent text-slate-500'}`}>Messages{unreadMessages > 0 && <span className="ml-2 text-[10px]">{unreadMessages}</span>}</button></nav>
        {tab === 'notifications' && <div className="flex items-center justify-between border-b border-[#e4e0d8] px-5 py-3"><p className="eyebrow text-slate-500">Recent activity · {notifications.length}</p>{unreadNotifications > 0 && <button type="button" onClick={onMarkAllRead} className="text-[10px] font-semibold text-[#087f88] underline">Mark all read</button>}</div>}
        {error && <p role="alert" className="mx-4 mt-4 flex gap-2 border border-[#e4b8ad] bg-[#fff7f4] p-3 text-xs text-[#a55445]"><CircleAlert size={14} className="shrink-0" />{error}</p>}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {loading && <p role="status" className="py-8 text-center text-xs text-slate-500">Loading your inbox...</p>}
          {!loading && tab === 'notifications' && notifications.length === 0 && <div className="border border-dashed border-[#c9c5bd] bg-white px-5 py-10 text-center"><Bell size={22} className="mx-auto text-[#087f88]" /><p className="mt-3 text-sm font-semibold text-[#123b4b]">You’re all caught up</p><p className="mt-1 text-xs leading-5 text-slate-500">New payment, application, and project updates will appear here.</p></div>}
          {tab === 'notifications' && notifications.map((notification) => {
            const trackingCode = notification.kind === 'PROJECT_DETAILS_SHARED' ? notification.body.match(/Tracking code:\s*([A-Z0-9-]+)/i)?.[1] : null;
            const urgent = notification.kind === 'KYC_UPDATE_REQUEST';
            return <article key={notification.id} className={`mb-3 border p-4 ${urgent ? 'border-[#d58a7d] bg-[#fff2ee]' : notification.read_at ? 'border-[#e2ded5] bg-white' : 'border-[#82bfba] bg-[#eefbf9]'}`}><div className="flex items-start gap-3"><Bell size={15} className={`mt-0.5 shrink-0 ${urgent ? 'text-[#a55445]' : 'text-[#087f88]'}`} /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold text-[#123b4b]">{notification.title}</p>{!notification.read_at && <span className="mt-1 size-2 shrink-0 bg-[#087f88]" aria-label="Unread" />}</div><p className="mt-2 whitespace-pre-line break-words text-xs leading-5 text-slate-600">{notification.body}</p>{trackingCode && <a href={`/verify/${encodeURIComponent(trackingCode)}`} onClick={onClose} className="mt-3 inline-block text-xs font-semibold text-[#087f88] underline">Preview shared project details</a>}<div className="mt-3 flex items-center justify-between gap-3"><time className="text-[10px] text-slate-400">{formatTime(notification.created_at)}</time>{!notification.read_at && <button type="button" onClick={() => onMarkRead(notification.id)} className="text-[10px] font-semibold text-[#087f88] underline">Mark read</button>}</div></div></div></article>;
          })}
          {!loading && tab === 'messages' && messages.length === 0 && <div className="border border-dashed border-[#c9c5bd] bg-white px-5 py-10 text-center"><MessageCircle size={22} className="mx-auto text-[#087f88]" /><p className="mt-3 text-sm font-semibold text-[#123b4b]">No messages yet</p><p className="mt-1 text-xs leading-5 text-slate-500">Send the NBG team a message below and replies will appear here.</p></div>}
          {tab === 'messages' && messages.map((message) => {
            const mine = message.sender_id === user.id;
            return <article key={message.id} className={`mb-3 flex ${mine ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[88%] border px-3 py-2.5 ${mine ? 'border-[#087f88] bg-[#087f88] text-white' : 'border-[#e1ddd5] bg-white text-[#24383d]'}`}><p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide opacity-70">{mine ? 'You' : 'NBG team'}{mine && message.read_at && <Check size={11} aria-label="Read" />}</p><p className="whitespace-pre-wrap break-words text-xs leading-5">{message.body}</p><p className="mt-2 text-right text-[9px] opacity-60">{formatTime(message.created_at)}</p></div></article>;
          })}
          {tab === 'messages' && <div ref={historyEnd} />}
        </div>
        {tab === 'messages' && <form onSubmit={onSend} className="border-t border-[#d8d4cb] bg-white p-4"><label className="sr-only" htmlFor="client-inbox-message">Write a message to NBG</label><textarea id="client-inbox-message" value={draft} onChange={(event) => onDraftChange(event.target.value)} maxLength={4000} rows={3} disabled={sending} placeholder="Write to the NBG team..." className="admin-input w-full resize-none text-xs disabled:bg-slate-50" /><div className="mt-2 flex items-center justify-between"><span className="text-[10px] text-slate-400">{draft.length}/4000</span><button type="submit" disabled={!draft.trim() || sending} className="inline-flex items-center gap-2 bg-[#0d4055] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#123b4b] disabled:opacity-50">{sending ? 'Sending...' : 'Send message'} <ArrowUp size={14} /></button></div></form>}
      </aside>
    </>}
  </>;
}
