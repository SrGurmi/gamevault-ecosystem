import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking'
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from '../../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

const GV_DARK = '#040a14';
const GV_CARD = '#0c1628';
const GV_EMERALD = '#10b981';
const GV_BORDER = 'rgba(255,255,255,0.07)';

// Twitch purple
const TWITCH = '#9146FF';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [twitchLoading, setTwitchLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const signInWithTwitch = async () => {
    setTwitchLoading(true);
    try {
      const redirectTo = makeRedirectUri({ scheme: 'com.salesianos.gamevault' });
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'twitch',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (!data?.url) throw new Error('No se pudo generar la URL de Twitch');

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === 'success' && result.url) {
        const urlToParse = result.url.replace('#', '?');
        const { queryParams } = Linking.parse(urlToParse);
        if (queryParams?.access_token) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: queryParams.access_token as string,
            refresh_token: queryParams.refresh_token as string,
          });
          if (sessionError) throw sessionError;
        }
      }
    } catch (err: any) {
      Alert.alert('Error de Twitch', err.message);
    } finally {
      setTwitchLoading(false);
    }
  };

  const handleAuth = async () => {
    if (!email || !password || (!isLogin && !fullName)) {
      Alert.alert('Campos incompletos', 'Por favor completa todos los campos.');
      return;
    }
    setLoading(true);
    const { error } = isLogin
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });

    if (error) Alert.alert('Error', error.message);
    else if (!isLogin) Alert.alert('Cuenta creada correctamente', 'Continúa al inicio de sesión.');
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={GV_DARK} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* ── Hero section ── */}
        <View style={styles.hero}>
          {/* Glow background orb */}
          <View style={styles.glow} />

          {/* Logo mark */}
          <View style={styles.logoMark}>
            <View style={styles.logoInner}>
              {/* QR / barcode icon via unicode */}
              <Text style={{ fontSize: 28, color: GV_DARK }}>▦</Text>
            </View>
          </View>

          <Text style={styles.appName}>GAMEVAULT</Text>
          <Text style={styles.tagline}>
            {isLogin ? 'Tu colección, tu legado' : 'Comienza tu colección'}
          </Text>
        </View>

        {/* ── Card ── */}
        <View style={styles.card}>
          {/* Tab toggle */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tab, isLogin && styles.tabActive]}
              onPress={() => setIsLogin(true)}
            >
              <Text style={[styles.tabText, isLogin && styles.tabTextActive]}>Iniciar Sesión</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, !isLogin && styles.tabActive]}
              onPress={() => setIsLogin(false)}
            >
              <Text style={[styles.tabText, !isLogin && styles.tabTextActive]}>Registrarse</Text>
            </TouchableOpacity>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {!isLogin && (
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Nombre Completo</Text>
                <TextInput
                  style={[styles.input, focusedField === 'name' && styles.inputFocused]}
                  placeholder="Alex Guzmán"
                  placeholderTextColor="rgba(255,255,255,0.2)"
                  value={fullName}
                  onChangeText={setFullName}
                  onFocus={() => setFocusedField('name')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
            )}

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={[styles.input, focusedField === 'email' && styles.inputFocused]}
                placeholder="tu@email.com"
                placeholderTextColor="rgba(255,255,255,0.2)"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Contraseña</Text>
              <TextInput
                style={[styles.input, focusedField === 'pass' && styles.inputFocused]}
                placeholder="••••••••"
                placeholderTextColor="rgba(255,255,255,0.2)"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocusedField('pass')}
                onBlur={() => setFocusedField(null)}
              />
            </View>

            {/* Primary CTA */}
            <TouchableOpacity style={styles.btnPrimary} onPress={handleAuth} disabled={loading}>
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.btnPrimaryText}>{isLogin ? 'Entrar al Vault' : 'Crear Cuenta'}</Text>
              }
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>o continúa con</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Twitch button */}
            <TouchableOpacity style={styles.btnTwitch} onPress={signInWithTwitch} disabled={twitchLoading}>
              {twitchLoading
                ? <ActivityIndicator color="#fff" size="small" />
                : (
                  <>
                    <Text style={styles.twitchIcon}>⬡</Text>
                    <Text style={styles.btnTwitchText}>Twitch</Text>
                  </>
                )
              }
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.footer}>GameVault © 2026 • Ecosystem Edition</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: GV_DARK },
  scroll: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 40 },

  // Hero
  hero: { alignItems: 'center', paddingTop: 80, paddingBottom: 40 },
  glow: {
    position: 'absolute',
    top: 40,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: GV_EMERALD,
    opacity: 0.06,
    transform: [{ scaleX: 2 }],
  },
  logoMark: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: GV_EMERALD,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: GV_EMERALD,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
  },
  logoInner: { justifyContent: 'center', alignItems: 'center' },
  appName: {
    fontSize: 26,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 4,
    marginBottom: 6,
  },
  tagline: { fontSize: 14, color: 'rgba(255,255,255,0.35)', fontWeight: '500' },

  // Card
  card: {
    backgroundColor: GV_CARD,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: GV_BORDER,
    overflow: 'hidden',
  },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: GV_BORDER,
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: GV_EMERALD,
  },
  tabText: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.3)' },
  tabTextActive: { color: GV_EMERALD, fontWeight: '700' },

  // Form
  form: { padding: 24, gap: 0 },
  fieldGroup: { marginBottom: 20 },
  label: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.5)', marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' },
  input: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: GV_BORDER,
    borderRadius: 14,
    padding: 16,
    fontSize: 16,
    color: '#fff',
  },
  inputFocused: {
    borderColor: `${GV_EMERALD}60`,
    backgroundColor: 'rgba(16,185,129,0.04)',
  },

  // Primary button
  btnPrimary: {
    backgroundColor: GV_EMERALD,
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: GV_EMERALD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },

  // Divider
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: GV_BORDER },
  dividerText: { color: 'rgba(255,255,255,0.25)', fontSize: 12, fontWeight: '600', marginHorizontal: 12 },

  // Twitch button
  btnTwitch: {
    backgroundColor: TWITCH,
    borderRadius: 14,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: TWITCH,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  twitchIcon: { fontSize: 18, color: '#fff' },
  btnTwitchText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },

  footer: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.12)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 32,
    letterSpacing: 1,
  },
});