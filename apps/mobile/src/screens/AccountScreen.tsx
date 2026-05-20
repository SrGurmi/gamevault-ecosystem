import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  StatusBar,
  ActivityIndicator,
  Platform,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { supabase } from '../../lib/supabase';
import { GV_DARK, GV_CARD, GV_EMERALD, GV_BORDER, GV_RED } from '../../constants/theme';

type Section = 'main' | 'profile' | 'password' | 'notifications';

interface NotificationSettings {
  loanReminders: boolean;
  newLoans: boolean;
  systemAlerts: boolean;
  weeklyReport: boolean;
}

interface AccountScreenProps {
  onBack?: () => void;
}

/* ─── Main Account Screen ─────────────────────────────────────────── */
export default function AccountScreen({ onBack }: AccountScreenProps) {
  const [section, setSection] = useState<Section>('main');

  if (section === 'profile') return <EditProfileSection onBack={() => setSection('main')} />;
  if (section === 'password') return <ChangePasswordSection onBack={() => setSection('main')} />;
  if (section === 'notifications') return <NotificationsSection onBack={() => setSection('main')} />;

  return <MainAccountMenu onNavigate={setSection} onBack={onBack} />;
}

/* ─── Main Menu ───────────────────────────────────────────────────── */
function MainAccountMenu({ onNavigate, onBack }: { onNavigate: (s: Section) => void; onBack?: () => void }) {
  const handleSignOut = () => {
    Alert.alert('Cerrar Sesión', '¿Estás seguro de que quieres salir?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.auth.signOut();
          if (error) Alert.alert('Error', error.message);
        },
      },
    ]);
  };

  const menuItems: { icon: string; label: string; sublabel: string; section: Section }[] = [
    { icon: '👤', label: 'Editar Perfil', sublabel: 'Nombre, avatar y datos personales', section: 'profile' },
    { icon: '🔒', label: 'Cambiar Contraseña',  sublabel: 'Actualiza tu contraseña de acceso', section: 'password' },
    { icon: '🔔', label: 'Notificaciones', sublabel: 'Configura tus alertas y avisos', section: 'notifications' },
  ];

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <StatusBar barStyle="light-content" backgroundColor={GV_DARK} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerGlow} />
        {onBack && (
          <TouchableOpacity onPress={onBack} style={styles.topBackBtn}>
            <Text style={styles.topBackBtnText}>‹ Volver</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>Mi Cuenta</Text>
        <Text style={styles.headerSub}>Gestiona tu perfil y preferencias</Text>
      </View>

      {/* Menu card */}
      <View style={styles.menuCard}>
        {menuItems.map((item, idx) => (
          <React.Fragment key={item.section}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => onNavigate(item.section)}
              activeOpacity={0.7}
            >
              <View style={styles.menuIconWrap}>
                <Text style={styles.menuIcon}>{item.icon}</Text>
              </View>
              <View style={styles.menuTextWrap}>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Text style={styles.menuSub}>{item.sublabel}</Text>
              </View>
              <Text style={styles.menuChevron}>›</Text>
            </TouchableOpacity>
            {idx < menuItems.length - 1 && <View style={styles.menuDivider} />}
          </React.Fragment>
        ))}
      </View>

      {/* Sign out */}
      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.8}>
        <Text style={styles.signOutIcon}>⇥</Text>
        <Text style={styles.signOutText}>Cerrar Sesión</Text>
      </TouchableOpacity>

      <Text style={styles.footer}>GameVault v1.0 • Ecosystem Edition</Text>
    </ScrollView>
  );
}

