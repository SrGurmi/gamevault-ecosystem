import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  RefreshControl,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import {
  GV_DARK,
  GV_CARD,
  GV_EMERALD,
  GV_BORDER,
  GV_SURFACE,
} from "../../constants/theme";

const { width: SCREEN_W } = Dimensions.get("window");

// ── Types ─────────────────────────────────────────────────────────────────────
interface Profile {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role: "admin" | "student";
}

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

interface ConversationWithDetails {
  id: string;
  name: string | null;
  type: "direct" | "group";
  created_at: string;
  updated_at: string;
  created_by: string | null;
  conversation_participants?: { user_id: string; last_read_at: string }[];
  profiles: Profile[];
  lastMessage?: Message | null;
  unreadCount: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const timeAgoShort = (date: string) => {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "Ahora";
  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return new Date(date).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
};

const FALLBACK_AVATAR = "https://placehold.co/56/0c1628/10b981?text=?";

/** Returns the display name and avatar for a conversation */
const convDisplayInfo = (
  conv: ConversationWithDetails,
  currentUserId: string
): { name: string; avatar: string | null; subtitle: string } => {
  if (conv.type === "direct") {
    const other = conv.profiles.find((p) => p.id !== currentUserId) ?? conv.profiles[0];
    if (other) {
      return {
        name: other.full_name || "Usuario",
        avatar: other.avatar_url,
        subtitle: other.role === "admin" ? "Administrador" : "Usuario",
      };
    }
  }
  // Group or fallback
  const names = conv.profiles
    .filter((p) => p.id !== currentUserId)
    .map((p) => p.full_name || "?")
    .join(", ");
  return {
    name: conv.name || (names || "Grupo"),
    avatar: null,
    subtitle: `${conv.profiles.length} participantes`,
  };
};

// ── Initials avatar ───────────────────────────────────────────────────────────
function InitialsAvatar({ name, size = 52 }: { name: string; size?: number }) {
  const initial = (name || "?")[0].toUpperCase();
  return (
    <View
      style={[
        styles.initialsAvatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.initialsText, { fontSize: size * 0.38 }]}>{initial}</Text>
    </View>
  );
}

// ── Avatar with fallback ──────────────────────────────────────────────────────
function Avatar({
  uri,
  name,
  size = 52,
}: {
  uri?: string | null;
  name: string;
  size?: number;
}) {
  const [err, setErr] = useState(false);
  if (!uri || err) return <InitialsAvatar name={name} size={size} />;
  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      onError={() => setErr(true)}
    />
  );
}

