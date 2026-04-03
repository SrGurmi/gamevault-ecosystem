import { timeAgo } from '../../lib/helpers';
import { supabase } from '../../lib/supabase';
import { Icon } from '../ui/Icon';
import type { Profile, View } from '../../types';

interface SidebarProps {
  view: View;
  setView: (v: View) => void;
  users: Profile[];
  recentlyModified: Profile[];
  activeUserFilter: string | null;
  setActiveUserFilter: (id: string | null) => void;
  currentAdmin: Profile | null;
  loans: { return_date: string | null }[];
  stats: { total: number; available: number; loaned: number; users: number };
}

const navItems: { id: View; label: string; icon: string }[] = [
  { id: 'collection', label: 'Colección', icon: 'grid' },
  { id: 'loans',      label: 'Préstamos',  icon: 'book' },
  { id: 'chat',       label: 'Mensajes',   icon: 'message-circle' },
  { id: 'users',      label: 'Usuarios',   icon: 'users' },
];

export function Sidebar({
  view, setView, users, recentlyModified, activeUserFilter, setActiveUserFilter,
  currentAdmin, loans, stats,
}: SidebarProps) {
  const activeLoansCount = loans.filter(l => !l.return_date).length;

  return (
    <aside className="w-64 shrink-0 hidden lg:flex flex-col h-screen border-r border-white/5" style={{ background: 'var(--gv-surface)' }}>
      {/* Logo */}
      <div className="p-6 pb-4 flex items-center gap-3 border-b border-white/5">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
          <Icon name="barcode" className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="font-black text-white text-sm tracking-tight" style={{ fontFamily: 'Syne, sans-serif' }}>GAMEVAULT</p>
          <p className="text-[9px] text-emerald-500 font-bold uppercase tracking-[0.2em]">Admin Console</p>
        </div>
      </div>

      {/* Live indicator */}
      <div className="mx-4 mt-3 mb-1 flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.1)' }}>
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
        <span className="text-[10px] text-emerald-400/80 font-bold">Live sync activo</span>
      </div>

      <nav className="flex-1 p-4 pt-3 space-y-1 overflow-y-auto">
        {/* Navigation */}
        <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] px-3 mb-2 mt-2">Navegación</p>
        {navItems.map(nav => (
          <button
            key={nav.id}
            onClick={() => setView(nav.id)}
            className={`w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-center gap-3 text-sm font-semibold group ${
              view === nav.id ? 'text-emerald-400 font-bold' : 'text-slate-500 hover:text-slate-200 hover:bg-white/4'
            }`}
            style={view === nav.id ? { background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.15)' } : { border: '1px solid transparent' }}
          >
            <Icon name={nav.icon} className={`w-4 h-4 shrink-0 ${view === nav.id ? 'text-emerald-400' : 'text-slate-600 group-hover:text-slate-400'}`} />
            {nav.label}
            {nav.id === 'loans' && activeLoansCount > 0 && (
              <span className="ml-auto text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full font-black">
                {activeLoansCount}
              </span>
            )}
          </button>
        ))}

        {/* Quick stats */}
        <div className="pt-4 pb-2">
          <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] px-3 mb-3">Estadísticas</p>
          <div className="grid grid-cols-2 gap-2 px-1">
            {[
              { label: 'Total', val: stats.total, color: 'text-white' },
              { label: 'Disponibles', val: stats.available, color: 'text-emerald-400' },
              { label: 'Prestados', val: stats.loaned, color: 'text-amber-400' },
              { label: 'Usuarios', val: stats.users, color: 'text-blue-400' },
            ].map(s => (
              <div key={s.label} className="bg-white/3 rounded-xl px-3 py-2.5 border border-white/5">
                <p className={`text-xl font-black ${s.color}`}>{s.val}</p>
                <p className="text-[9px] text-slate-600 font-bold uppercase tracking-wider mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Recently modified users */}
        {recentlyModified.length > 0 && (
          <div className="pt-3">
            <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] px-3 mb-2">Modificados Recientemente</p>
            <div className="space-y-0.5">
              {recentlyModified.map(user => (
                <button
                  key={user.id}
                  onClick={() => { setView('users'); }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-all text-slate-500 hover:bg-white/4 hover:text-slate-300"
                >
                  <img
                    src={user.avatar_url || 'https://placehold.co/32/0c1628/10b981?text=?'}
                    className="w-6 h-6 rounded-full shrink-0"
                    alt=""
                  />
                  <div className="flex-1 min-w-0 text-left">
                    <p className="font-bold truncate text-slate-300">{user.full_name}</p>
                    <p className="text-[9px] text-slate-600">{user.updated_at ? timeAgo(user.updated_at) : 'Reciente'}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* User filter */}
        <div className="pt-3">
          <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] px-3 mb-2">Filtrar por Usuario</p>
          <button
            onClick={() => setActiveUserFilter(null)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all mb-1 ${
              !activeUserFilter ? 'text-white bg-white/10' : 'text-slate-500 hover:bg-white/4 hover:text-slate-300'
            }`}
          >
            <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
              <Icon name="grid" className="w-3 h-3 text-slate-400" />
            </div>
            Todos
          </button>
          {users.map(user => (
            <button
              key={user.id}
              onClick={() => setActiveUserFilter(user.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all mb-0.5 ${
                activeUserFilter === user.id ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-500 hover:bg-white/4 hover:text-slate-300'
              }`}
            >
              <img src={user.avatar_url || 'https://placehold.co/32/0c1628/10b981?text=?'} className="w-6 h-6 rounded-full shrink-0" alt="" />
              <span className="truncate">{user.full_name}</span>
              {user.role === 'admin' && <Icon name="shield" className="w-3 h-3 text-emerald-500/60 shrink-0 ml-auto" />}
            </button>
          ))}
        </div>
      </nav>

      {/* Admin identity */}
      <div className="p-4 border-t border-white/5">
        <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] mb-2">Sesión activa</p>
        <div className="flex items-center gap-3 p-2 rounded-xl bg-white/3 border border-white/5 group">
          <img
            src={currentAdmin?.avatar_url || 'https://placehold.co/40/0c1628/10b981?text=?'}
            className="w-8 h-8 rounded-full border border-emerald-500/30 shrink-0 object-cover"
            alt=""
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-white truncate">{currentAdmin?.full_name || 'Cargando…'}</p>
            <p className="text-[9px] text-emerald-500 font-bold uppercase tracking-widest">{currentAdmin?.role || 'User'}</p>
          </div>
          <button 
            onClick={() => supabase.auth.signOut()}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-500/10 hover:text-red-400 text-slate-600 transition-all shrink-0 mr-1"
            title="Cerrar sesión"
          >
            <Icon name="log-out" className="w-4 h-4" />
          </button>
        </div>
      </div>
