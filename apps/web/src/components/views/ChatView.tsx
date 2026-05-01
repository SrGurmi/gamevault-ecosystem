import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Icon } from '../ui/Icon';
import { Spinner } from '../ui/Spinner';
import { timeAgo } from '../../lib/helpers';
import type { Profile } from '../../types';

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  profiles?: Profile;
}

interface ConversationParticipant {
  id: string;
  conversation_id: string;
  user_id: string;
  joined_at: string;
  last_read_at: string;
}

interface Conversation {
  id: string;
  name: string | null;
  type: 'direct' | 'group';
  created_at: string;
  updated_at: string;
  created_by: string | null;
  conversation_participants?: ConversationParticipant[];
}

interface ConversationWithDetails extends Conversation {
  participants?: Array<Profile>;
  lastMessage?: Message;
  unreadCount?: number;
}

export function ChatView() {
  const [conversations, setConversations] = useState<ConversationWithDetails[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<ConversationWithDetails | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState('');
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  let messageChannel: ReturnType<typeof supabase.channel> | null = null;
  let conversationChannel: ReturnType<typeof supabase.channel> | null = null;

  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        if (profile) setCurrentUser(profile as Profile);
      }
    };
    getCurrentUser();
  }, []);

  const fetchConversations = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: conversations } = await supabase
        .from('conversations')
        .select(
          `
          *,
          conversation_participants (id, conversation_id, user_id, joined_at, last_read_at),
          messages (
            id, sender_id, content, created_at, deleted_at,
            profiles (id, full_name, avatar_url, role)
          )
        `
        )
        .order('updated_at', { ascending: false });

      if (conversations) {
        const enriched: ConversationWithDetails[] = [];

        for (const conv of conversations as any[]) {
          const messages = (conv.messages || []).filter((m: any) => !m.deleted_at);
          const lastMessage = messages.length > 0 ? messages[0] : null;

          const participantIds = (conv.conversation_participants || []).map(
            (p: any) => p.user_id
          );

          const { data: participants } = await supabase
            .from('profiles')
            .select('id, full_name, avatar_url, role')
            .in('id', participantIds);

          let name = conv.name;
          if (!name && participants && participants.length > 0) {
            // for direct messages, derive display name from the other participant
            const otherParticipants = participants.filter((p: any) => p.id !== user.id);
            if (otherParticipants.length > 0) {
              name = otherParticipants.map((p: any) => p.full_name).join(', ');
            }
          }

          enriched.push({
            ...conv,
            name: name || 'Grupo',
            participants: participants || [],
            lastMessage,
            unreadCount: 0,
          });
        }

        setConversations(enriched);
      }
      setLoading(false);
    } catch (err) {
      console.error('Error fetching conversations:', err);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();

    const setupRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        conversationChannel = supabase
          .channel(`conversations-${user.id}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'messages',
            },
            () => {
              fetchConversations();
            }
          )
          .subscribe();
      }
    };

    setupRealtime();

    return () => {
      if (conversationChannel) supabase.removeChannel(conversationChannel);
    };
  }, [fetchConversations]);

  const fetchMessages = useCallback(async (conversationId: string) => {
    try {
      setLoadingMessages(true);
      const { data: messages } = await supabase
        .from('messages')
        .select('*, profiles (id, full_name, avatar_url, role)')
        .eq('conversation_id', conversationId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });

      if (messages) {
        setMessages(messages as Message[]);
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
      setLoadingMessages(false);
    } catch (err) {
      console.error('Error fetching messages:', err);
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedConversation) return;

    fetchMessages(selectedConversation.id);

    messageChannel = supabase
      .channel(`messages-${selectedConversation.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${selectedConversation.id}`,
        },
        () => {
          fetchMessages(selectedConversation.id);
        }
      )
      .subscribe();

    return () => {
      if (messageChannel) supabase.removeChannel(messageChannel);
    };
  }, [selectedConversation, fetchMessages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !selectedConversation || !currentUser) return;

    try {
      setSendingMessage(true);
      const { error } = await supabase.from('messages').insert({
        conversation_id: selectedConversation.id,
        sender_id: currentUser.id,
        content: messageText.trim(),
      });

      if (error) throw error;

      setMessageText('');
    } catch (err) {
      console.error('Error sending message:', err);
    } finally {
      setSendingMessage(false);
    }
  };

  const fetchAllUsers = useCallback(async () => {
    try {
      setLoadingUsers(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: users } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, role')
        .neq('id', user.id)
        .order('full_name');

      if (users) {
        setAllUsers(users as Profile[]);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const handleCreateConversation = async (userId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: existing } = await supabase
        .from('conversations')
        .select('id, conversation_participants(user_id)')
        .eq('type', 'direct');

      let conversationId: string | null = null;

      if (existing) {
        for (const conv of existing) {
          const participantIds = (conv.conversation_participants as any[]).map(
            (p: any) => p.user_id
          );
          if (
            participantIds.includes(user.id) &&
            participantIds.includes(userId)
          ) {
            conversationId = conv.id;
            break;
          }
        }
      }

      if (!conversationId) {
        const { data: newConv, error: createError } = await supabase
          .from('conversations')
          .insert({
            type: 'direct',
            created_by: user.id,
          })
          .select()
          .single();

        if (createError || !newConv) throw createError;
        conversationId = newConv.id;

        const { error: participantError } = await supabase
          .from('conversation_participants')
          .insert([
            { conversation_id: conversationId, user_id: user.id },
            { conversation_id: conversationId, user_id: userId },
          ]);

        if (participantError) throw participantError;
      }

      await fetchConversations();
      const selected = conversations.find((c) => c.id === conversationId);
      if (selected) {
        setSelectedConversation(selected);
      }
      setShowNewConversation(false);
    } catch (err) {
      console.error('Error creating conversation:', err);
    }
  };

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <Spinner label="Cargando conversaciones…" />
      </div>
    );
  }

  const selectedParticipant =
    selectedConversation &&
    selectedConversation.participants &&
    selectedConversation.participants.find((p) => p.id !== currentUser?.id);

  return (
    <div className="flex h-full gap-6">
      <div className="w-80 shrink-0 flex flex-col border border-white/10 rounded-2xl bg-white/2 overflow-hidden">
        <div className="p-6 pb-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-lg font-black text-white">Conversaciones</h2>
          <button
            onClick={() => {
              if (!showNewConversation) {
                fetchAllUsers();
              }
              setShowNewConversation(!showNewConversation);
            }}
            className="w-10 h-10 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 flex items-center justify-center transition-all border border-emerald-500/20 font-bold text-lg"
            title="Nueva conversación"
          >
            +
          </button>
        </div>

        {showNewConversation && (
          <div className="flex-1 overflow-y-auto border-b border-white/10">
            <p className="px-4 pt-3 pb-2 text-xs font-black text-slate-500 uppercase tracking-wider">
              Selecciona un usuario
            </p>
            {loadingUsers ? (
              <div className="p-8 flex justify-center">
                <div className="w-5 h-5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-0.5 px-2 py-2">
                {allUsers.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => handleCreateConversation(user.id)}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-all text-left group"
                  >
                    <img
                      src={user.avatar_url || 'https://placehold.co/40/0c1628/10b981?text=?'}
                      className="w-9 h-9 rounded-full shrink-0 object-cover"
                      alt=""
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                        {user.full_name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {user.role === 'admin' ? 'Administrador' : 'Usuario'}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {!showNewConversation && (
          <div className="flex-1 overflow-y-auto divide-y divide-white/5">
            {conversations.length === 0 ? (
              <div className="flex items-center justify-center h-full text-slate-500">
                <div className="text-center py-12">
                  <p className="text-3xl mb-2">💬</p>
                  <p className="text-sm">Sin conversaciones</p>
                  <p className="text-xs text-slate-600 mt-1">Inicia una nueva</p>
                </div>
              </div>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConversation(conv)}
                  className={`w-full text-left p-3 hover:bg-white/5 transition-all border-l-2 ${
                    selectedConversation?.id === conv.id
                      ? 'border-emerald-500 bg-emerald-500/5'
                      : 'border-transparent'
                  }`}
                >
                  <div className="flex gap-3">
                    {selectedParticipant && selectedConversation?.id === conv.id ? (
                      <img
                        src={
                          selectedParticipant.avatar_url ||
                          'https://placehold.co/40/0c1628/10b981?text=?'
                        }
                        className="w-10 h-10 rounded-full shrink-0 object-cover"
                        alt=""
                      />
                    ) : conv.participants && conv.participants.length > 0 ? (
                      <img
                        src={
                          conv.participants[0].avatar_url ||
                          'https://placehold.co/40/0c1628/10b981?text=?'
                        }
                        className="w-10 h-10 rounded-full shrink-0 object-cover"
                        alt=""
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center shrink-0 text-lg">
                        👤
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                        {conv.name || 'Grupo'}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {conv.lastMessage?.content || 'Sin mensajes'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 px-0.5">
                    <span className="text-[10px] text-slate-600">
                      {timeAgo(conv.lastMessage?.created_at || conv.updated_at)}
                    </span>
                    {conv.unreadCount ? (
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full font-bold">
                        {conv.unreadCount}
                      </span>
                    ) : null}
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {selectedConversation ? (
        <div className="flex-1 flex flex-col border border-white/10 rounded-2xl bg-white/2 overflow-hidden">
          <div className="p-6 pb-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              {selectedParticipant && (
                <>
                  <img
                    src={
                      selectedParticipant.avatar_url ||
                      'https://placehold.co/40/0c1628/10b981?text=?'
                    }
                    className="w-10 h-10 rounded-full object-cover"
                    alt=""
                  />
                  <div>
                    <h3 className="font-semibold text-white">
                      {selectedParticipant.full_name}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {selectedParticipant.role === 'admin' ? 'Administrador' : 'Usuario'}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {loadingMessages ? (
              <div className="flex items-center justify-center h-full">
                <div className="w-5 h-5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-slate-500">
                <div className="text-center">
                  <p className="text-2xl mb-2">👋</p>
                  <p className="text-sm">Inicia la conversación</p>
                </div>
              </div>
            ) : (
              messages.map((msg) => {
                const isOwn = msg.sender_id === currentUser?.id;
                return (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${isOwn ? 'justify-end' : 'justify-start'}`}
                  >
                    {!isOwn && (
                      <img
                        src={
                          msg.profiles?.avatar_url ||
                          'https://placehold.co/32/0c1628/10b981?text=?'
                        }
                        className="w-8 h-8 rounded-full object-cover shrink-0"
                        alt=""
                      />
                    )}
                    <div
                      className={`max-w-xs rounded-2xl px-4 py-2 ${
                        isOwn
                          ? 'bg-emerald-500 text-white'
                          : 'bg-white/10 border border-white/20 text-white'
                      }`}
                    >
                      {!isOwn && (
                        <p className="text-xs text-slate-400 font-semibold mb-1">
                          {msg.profiles?.full_name}
                        </p>
                      )}
                      <p className="text-sm break-words">{msg.content}</p>
                      <p
                        className={`text-xs mt-1 ${
                          isOwn
                            ? 'text-emerald-50/60'
                            : 'text-slate-500'
                        }`}
                      >
                        {timeAgo(msg.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          <form
            onSubmit={handleSendMessage}
            className="p-4 border-t border-white/10 flex gap-2"
          >
            <input
              type="text"
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Escribe un mensaje…"
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/40 focus:bg-white/8 transition-all"
              disabled={sendingMessage}
            />
            <button
              type="submit"
              disabled={!messageText.trim() || sendingMessage}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold rounded-xl transition-all flex items-center justify-center"
            >
              {sendingMessage ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Icon name="send" className="w-4 h-4" />
              )}
            </button>
          </form>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center border border-white/10 rounded-2xl bg-white/2">
          <div className="text-center text-slate-500">
            <p className="text-3xl mb-2">💬</p>
            <p className="text-sm">Selecciona una conversación para empezar</p>
          </div>
        </div>
      )}
    </div>
  );
}
