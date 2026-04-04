import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  StatusBar,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { GameCard } from '../../components/common/GameCard';
import {
  GV_DARK, GV_CARD, GV_EMERALD,
  GV_BORDER,
} from '../../constants/theme';

interface GameItem {
  id: string;
  barcode: string;
  status: string;
  created_at: string;
  games?: { id: number; title: string; cover_url: string };
}

interface Profile {
  id: string;
  full_name: string;
  avatar_url: string;
  role: 'admin' | 'student';
}

interface ProfileScreenProps {
  /** Si se pasa, al pulsar "Cuenta" navega a esta función */
  onNavigateToAccount?: () => void;
}

export default function ProfileScreen({ onNavigateToAccount }: ProfileScreenProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [items, setItems] = useState<GameItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [profileRes, itemsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase
          .from('inventory_items')
          .select('*, games(id, title, cover_url)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
      ]);

      if (profileRes.data) setProfile(profileRes.data as Profile);
      if (itemsRes.data) setItems(itemsRes.data as GameItem[]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();

    let channel: ReturnType<typeof supabase.channel> | null = null;
    const setupRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        channel = supabase.channel(`profile-${user.id}`)
          .on('postgres_changes', {
            event: '*', schema: 'public', table: 'inventory_items',
            filter: `user_id=eq.${user.id}`,
          }, fetchAll)
          .subscribe();
      }
    };
    setupRealtime();

    return () => { if (channel) supabase.removeChannel(channel); };
  }, [fetchAll]);

  const handleSignOut = () => {
    Alert.alert('Cerrar Sesión', '¿Estás seguro de que quieres salir?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.auth.signOut();
          if (error) Alert.alert('Error', error.message);
        },
      },
    ]);
  };

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={GV_EMERALD} />
    </View>
  );

  const stats = {
    total: items.length,
    available: items.filter(i => i.status === 'available').length,
    loaned: items.filter(i => i.status === 'loaned').length,
  };

  return (
    <View style={{ flex: 1, backgroundColor: GV_DARK }}>
      {/* ── Botón de cerrar sesión redondo arriba derecha ── */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleSignOut} activeOpacity={0.8}>
        <Text style={styles.logoutIcon}>⇥</Text>
      </TouchableOpacity>

      <ScrollView style={styles.root} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <StatusBar barStyle="light-content" backgroundColor={GV_DARK} />

        {/* Profile card */}
        <View style={styles.profileCard}>
          <View style={styles.profileGlow} />
          <View style={styles.avatarWrap}>
            <Image
              source={{ uri: profile?.avatar_url || 'https://placehold.co/120/0c1628/10b981?text=?' }}
              style={styles.avatar}
            />
            {profile?.role === 'admin' && (
              <View style={styles.adminBadge}>
                <Text style={styles.adminBadgeText}>★</Text>
              </View>
            )}
          </View>
          <Text style={styles.profileName}>{profile?.full_name || 'Coleccionista'}</Text>
          <View style={styles.rolePill}>
            <Text style={styles.rolePillText}>
              {profile?.role === 'admin' ? '⬡ Administrador' : '◈ Explorador'}
            </Text>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          {[
            { label: 'En Vault', value: stats.total, color: '#fff' },
            { label: 'Disponibles', value: stats.available, color: GV_EMERALD },
            { label: 'Prestados', value: stats.loaned, color: '#f59e0b' },
          ].map(s => (
            <View key={s.label} style={styles.statBox}>
              <Text style={[styles.statVal, { color: s.color }]}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Collection */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Mi Colección</Text>
          <View style={styles.countPill}>
            <Text style={styles.countPillText}>{items.length}</Text>
          </View>
        </View>

        {items.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyEmoji}>📦</Text>
            <Text style={styles.emptyTitle}>Tu vault está vacío</Text>
            <Text style={styles.emptyBody}>Escanea el código de barras de tus juegos físicos para añadirlos aquí.</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {items.map(item => <GameCard key={item.id} item={item} />)}
          </View>
        )}

        {/* Cuenta button */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Cuenta</Text>
        </View>
        <TouchableOpacity
          style={styles.accountBtn}
          onPress={onNavigateToAccount}
          activeOpacity={0.8}
        >
          <Text style={styles.accountBtnIcon}>⚙️</Text>
          <View style={styles.accountBtnText}>
            <Text style={styles.accountBtnLabel}>Gestionar mi cuenta</Text>
            <Text style={styles.accountBtnSub}>Perfil, contraseña y notificaciones</Text>
          </View>
          <Text style={styles.accountBtnChevron}>›</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>GameVault v1.0 • Ecosystem Edition</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: GV_DARK },
  scroll: { paddingBottom: 60 },
  center: { flex: 1, backgroundColor: GV_DARK, justifyContent: 'center', alignItems: 'center' },

  // Logout button — floating top right
  logoutBtn: {
    position: 'absolute',
    top: 52,
    right: 20,
    zIndex: 99,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutIcon: { color: '#ef4444', fontSize: 16, fontWeight: '900' },

  // Profile card
  profileCard: {
    alignItems: 'center',
    paddingTop: 70,
    paddingBottom: 32,
    paddingHorizontal: 24,
    position: 'relative',
    overflow: 'hidden',
  },
  profileGlow: {
    position: 'absolute',
    top: 20,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: GV_EMERALD,
    opacity: 0.05,
    transform: [{ scaleX: 2.5 }],
  },
  avatarWrap: { position: 'relative', marginBottom: 16 },
  avatar: {
    width: 96, height: 96, borderRadius: 48,
    borderWidth: 3, borderColor: GV_EMERALD, backgroundColor: GV_CARD,
  },
  adminBadge: {
    position: 'absolute', bottom: 2, right: 2,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: GV_EMERALD,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: GV_DARK,
  },
  adminBadgeText: { fontSize: 10, color: '#fff', fontWeight: '900' },
  profileName: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 8, letterSpacing: -0.3 },
  rolePill: {
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderRadius: 99, paddingHorizontal: 14, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)',
  },
  rolePillText: { color: GV_EMERALD, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },

  // Stats
  statsRow: {
    flexDirection: 'row', marginHorizontal: 20, marginBottom: 24,
    backgroundColor: GV_CARD, borderRadius: 20, borderWidth: 1, borderColor: GV_BORDER, overflow: 'hidden',
  },
  statBox: {
    flex: 1, alignItems: 'center', paddingVertical: 18,
    borderRightWidth: 1, borderRightColor: GV_BORDER,
  },
  statVal: { fontSize: 26, fontWeight: '900' },
  statLabel: { color: 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: '700', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Section header
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 20, marginBottom: 14 },
  sectionTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  countPill: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3 },
  countPillText: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '700' },

  // Empty
  emptyBox: {
    marginHorizontal: 20, backgroundColor: GV_CARD, borderRadius: 20, padding: 32,
    alignItems: 'center', borderWidth: 1, borderColor: GV_BORDER, marginBottom: 24,
  },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { color: '#fff', fontSize: 16, fontWeight: '800', marginBottom: 8 },
  emptyBody: { color: 'rgba(255,255,255,0.35)', textAlign: 'center', lineHeight: 20, fontSize: 13 },

  // Grid
  grid: {
    flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, gap: 12, marginBottom: 28,
  },

  // Account button
  accountBtn: {
    marginHorizontal: 20,
    backgroundColor: GV_CARD,
    borderRadius: 18,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: GV_BORDER,
    marginBottom: 32,
  },
  accountBtnIcon: { fontSize: 22, marginRight: 14 },
  accountBtnText: { flex: 1 },
  accountBtnLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
  accountBtnSub: { color: 'rgba(255,255,255,0.35)', fontSize: 12, marginTop: 2 },
  accountBtnChevron: { color: 'rgba(255,255,255,0.2)', fontSize: 24 },

  footer: {
    textAlign: 'center', color: 'rgba(255,255,255,0.1)',
    fontSize: 11, fontWeight: '600', marginTop: 8, letterSpacing: 1,
  },
});