/* ─── Edit Profile ────────────────────────────────────────────────── */
function EditProfileSection({ onBack }: { onBack: () => void }) {
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from('profiles').select('full_name, avatar_url').eq('id', user.id).single();
        if (data) {
          setFullName(data.full_name || '');
          setAvatarUrl(data.avatar_url);
        }
      }
    };
    loadProfile();
  }, []);

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      await handleUploadAvatar(result.assets[0].uri);
    }
  };

  const handleUploadAvatar = async (imageUri: string) => {
    setUploadingAvatar(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { Alert.alert('Error', 'Usuario no autenticado'); return; }

      // Read file as binary
      const base64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: 'base64',
      });

      const fileName = `${user.id}/avatar.jpg`;
      const bucketName = 'avatars';

      // Convert base64 to Uint8Array
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(fileName, bytes, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) {
        Alert.alert('Error de carga', uploadError.message);
        return;
      }

      // Get public URL with cache-busting timestamp
      const { data: publicUrlData } = supabase.storage.from(bucketName).getPublicUrl(fileName);
      const publicUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

      // Update profile with avatar URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

      if (updateError) {
        Alert.alert('Error', updateError.message);
        return;
      }

      setAvatarUrl(publicUrl);
      Alert.alert('Éxito', 'Avatar actualizado correctamente');
    } catch (err) {
      console.error('Avatar upload error:', err);
      Alert.alert('Error', 'No se pudo cargar la imagen');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    if (!fullName.trim()) { Alert.alert('Campo vacío', 'Introduce tu nombre completo.'); return; }
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { error } = await supabase.from('profiles').update({ full_name: fullName.trim() }).eq('id', user.id);
      if (error) Alert.alert('Error', error.message);
      else setSuccess(true);
    }
    setLoading(false);
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <StatusBar barStyle="light-content" backgroundColor={GV_DARK} />
      <View style={styles.sectionHeader}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ Volver</Text>
        </TouchableOpacity>
        <Text style={styles.sectionTitle}>Editar Perfil</Text>
      </View>

      <View style={styles.formCard}>
        {/* Avatar Section */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarContainer}>
            {avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={styles.avatarImage}
              />
            ) : (
              <Text style={styles.avatarPlaceholder}>📷</Text>
            )}
            <TouchableOpacity
              style={styles.cameraOverlay}
              onPress={handlePickImage}
              disabled={uploadingAvatar}
              activeOpacity={0.7}
            >
              {uploadingAvatar ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.cameraIcon}>📷</Text>
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.avatarLabel}>Cambiar Avatar</Text>
        </View>

        <Text style={styles.label}>Nombre Completo</Text>
        <TextInput
          style={styles.input}
          placeholder="Tu nombre completo"
          placeholderTextColor="rgba(255,255,255,0.2)"
          value={fullName}
          onChangeText={setFullName}
          autoCapitalize="words"
        />

        {success && (
          <View style={styles.successBox}>
            <Text style={styles.successText}>✓ Perfil actualizado correctamente</Text>
          </View>
        )}

        <TouchableOpacity style={styles.btnPrimary} onPress={handleSave} disabled={loading} activeOpacity={0.8}>
          {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnPrimaryText}>Guardar Cambios</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

/* ─── Change Password ─────────────────────────────────────────────── */
function ChangePasswordSection({ onBack }: { onBack: () => void }) {
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleChange = async () => {
    if (!newPass || newPass.length < 6) { Alert.alert('Contraseña inválida', 'Mínimo 6 caracteres.'); return; }
    if (newPass !== confirmPass) { Alert.alert('No coinciden', 'Las contraseñas no son iguales.'); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPass });
    if (error) Alert.alert('Error', error.message);
    else setSuccess(true);
    setLoading(false);
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <StatusBar barStyle="light-content" backgroundColor={GV_DARK} />
      <View style={styles.sectionHeader}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ Volver</Text>
        </TouchableOpacity>
        <Text style={styles.sectionTitle}>Cambiar Contraseña</Text>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.label}>Nueva Contraseña</Text>
        <TextInput
          style={styles.input}
          placeholder="Mínimo 6 caracteres"
          placeholderTextColor="rgba(255,255,255,0.2)"
          secureTextEntry
          value={newPass}
          onChangeText={setNewPass}
        />
        <Text style={[styles.label, { marginTop: 16 }]}>Confirmar Nueva Contraseña</Text>
        <TextInput
          style={styles.input}
          placeholder="Repite la contraseña"
          placeholderTextColor="rgba(255,255,255,0.2)"
          secureTextEntry
          value={confirmPass}
          onChangeText={setConfirmPass}
        />

        {success && (
          <View style={styles.successBox}>
            <Text style={styles.successText}>✓ Contraseña actualizada correctamente</Text>
          </View>
        )}

        <TouchableOpacity style={styles.btnPrimary} onPress={handleChange} disabled={loading} activeOpacity={0.8}>
          {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnPrimaryText}>Actualizar Contraseña</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

