import { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import LoginScreen from '../../src/screens/LoginScreen';
import ChatScreen from '../../src/screens/ChatScreen';

export default function ChatTabScreen() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
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

  return <ChatScreen />;
}
