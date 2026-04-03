import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Icon } from '../ui/Icon';

export function LoginView() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{ background: '#080f1e' }}>
      {/* Dynamic Background */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-emerald-500/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-blue-500/10 blur-[150px] rounded-full" />
      </div>

      <div className="relative z-10 w-full max-w-md p-8 bg-white/2 border border-white/10 rounded-3xl backdrop-blur-2xl shadow-2xl" style={{ animation: 'fadeInUp 0.6s ease' }}>
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/20" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
            <Icon name="barcode" className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight" style={{ fontFamily: 'Syne, sans-serif' }}>GAMEVAULT</h1>
          <p className="text-xs text-emerald-500 font-bold uppercase tracking-[0.2em] mt-1">Admin Console</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold text-center">
              {error}
            </div>
          )}
          
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">
              Work Email
            </label>
            <div className="relative">
              <Icon name="mail" className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="admin@gamevault.local"
                className="w-full bg-white/4 border border-white/10 rounded-xl pl-11 pr-4 py-3.5 text-sm text-white focus:outline-none focus:border-emerald-500/50 focus:bg-white/6 transition-all placeholder-slate-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">
              Password
            </label>
            <div className="relative">
              <Icon name="lock" className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full bg-white/4 border border-white/10 rounded-xl pl-11 pr-4 py-3.5 text-sm text-white focus:outline-none focus:border-emerald-500/50 focus:bg-white/6 transition-all placeholder-slate-600"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 mt-2 flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-70"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" />
            ) : (
              <>
                Acceder con Email
                <Icon name="arrow-right" className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="flex items-center gap-4 my-6">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">O</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        <button
          onClick={() => supabase.auth.signInWithOAuth({ 
            provider: 'twitch',
            options: { redirectTo: window.location.href }
          })}
          className="w-full py-3.5 flex items-center justify-center gap-3 bg-[#9146FF]/10 border border-[#9146FF]/30 hover:bg-[#9146FF]/20 text-white font-black rounded-xl transition-all"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
          </svg>
          Iniciar sesión con Twitch
        </button>

      </div>
    </div>
  );
}
