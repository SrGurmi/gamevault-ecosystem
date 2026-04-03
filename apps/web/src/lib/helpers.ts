/* ─── Shared Helpers ──────────────────────────────────────────────── */

export const img = (url?: string, size = 't_720p') =>
  url
    ? `https:${url.replace(/t_\w+/, size)}`
    : 'https://placehold.co/300x400/0c1628/10b981?text=No+Cover';

export const timeAgo = (date: string) => {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

export const STATUS_COLORS: Record<string, string> = {
  available: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  loaned:    'bg-amber-500/20 text-amber-400 border-amber-500/30',
  maintenance: 'bg-red-500/20 text-red-400 border-red-500/30',
};

export const isOverdue = (dueDate: string, returnDate: string | null) =>
  !returnDate && new Date(dueDate) < new Date();
