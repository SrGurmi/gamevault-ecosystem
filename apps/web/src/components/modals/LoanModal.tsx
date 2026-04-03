import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { img } from '../../lib/helpers';
import { Icon } from '../ui/Icon';
import type { InventoryItem, Profile } from '../../types';

interface LoanModalProps {
  item: InventoryItem;
  users: Profile[];
  onClose: () => void;
  onSuccess: () => void;
}

export function LoanModal({ item, users, onClose, onSuccess }: LoanModalProps) {
  const [selectedUserId, setSelectedUserId] = useState(item.user_id || '');
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14); // 2 semanas por defecto
    return d.toISOString().split('T')[0];
  });
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) { setError('Selecciona un usuario.'); return; }
    if (!dueDate) { setError('Introduce una fecha de devolución.'); return; }
    setSaving(true);
    setError('');

    const { error: loanError } = await supabase.from('loans').insert([{
      inventory_item_id: item.id,
      user_id: selectedUserId,
      loan_date: new Date().toISOString(),
      due_date: new Date(dueDate).toISOString(),
      status: 'active',
      notes,
    }]);

    if (loanError) {
      setError(loanError.message);
      setSaving(false);
      return;
    }

    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop" onClick={onClose}>
      <div
        className="relative w-full max-w-md bg-[#0c1628] border border-white/10 rounded-3xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'fadeInUp 0.3s ease' }}
      >
        {/* Header */}
        <div className="flex items-center gap-4 p-6 border-b border-white/5">
          <img src={img(item.games?.cover_url)} className="w-12 h-16 object-cover rounded-xl shrink-0" alt="" />
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-black text-white leading-tight">{item.games?.title || 'Unknown'}</h2>
            <p className="text-xs text-slate-500 mt-0.5">#{item.barcode}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-white/5 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition-colors border border-white/10 shrink-0">
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
              Prestar a
            </label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full bg-white/4 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500/40 appearance-none"
              style={{ backgroundImage: 'none' }}
            >
              <option value="" className="bg-[#0c1628] text-slate-400">— Seleccionar usuario —</option>
              {users.map(u => (
                <option key={u.id} value={u.id} className="bg-[#0c1628] text-white">
                  {u.full_name} ({u.role})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
              Fecha de devolución
            </label>
            <input
              type="date"
              value={dueDate}
              min={new Date().toISOString().split('T')[0]}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full bg-white/4 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500/40 scheme-dark"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
              Notas (opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Estado del juego, condiciones del préstamo…"
              className="w-full bg-white/4 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500/40 placeholder-slate-600 resize-none"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-white/10 text-slate-400 text-sm font-bold hover:bg-white/5 transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-emerald-500 text-slate-900 text-sm font-black hover:bg-emerald-400 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" />
              ) : (
                <>
                  <Icon name="check" className="w-4 h-4" />
                  Confirmar Préstamo
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
