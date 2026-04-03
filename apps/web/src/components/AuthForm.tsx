import { supabase } from '../lib/supabase';

export const handleSignUp = async (email: string, password: string, fullName: string) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName }
    }
  });

  if (error) {
    console.error("Error en registro:", error.message);
    return;
  }

  console.log("Registro exitoso para:", data.user?.email);
};