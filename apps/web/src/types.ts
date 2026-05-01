/* ─── GameVault Shared Types ─────────────────────────────────────── */

export interface Game {
  id: number;
  title: string;
  cover_url: string;
  summary: string;
}

export interface Profile {
  id: string;
  full_name: string;
  avatar_url: string;
  role: 'admin' | 'student';
  updated_at?: string;
}

export interface InventoryItem {
  id: string;
  barcode: string;
  status: 'available' | 'loaned' | 'maintenance';
  created_at: string;
  user_id: string;
  game_id?: number;
  games?: Game;
  profiles?: Profile;
}

export interface Loan {
  id: string;
  inventory_item_id: string;
  user_id: string;
  loan_date: string;
  due_date: string;
  return_date: string | null;
  status: 'active' | 'returned' | 'overdue';
  notes?: string;
  inventory_items?: InventoryItem & { games?: Game };
  profiles?: Profile;
}

export type View = 'collection' | 'loans' | 'users' | 'chat';
