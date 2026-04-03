import { useState } from 'react';
import { img, STATUS_COLORS } from '../../lib/helpers';
import { Icon } from '../ui/Icon';
import type { InventoryItem } from '../../types';

interface GameDetailModalProps {
  item: InventoryItem;
  onClose: () => void;
  onStatusChange: (id: string, status: string) => void;
  onLoan: (item: InventoryItem) => void;
}

export function GameDetailModal({ item, onClose, onStatusChange, onLoan }: GameDetailModalProps) {
  const [status, setStatus] = useState(item.status);
  const [saving, setSaving] = useState(false);

  const handleStatusChange = async (newStatus: string) => {
    setSaving(true);
    await onStatusChange(item.id, newStatus);
    setStatus(newStatus as typeof status);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop" onClick={onClose}>
      <div
        className="relative w-full max-w-2xl bg-[#0c1628] border border-white/10 rounded-3xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'fadeInUp 0.3s ease' }}
      >
        {/* Cover banner */}
        <div className="relative h-48 overflow-hidden">
          <img src={img(item.games?.cover_url, 't_1080p')} className="w-full h-full object-cover object-top" alt="" />
          <div className="absolute inset-0 bg-linear-to-b from-black/20 via-transparent to-[#0c1628]" />
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center text-slate-400 hover:text-white transition-colors border border-white/10"
          >
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 -mt-8 relative">
          <div className="flex items-end gap-4 mb-6">
            <img
              src={img(item.games?.cover_url)}
              className="w-24 h-32 object-cover rounded-2xl border-2 border-emerald-500/40 shadow-xl shrink-0"
              alt={item.games?.title}
            />
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-black text-white leading-tight mb-1">{item.games?.title || 'Unknown'}</h2>
              <div className="flex items-center gap-2 flex-wrap mt-2">
                <span className={`text-xs font-bold px-3 py-1 rounded-full border ${STATUS_COLORS[status] || STATUS_COLORS.available}`}>
                  {status.toUpperCase()}
                </span>
                <span className="text-xs text-slate-500">Barcode: {item.barcode}</span>
              </div>
            </div>
          </div>

          {item.games?.summary && (
            <p className="text-sm text-slate-400 leading-relaxed mb-6 line-clamp-3">{item.games.summary}</p>
          )}

          {/* Owner */}
          <div className="flex items-center gap-3 bg-white/5 rounded-2xl p-3 mb-6 border border-white/5">
            <img
              src={item.profiles?.avatar_url || 'https://placehold.co/150/0c1628/10b981?text=?'}
              className="w-10 h-10 rounded-full border border-emerald-500/30"
              alt=""
            />
            <div>
              <p className="text-sm font-bold text-white">{item.profiles?.full_name || 'Unknown'}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">Propietario del item</p>
            </div>
          </div>

          {/* Status Actions */}
          <div className="space-y-2 mb-4">
            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-3">Cambiar Estado</p>
            <div className="grid grid-cols-3 gap-2">
              {(['available', 'loaned', 'maintenance'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  disabled={saving}
                  className={`py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${
                    status === s
                      ? STATUS_COLORS[s]
                      : 'border-white/5 text-slate-500 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Loan CTA */}
          {status === 'available' && (
            <button
              onClick={() => { onClose(); onLoan(item); }}
              className="w-full py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all flex items-center justify-center gap-2"
            >
              <Icon name="book" className="w-4 h-4" />
              Crear Préstamo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