// ══════════════════════════════════════════════════════════════════════════════
export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const [conversations, setConversations] = useState<ConversationWithDetails[]>([]);
  const [selectedConv, setSelectedConv] = useState<ConversationWithDetails | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState("");
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [otherUsers, setOtherUsers] = useState<Profile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const flatRef = useRef<FlatList>(null);
  const convPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const msgPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Current user ────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();
        if (data) setCurrentUser(data as Profile);
      }
    })();
  }, []);

  // ── Fetch conversations ──────────────────────────────────────────────────────
  const fetchConversations = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: convData } = await supabase
        .from("conversations")
        .select(`
          *,
          conversation_participants (user_id, last_read_at),
          messages (id, sender_id, content, created_at, deleted_at)
        `)
        .order("updated_at", { ascending: false });

      if (!convData) return;

      // Only conversations I participate in
      const mine = convData.filter(
        (c: any) =>
          c.created_by === user.id ||
          (c.conversation_participants || []).some((p: any) => p.user_id === user.id)
      );

      // Build enriched list
      const enriched: ConversationWithDetails[] = await Promise.all(
        mine.map(async (conv: any) => {
          // Sort messages by date, get last
          const validMsgs = (conv.messages || [])
            .filter((m: any) => !m.deleted_at)
            .sort(
              (a: any, b: any) =>
                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
          const lastMessage = validMsgs.length > 0 ? validMsgs[validMsgs.length - 1] : null;

          // Fetch ALL participant profiles
          const participantIds = (conv.conversation_participants || []).map(
            (p: any) => p.user_id
          );
          let profiles: Profile[] = [];
          if (participantIds.length > 0) {
            const { data: pData } = await supabase
              .from("profiles")
              .select("id, full_name, avatar_url, role")
              .in("id", participantIds);
            profiles = (pData || []) as Profile[];
          }

          // Auto-name for DMs: other person's name
          let name = conv.name;
          if (!name && conv.type === "direct") {
            const other = profiles.find((p) => p.id !== user.id);
            if (other) name = other.full_name;
          }

          return {
            ...conv,
            name,
            profiles,
            lastMessage,
            unreadCount: 0,
          };
        })
      );

      setConversations(enriched);
    } catch (e) {
      console.error("fetchConversations:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // ── Realtime + polling ───────────────────────────────────────────────────────
  useEffect(() => {
    fetchConversations();

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const ch = supabase
        .channel(`conv-list-${user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () =>
          fetchConversations(true)
        )
        .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () =>
          fetchConversations(true)
        )
        .subscribe();
      return () => { supabase.removeChannel(ch); };
    })();

    convPollRef.current = setInterval(() => fetchConversations(true), 4000);
    return () => { if (convPollRef.current) clearInterval(convPollRef.current); };
  }, [fetchConversations]);

  // ── Fetch messages ───────────────────────────────────────────────────────────
  const fetchMessages = useCallback(async (convId: string, silent = false) => {
    try {
      if (!silent) setLoadingMessages(true);
      const { data } = await supabase
        .from("messages")
        .select("*, profiles (id, full_name, avatar_url, role)")
        .eq("conversation_id", convId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (data) {
        setMessages(data as Message[]);
        setTimeout(() => flatRef.current?.scrollToEnd({ animated: !silent }), 60);
      }
    } catch (e) {
      console.error("fetchMessages:", e);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedConv) {
      if (msgPollRef.current) clearInterval(msgPollRef.current);
      return;
    }
    fetchMessages(selectedConv.id);
    const ch = supabase
      .channel(`msgs-${selectedConv.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${selectedConv.id}`,
      }, () => fetchMessages(selectedConv.id, true))
      .subscribe();
    msgPollRef.current = setInterval(() => fetchMessages(selectedConv.id, true), 2000);
    return () => {
      supabase.removeChannel(ch);
      if (msgPollRef.current) clearInterval(msgPollRef.current);
    };
  }, [selectedConv, fetchMessages]);

  // ── Send message ─────────────────────────────────────────────────────────────
  const handleSend = async () => {
    const text = messageText.trim();
    if (!text || !selectedConv || !currentUser) return;
    setMessageText("");
    const optimistic: Message = {
      id: `tmp-${Date.now()}`,
      conversation_id: selectedConv.id,
      sender_id: currentUser.id,
      content: text,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      profiles: currentUser as any,
    };
    setMessages((p) => [...p, optimistic]);
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 60);
    try {
      setSending(true);
      const { error } = await supabase.from("messages").insert({
        conversation_id: selectedConv.id,
        sender_id: currentUser.id,
        content: text,
      });
      if (error) throw error;
    } catch {
      Alert.alert("Error", "No se pudo enviar el mensaje");
      setMessages((p) => p.filter((m) => m.id !== optimistic.id));
      setMessageText(text);
    } finally {
      setSending(false);
    }
  };

  // ── Load users for new chat ───────────────────────────────────────────────────
  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, role")
        .neq("id", user.id);
      if (data) setOtherUsers(data as Profile[]);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  // ── Start conversation ────────────────────────────────────────────────────────
  const startConversation = async (otherId: string) => {
    setShowNewChat(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: conv, error } = await supabase
        .from("conversations")
        .insert({ type: "direct", created_by: user.id })
        .select()
        .single();
      if (error || !conv) throw error;
      await supabase.from("conversation_participants").insert([
        { conversation_id: conv.id, user_id: user.id },
        { conversation_id: conv.id, user_id: otherId },
      ]);
      await fetchConversations(true);
      const other = otherUsers.find((u) => u.id === otherId);
      setSelectedConv({
        ...conv,
        name: other?.full_name || "Conversación",
        profiles: other ? [other, currentUser!].filter(Boolean) : [],
        unreadCount: 0,
        lastMessage: null,
      } as ConversationWithDetails);
    } catch {
      Alert.alert("Error", "No se pudo crear la conversación");
    }
  };

  // ── Loading state ─────────────────────────────────────────────────────────────
  if (loading && conversations.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={GV_EMERALD} />
      </View>
    );
  }

  // ── CONVERSATION LIST (WhatsApp style) ────────────────────────────────────────
  if (!selectedConv) {
    return (
      <View style={{ flex: 1, backgroundColor: GV_DARK }}>
        <StatusBar barStyle="light-content" backgroundColor={GV_DARK} />

        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.headerTitle}>Mensajes</Text>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => { setShowNewChat(!showNewChat); if (!showNewChat) loadUsers(); }}
            activeOpacity={0.75}
          >
            <Text style={styles.addBtnText}>+</Text>
          </TouchableOpacity>
        </View>

        {/* New chat sheet */}
        {showNewChat && (
          <View style={styles.newChatSheet}>
            <Text style={styles.sheetLabel}>NUEVA CONVERSACIÓN</Text>
            {loadingUsers ? (
              <ActivityIndicator color={GV_EMERALD} style={{ marginVertical: 16 }} />
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {otherUsers.map((u) => (
                  <TouchableOpacity
                    key={u.id}
                    style={styles.userRow}
                    onPress={() => startConversation(u.id)}
                    activeOpacity={0.7}
                  >
                    <Avatar uri={u.avatar_url} name={u.full_name || "?"} size={44} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.userRowName}>{u.full_name || "Usuario"}</Text>
                      <Text style={styles.userRowRole}>
                        {u.role === "admin" ? "Administrador" : "Usuario"}
                      </Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        )}

        {/* Conversation list */}
        {!showNewChat && (
          <FlatList
            data={conversations}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => { setRefreshing(true); fetchConversations(); }}
                tintColor={GV_EMERALD}
              />
            }
            renderItem={({ item }) => {
              const userId = currentUser?.id ?? "";
              const { name, avatar, subtitle } = convDisplayInfo(item, userId);
              const lastMsg = item.lastMessage;

              return (
                <TouchableOpacity
                  style={styles.convRow}
                  onPress={() => setSelectedConv(item)}
                  activeOpacity={0.7}
                >
                  {/* Avatar */}
                  <View style={styles.convAvatarWrap}>
                    <Avatar uri={avatar} name={name} size={52} />
                    {item.unreadCount > 0 && (
                      <View style={styles.onlineDot} />
                    )}
                  </View>

                  {/* Text */}
                  <View style={styles.convTextWrap}>
                    <View style={styles.convTopRow}>
                      <Text style={styles.convName} numberOfLines={1}>{name}</Text>
                      <Text style={styles.convTime}>
                        {lastMsg
                          ? timeAgoShort(lastMsg.created_at)
                          : timeAgoShort(item.updated_at)}
                      </Text>
                    </View>
                    <View style={styles.convBottomRow}>
                      <Text style={styles.convPreview} numberOfLines={1}>
                        {lastMsg?.content || "Sin mensajes aún"}
                      </Text>
                      {item.unreadCount > 0 && (
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>{item.unreadCount}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
            ItemSeparatorComponent={() => (
              <View style={styles.separator} />
            )}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyIcon}>💬</Text>
                <Text style={styles.emptyTitle}>Sin conversaciones</Text>
                <Text style={styles.emptyBody}>
                  Pulsa + para iniciar un chat
                </Text>
              </View>
            }
            contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          />
        )}
      </View>
    );
  }

  // ── CHAT VIEW ─────────────────────────────────────────────────────────────────
  const userId = currentUser?.id ?? "";
  const { name: convName, avatar: convAvatar } = convDisplayInfo(selectedConv, userId);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#0a0f1a" }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <StatusBar barStyle="light-content" backgroundColor={GV_SURFACE} />

      {/* Chat header */}
      <View style={[styles.chatHeader, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity
          onPress={() => setSelectedConv(null)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.backBtn}
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Avatar uri={convAvatar} name={convName} size={38} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.chatHeaderName} numberOfLines={1}>{convName}</Text>
          <Text style={styles.chatHeaderSub}>
            {selectedConv.type === "direct" ? "Chat directo" : "Grupo"}
          </Text>
        </View>
      </View>

      {/* Messages */}
      {loadingMessages && messages.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={GV_EMERALD} size="large" />
        </View>
      ) : (
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.msgList}
          onContentSizeChange={() =>
            flatRef.current?.scrollToEnd({ animated: true })
          }
          ListEmptyComponent={
            <View style={styles.emptyMsgWrap}>
              <Text style={styles.emptyMsgText}>Inicia la conversación 👋</Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const isOwn = item.sender_id === userId;
            const isTemp = item.id.startsWith("tmp-");
            const prevMsg = index > 0 ? messages[index - 1] : null;
            const showAvatar =
              !isOwn &&
              (!prevMsg || prevMsg.sender_id !== item.sender_id);
            const showName =
              !isOwn && selectedConv.type === "group" && showAvatar;

            return (
              <View
                style={[
                  styles.msgRow,
                  isOwn ? styles.msgRowOwn : styles.msgRowOther,
                ]}
              >
                {/* Other user avatar */}
                {!isOwn && (
                  <View style={{ width: 32, alignSelf: "flex-end", marginRight: 6 }}>
                    {showAvatar ? (
                      <Avatar
                        uri={item.profiles?.avatar_url}
                        name={item.profiles?.full_name || "?"}
                        size={30}
                      />
                    ) : null}
                  </View>
                )}

                <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther, isTemp && { opacity: 0.55 }]}>
                  {showName && (
                    <Text style={styles.bubbleSender}>
                      {item.profiles?.full_name || "Usuario"}
                    </Text>
                  )}
                  <Text style={[styles.bubbleText, isOwn && styles.bubbleTextOwn]}>
                    {item.content}
                  </Text>
                  <Text style={[styles.bubbleTime, isOwn && styles.bubbleTimeOwn]}>
                    {isTemp ? "Enviando…" : timeAgoShort(item.created_at)}
                    {isOwn && !isTemp && "  ✓"}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Input bar */}
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={styles.input}
          placeholder="Escribe un mensaje…"
          placeholderTextColor="rgba(255,255,255,0.3)"
          value={messageText}
          onChangeText={setMessageText}
          editable={!sending}
          multiline
          maxLength={2000}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!messageText.trim() || sending) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!messageText.trim() || sending}
          activeOpacity={0.75}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.sendBtnIcon}>➤</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const EMERALD = "#10b981";
const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: GV_DARK },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: GV_SURFACE,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GV_BORDER,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { fontSize: 24, fontWeight: "800", color: "#fff", letterSpacing: -0.5 },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: EMERALD,
    justifyContent: "center",
    alignItems: "center",
  },
  addBtnText: { color: "#fff", fontSize: 22, fontWeight: "300", lineHeight: 28 },

  // ── New chat sheet ───────────────────────────────────────────────────────────
  newChatSheet: {
    backgroundColor: GV_CARD,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GV_BORDER,
    maxHeight: 300,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  sheetLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.35)",
    letterSpacing: 1,
    marginTop: 12,
    marginBottom: 8,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GV_BORDER,
  },
  userRowName: { fontSize: 14, fontWeight: "600", color: "#fff" },
  userRowRole: { fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 },
  chevron: { fontSize: 20, color: "rgba(255,255,255,0.3)" },

  // ── Conversation row (WhatsApp style) ────────────────────────────────────────
  convRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: GV_DARK,
  },
  convAvatarWrap: { position: "relative", marginRight: 14 },
  onlineDot: {
    position: "absolute",
    bottom: 1,
    right: 1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: EMERALD,
    borderWidth: 2,
    borderColor: GV_DARK,
  },
  convTextWrap: { flex: 1, minWidth: 0 },
  convTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
  convName: { fontSize: 15, fontWeight: "700", color: "#fff", flex: 1, marginRight: 8 },
  convTime: { fontSize: 11, color: "rgba(255,255,255,0.35)", flexShrink: 0 },
  convBottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  convPreview: { fontSize: 13, color: "rgba(255,255,255,0.45)", flex: 1, marginRight: 8 },
  badge: {
    backgroundColor: EMERALD,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    justifyContent: "center",
    alignItems: "center",
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: GV_BORDER, marginLeft: 82 },

  // ── Initials avatar ──────────────────────────────────────────────────────────
  initialsAvatar: { backgroundColor: "rgba(16,185,129,0.18)", justifyContent: "center", alignItems: "center" },
  initialsText: { color: EMERALD, fontWeight: "700" },

  // ── Empty ────────────────────────────────────────────────────────────────────
  emptyWrap: { paddingTop: 80, alignItems: "center", paddingHorizontal: 32 },
  emptyIcon: { fontSize: 52, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: "#fff", marginBottom: 6 },
  emptyBody: { fontSize: 13, color: "rgba(255,255,255,0.4)", textAlign: "center" },

  // ── Chat header ──────────────────────────────────────────────────────────────
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingBottom: 10,
    backgroundColor: GV_SURFACE,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GV_BORDER,
  },
  backBtn: { marginRight: 6 },
  backIcon: { fontSize: 22, color: "#fff", paddingHorizontal: 4 },
  chatHeaderName: { fontSize: 15, fontWeight: "700", color: "#fff" },
  chatHeaderSub: { fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 1 },

  // ── Messages ─────────────────────────────────────────────────────────────────
  msgList: { paddingHorizontal: 12, paddingVertical: 14, gap: 4 },
  msgRow: { flexDirection: "row", marginBottom: 2, alignItems: "flex-end" },
  msgRowOwn: { justifyContent: "flex-end" },
  msgRowOther: { justifyContent: "flex-start" },

  bubble: { maxWidth: SCREEN_W * 0.74, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 8 },
  bubbleOwn: { backgroundColor: EMERALD, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: GV_CARD, borderBottomLeftRadius: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: GV_BORDER },

  bubbleSender: { fontSize: 11, fontWeight: "700", color: EMERALD, marginBottom: 2 },
  bubbleText: { fontSize: 15, color: "rgba(255,255,255,0.85)", lineHeight: 21 },
  bubbleTextOwn: { color: "#fff" },
  bubbleTime: { fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 3, textAlign: "right" },
  bubbleTimeOwn: { color: "rgba(255,255,255,0.6)" },

  emptyMsgWrap: { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 80 },
  emptyMsgText: { color: "rgba(255,255,255,0.3)", fontSize: 14 },

  // ── Input bar ────────────────────────────────────────────────────────────────
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: GV_SURFACE,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: GV_BORDER,
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: GV_CARD,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: "#fff",
    fontSize: 15,
    maxHeight: 120,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: GV_BORDER,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: EMERALD,
    justifyContent: "center",
    alignItems: "center",
  },
  sendBtnDisabled: { backgroundColor: "rgba(16,185,129,0.3)" },
  sendBtnIcon: { color: "#fff", fontSize: 16 },
});