/* ─── Notifications ───────────────────────────────────────────────── */
function NotificationsSection({ onBack }: { onBack: () => void }) {
  const [settings, setSettings] = useState<NotificationSettings>({
    loanReminders: true,
    newLoans: true,
    systemAlerts: false,
    weeklyReport: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotificationPreferences();
  }, []);

  const loadNotificationPreferences = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (data) {
        setSettings({
          loanReminders: data.loan_reminders ?? true,
          newLoans: data.new_loans ?? true,
          systemAlerts: data.system_alerts ?? false,
          weeklyReport: data.weekly_report ?? false,
        });
      }
    } catch (err) {
      console.error('Error loading notification preferences:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggle = async (key: keyof NotificationSettings) => {
    const newValue = !settings[key];
    setSettings(prev => ({ ...prev, [key]: newValue }));

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const updateData: Record<string, boolean> = {
        loan_reminders: key === 'loanReminders' ? newValue : settings.loanReminders,
        new_loans: key === 'newLoans' ? newValue : settings.newLoans,
        system_alerts: key === 'systemAlerts' ? newValue : settings.systemAlerts,
        weekly_report: key === 'weeklyReport' ? newValue : settings.weeklyReport,
      };

      await supabase
        .from('notification_preferences')
        .update(updateData)
        .eq('user_id', user.id);
    } catch (err) {
      console.error('Error saving notification preferences:', err);
      // Revert on error
      setSettings(prev => ({ ...prev, [key]: !newValue }));
    }
  };

  const notifItems: { key: keyof NotificationSettings; icon: string; label: string; sub: string }[] = [
    { key: 'loanReminders', icon: '⏰', label: 'Recordatorios de préstamo', sub: 'Aviso cuando se acerca la fecha de devolución' },
    { key: 'newLoans',      icon: '📚', label: 'Nuevos préstamos', sub: 'Cuando alguien solicita un juego' },
    { key: 'systemAlerts',  icon: '⚡', label: 'Alertas del sistema', sub: 'Notificaciones de mantenimiento y actualizaciones' },
    { key: 'weeklyReport',  icon: '📊', label: 'Informe semanal', sub: 'Resumen semanal de tu actividad en GameVault' },
  ];

  if (loading) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={GV_EMERALD} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <StatusBar barStyle="light-content" backgroundColor={GV_DARK} />
      <View style={styles.sectionHeader}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ Volver</Text>
        </TouchableOpacity>
        <Text style={styles.sectionTitle}>Notificaciones</Text>
      </View>

      <View style={styles.menuCard}>
        {notifItems.map((item, idx) => (
          <React.Fragment key={item.key}>
            <View style={styles.notifRow}>
              <Text style={styles.notifIcon}>{item.icon}</Text>
              <View style={styles.notifTextWrap}>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Text style={styles.menuSub}>{item.sub}</Text>
              </View>
              <Switch
                value={settings[item.key]}
                onValueChange={() => toggle(item.key)}
                trackColor={{ false: 'rgba(255,255,255,0.1)', true: `${GV_EMERALD}55` }}
                thumbColor={settings[item.key] ? GV_EMERALD : 'rgba(255,255,255,0.3)'}
                ios_backgroundColor="rgba(255,255,255,0.1)"
              />
            </View>
            {idx < notifItems.length - 1 && <View style={styles.menuDivider} />}
          </React.Fragment>
        ))}
      </View>

      <Text style={styles.notifNote}>
        🔒 Las preferencias de notificaciones se sincronizan en la nube.
      </Text>
    </ScrollView>
  );
}

