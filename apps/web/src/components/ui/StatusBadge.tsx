import { STATUS_COLORS } from '../../lib/helpers';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export const StatusBadge = ({ status, className = '' }: StatusBadgeProps) => (
  <span
    className={`text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-full border ${STATUS_COLORS[status] || STATUS_COLORS.available} ${className}`}
  >
    {status}
  </span>
);
