/* ─── GameVault Mobile Theme ─────────────────────────────────────── */

export const GV_DARK    = '#040a14';
export const GV_SURFACE = '#080f1e';
export const GV_CARD    = '#0c1628';
export const GV_EMERALD = '#10b981';
export const GV_BORDER  = 'rgba(255,255,255,0.07)';
export const GV_AMBER   = '#f59e0b';
export const GV_RED     = '#ef4444';
export const TWITCH     = '#9146FF';

export const statusColors: Record<string, string> = {
  available:   GV_EMERALD,
  loaned:      GV_AMBER,
  maintenance: GV_RED,
};

export const coverUrl = (url?: string) => {
  if (!url) return 'https://placehold.co/100x140/0c1628/10b981?text=?';
  const sized = url.replace(/t_\w+/, 't_720p');
  if (sized.startsWith('http://') || sized.startsWith('https://')) return sized;
  if (sized.startsWith('//')) return `https:${sized}`;
  return sized;
};

export const timeAgo = (date: string) => {
  const diff = Date.now() - new Date(date).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  return `Hace ${days}d`;
};