/* ─── Styles ──────────────────────────────────────────────────────── */
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: GV_DARK },
  scroll: { paddingBottom: 60 },

  // Header
  header: {
    alignItems: 'center',
    paddingTop: 80,
    paddingBottom: 36,
    paddingHorizontal: 24,
    position: 'relative',
    overflow: 'hidden',
  },
  headerGlow: {
    position: 'absolute',
    top: 20,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: GV_EMERALD,
    opacity: 0.04,
    transform: [{ scaleX: 2.5 }],
  },
  headerTitle: { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: -0.5, marginBottom: 6 },
  headerSub: { color: 'rgba(255,255,255,0.35)', fontSize: 14, fontWeight: '500' },

  // Section header (sub-pages)
  sectionHeader: { paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingHorizontal: 20, paddingBottom: 24 },
  backBtn: { marginBottom: 16 },
  backBtnText: { color: GV_EMERALD, fontSize: 16, fontWeight: '700' },
  topBackBtn: { position: 'absolute', top: 52, left: 24, zIndex: 10 },
  topBackBtnText: { color: GV_EMERALD, fontSize: 15, fontWeight: '700' },
  sectionTitle: { color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: -0.3 },

  // Menu card
  menuCard: {
    marginHorizontal: 20,
    backgroundColor: GV_CARD,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: GV_BORDER,
    overflow: 'hidden',
    marginBottom: 16,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 18 },
  menuIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuIcon: { fontSize: 18 },
  menuTextWrap: { flex: 1 },
  menuLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
  menuSub: { color: 'rgba(255,255,255,0.3)', fontSize: 12, marginTop: 2, fontWeight: '500' },
  menuChevron: { color: 'rgba(255,255,255,0.2)', fontSize: 22, fontWeight: '300' },
  menuDivider: { height: 1, backgroundColor: GV_BORDER, marginLeft: 70 },

  // Notifications
  notifRow: { flexDirection: 'row', alignItems: 'center', padding: 18 },
  notifIcon: { fontSize: 18, width: 32 },
  notifTextWrap: { flex: 1, marginLeft: 12, marginRight: 12 },
  notifNote: {
    marginHorizontal: 20,
    color: 'rgba(255,255,255,0.2)',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 8,
  },

  // Form
  formCard: {
    marginHorizontal: 20,
    backgroundColor: GV_CARD,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: GV_BORDER,
    padding: 20,
    marginBottom: 16,
  },

  // Avatar section
  avatarSection: {
    alignItems: 'center',
    marginBottom: 28,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 2,
    borderColor: GV_EMERALD,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 2,
    borderColor: GV_EMERALD,
    fontSize: 40,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: GV_EMERALD,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: GV_CARD,
    shadowColor: GV_EMERALD,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  cameraIcon: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '800',
  },
  avatarLabel: {
    color: GV_EMERALD,
    fontSize: 13,
    fontWeight: '700',
  },

  label: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: GV_BORDER,
    borderRadius: 14,
    padding: 16,
    fontSize: 15,
    color: '#fff',
    marginBottom: 4,
  },
  successBox: {
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.2)',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    marginBottom: 4,
  },
  successText: { color: GV_EMERALD, fontSize: 13, fontWeight: '700', textAlign: 'center' },

  // Buttons
  btnPrimary: {
    backgroundColor: GV_EMERALD,
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    marginTop: 20,
    shadowColor: GV_EMERALD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },

  // Sign out
  signOutBtn: {
    marginHorizontal: 20,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.15)',
    marginBottom: 32,
  },
  signOutIcon: { color: GV_RED, fontSize: 18 },
  signOutText: { color: GV_RED, fontSize: 15, fontWeight: '700' },

  footer: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.1)',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 20,
    letterSpacing: 1,
  },
});
