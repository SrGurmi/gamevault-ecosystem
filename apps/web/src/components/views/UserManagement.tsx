import { useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { img, timeAgo } from '../../lib/helpers';
import { Icon } from '../ui/Icon';
import { Spinner } from '../ui/Spinner';
import { StatusBadge } from '../ui/StatusBadge';
import type { Profile, InventoryItem } from '../../types';

interface UserManagementProps {
  users: Profile[];
  onToggleAdmin: (id: string, role: string) => void;
  onUserModified: (user: Profile) => void;
}

interface UserCardProps {
  user: Profile;
  onToggleAdmin: (id: string, role: string) => void;
  onUserModified: (user: Profile) => void;
}

function UserGamesList({ userId }: { userId: string }) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('inventory_items')
      .select('id, barcode, status, created_at, games(id, title, cover_url)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setItems(data as InventoryItem[]);
    setLoading(false);
  }, [userId]);

  const toggleExpanded = useCallback(() => {
    setExpanded(prev => {
      if (!prev) {
        // trigger fetch on first open
        fetchItems();
      }
      return !prev;
    });
  }, [fetchItems]);

  return (
    <div className="mt-4 border-t border-white/5 pt-4">
      <button
        onClick={toggleExpanded}
        className="w-full flex items-center justify-between text-xs font-bold text-slate-500 hover:text-slate-300 transition-colors mb-2"
      >
        <span className="flex items-center gap-1.5">
          <Icon name="gamepad" className="w-3.5 h-3.5" />
          Ver colección
        </span>
        <Icon name="chevron" className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>

      {expanded && (
        loading ? (
          <div className="py-3 flex items-center justify-center">
            <Spinner size="sm" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-xs text-slate-600 text-center py-2">Sin juegos en su colección</p>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {items.map(item => (
              <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/3 border border-indigo-500/20 mb-4">
                <img
                  src={img(item.games?.cover_url)}
                  className="w-8 h-10 object-cover rounded-lg shrink-0"
                  alt=""
                  loading="lazy"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-slate-300 truncate">{item.games?.title || 'Desconocido'}</p>
                  <p className="text-[9px] text-slate-600">{timeAgo(item.created_at)}</p>
                </div>
                <StatusBadge status={item.status} />
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function ResetPasswordModal({ user, onClose }: { user: Profile; onClose: () => void }) {
  const [newPass, setNewPass] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPass.length < 6) return;
    setSaving(true);
    // Usando supabase admin API via edge function o directamente
    const { error } = await supabase.auth.updateUser({ password: newPass });
    if (!error) setDone(true);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4 modal-backdrop" onClick={onClose}>
      <div
        className="bg-[#0c1628] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
        onClick={e => e.stopPropagation()}
        style={{ animation: 'fadeInUp 0.2s ease' }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-black text-white">Cambiar contraseña</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-4">Usuario: <span className="text-white font-bold">{user.full_name}</span></p>
        {done ? (
          <div className="text-center py-4">
            <p className="text-emerald-400 font-bold text-sm">✓ Contraseña actualizada</p>
          </div>
        ) : (
          <form onSubmit={handleReset} className="space-y-4">
            <input
              type="password"
              placeholder="Nueva contraseña (mín. 6 caracteres)"
              value={newPass}
              onChange={e => setNewPass(e.target.value)}
              minLength={6}
              className="w-full bg-white/4 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500/40 placeholder-slate-600"
            />
            <button
              type="submit"
              disabled={saving || newPass.length < 6}
              className="w-full py-3 rounded-xl bg-emerald-500 text-slate-900 text-sm font-black hover:bg-emerald-400 transition-all disabled:opacity-40"
            >
              {saving ? 'Actualizando…' : 'Actualizar contraseña'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function UserCard({ user, onToggleAdmin, onUserModified }: UserCardProps) {
  const [showResetPass, setShowResetPass] = useState(false);
  const [toggling, setToggling] = useState(false);

  const handleToggle = async () => {
    setToggling(true);
    await onToggleAdmin(user.id, user.role);
    setToggling(false);
    onUserModified(user);
  };

  return (
    <div className="flex items-center p-4 rounded-2xl bg-white/3 border border-white/5 hover:border-emerald-500/20 transition-all gap-4">
      {/* User header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-shrink-0">
          <img
            src={user.avatar_url || 'https://placehold.co/150/0c1628/10b981?text=?'}
            className="w-12 h-12 rounded-full border-2 border-emerald-500/30 shrink-0"
            alt=""
            loading="lazy"
          />
          {user.role === 'admin' && (
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
              <Icon name="shield" className="w-3 h-3 text-slate-900" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-white text-sm truncate">{user.full_name}</p>
          <span className={`text-[9px] font-black uppercase tracking-widest ${user.role === 'admin' ? 'text-emerald-400' : 'text-slate-500'}`}>
            {user.role}
          </span>
          {user.updated_at && (
            <p className="text-[9px] text-slate-600 mt-0.5">Modificado {timeAgo(user.updated_at)}</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mb-1">
        <button
          onClick={handleToggle}
          disabled={toggling}
          className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${
            user.role === 'admin'
              ? 'border-red-500/20 text-red-400 hover:bg-red-500/10'
              : 'border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10'
          } disabled:opacity-50`}
        >
          {toggling ? '…' : user.role === 'admin' ? 'Quitar Admin' : 'Hacer Admin'}
        </button>
        <button
          onClick={() => setShowResetPass(true)}
          className="px-3 py-2 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 hover:text-white transition-all"
          title="Cambiar contraseña"
        >
          <Icon name="lock" className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Games list */}
      <UserGamesList userId={user.id} />

      {showResetPass && <ResetPasswordModal user={user} onClose={() => setShowResetPass(false)} />}
    </div>
  );
}

export function UserManagement({ users, onToggleAdmin, onUserModified }: UserManagementProps) {
  const [search, setSearch] = useState('');
  const filtered = users.filter(u =>
    u.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      {/* Search */}
      <div className="relative w-full max-w-xs">
        <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          placeholder="Buscar usuario…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-emerald-500/40 text-white placeholder-slate-600"
        />
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span><span className="text-white font-bold">{users.length}</span> usuarios totales</span>
        <span><span className="text-emerald-400 font-bold">{users.filter(u => u.role === 'admin').length}</span> admins</span>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(user => (
          <UserCard
            key={user.id}
            user={user}
            onToggleAdmin={onToggleAdmin}
            onUserModified={onUserModified}
          />
        ))}
      </div>
    </div>
  );
}
