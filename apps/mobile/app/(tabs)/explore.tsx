import { useState, useEffect } from 'react';
import LoginScreen from '../../src/screens/LoginScreen';
import ProfileScreen from '../../src/screens/ProfileScreen';
import AccountScreen from '../../src/screens/AccountScreen';
import { supabase } from '../../lib/supabase';
import { View, ActivityIndicator } from 'react-native';

type Screen = 'profile' | 'account';

export default function TabTwoScreen() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>('profile');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) setScreen('profile'); // reset on logout
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#040a14', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#10b981" size="large" />
      </View>
    );
  }

  if (!session) return <LoginScreen />;

  if (screen === 'account') {
    return <AccountScreen onBack={() => setScreen('profile')} />;
  }

  return (
    <ProfileScreen
      onNavigateToAccount={() => setScreen('account')}
    />
  );
}
