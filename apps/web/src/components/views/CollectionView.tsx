import { img, timeAgo } from '../../lib/helpers';
import { Icon } from '../ui/Icon';
import { StatusBadge } from '../ui/StatusBadge';
import { Spinner } from '../ui/Spinner';
import type { InventoryItem } from '../../types';

interface CollectionViewProps {
  items: InventoryItem[];
  loading: boolean;
  gridView: boolean;
  onSelectItem: (item: InventoryItem) => void;
}

export function CollectionView({ items, loading, gridView, onSelectItem }: CollectionViewProps) {
  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <Spinner label="Cargando inventario…" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="py-32 flex flex-col items-center text-slate-600">
        <Icon name="gamepad" className="w-16 h-16 mb-4 opacity-20" />
        <p className="text-xl font-bold">El vault está vacío</p>
        <p className="text-sm mt-1">Escanea juegos con la app móvil para poblar la colección</p>
      </div>
    );
  }

  if (gridView) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-5">
        {items.map((item, i) => (
          <div
            key={item.id}
            className="group cursor-pointer"
            style={{ animation: `fadeInUp 0.4s ease ${Math.min(i * 0.04, 0.6)}s both` }}
            onClick={() => onSelectItem(item)}
          >
            <div className="relative aspect-3/4 rounded-xl overflow-hidden mb-3 bg-black/40 group-hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all">
              <img
                src={img(item.games?.cover_url)}
                className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
                alt={item.games?.title}
                loading="lazy"
              />
              <div className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-black/80 via-black/20 to-transparent flex items-end p-2 opacity-0 group-hover:opacity-100 transition-opacity" />
              <StatusBadge status={item.status} className="absolute top-2.5 right-2.5" />

              {item.profiles && (
                <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 bg-black/70 backdrop-blur-sm px-2 py-1 rounded-full border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <img src={item.profiles.avatar_url || 'https://placehold.co/24'} className="w-4 h-4 rounded-full" alt="" />
                  <span className="text-[8px] font-bold text-slate-300 max-w-[60px] truncate">{item.profiles.full_name}</span>
                </div>
              )}

              <div className="absolute inset-x-3 bottom-3 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300">
                <div className="bg-white text-slate-900 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider text-center">
                  Ver Detalles
                </div>
              </div>
            </div>
            <div className="px-0.5">
              <h3 className="text-xs font-bold text-slate-200 line-clamp-1 group-hover:text-emerald-400 transition-colors">
                {item.games?.title || 'Unknown'}
              </h3>
              <p className="text-[10px] text-slate-600 mt-0.5 font-medium">{timeAgo(item.created_at)}</p>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div
          key={item.id}
          onClick={() => onSelectItem(item)}
          className="flex items-center gap-4 bg-white/5 border border-white/5 rounded-2xl p-3 cursor-pointer hover:bg-white/2 hover:border-emerald-500/30 transition-all group"
          style={{ animation: `fadeInUp 0.3s ease ${Math.min(i * 0.03, 0.5)}s both` }}
        >
          <img src={img(item.games?.cover_url)} className="w-12 h-16 object-cover rounded-lg shrink-0 grayscale group-hover:grayscale-0 transition-all" alt="" loading="lazy" />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white text-sm group-hover:text-emerald-400 transition-colors truncate">
              {item.games?.title || 'Unknown'}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">{item.barcode}</p>
          </div>
          {item.profiles && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <img src={item.profiles.avatar_url || ''} className="w-6 h-6 rounded-full" alt="" loading="lazy" />
              <span className="hidden md:block truncate max-w-[100px]">{item.profiles.full_name}</span>
            </div>
          )}
          <StatusBadge status={item.status} />
          <span className="text-xs text-slate-600 hidden lg:block w-16 text-right">{timeAgo(item.created_at)}</span>
          <Icon name="chevron" className="w-4 h-4 text-slate-700 group-hover:text-emerald-500 transition-colors flex-shrink-0" />
        </div>
      ))}
    </div>
  );
}
