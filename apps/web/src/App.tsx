import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from './lib/supabase';
import './App.css';

// Types
import type { Profile, InventoryItem, Loan, View } from './types';
import type { Session } from '@supabase/supabase-js';

// Layout
import { Sidebar } from './components/layout/Sidebar';

// Views
import { CollectionView } from './components/views/CollectionView';
import { LoanView } from './components/views/LoanView';
import { UserManagement } from './components/views/UserManagement';
import { ChatView } from './components/views/ChatView';
import { LoginView } from './components/views/LoginView';

// Modals
import { GameDetailModal } from './components/modals/GameDetailModal';
import { LoanModal } from './components/modals/LoanModal';

// UI
import { Icon } from './components/ui/Icon';

/* ─── Main Dashboard ──────────────────────────────────────────────── */
export default function AdminDashboard() {
  const [items, setItems]             = useState<InventoryItem[]>([]);
  const [users, setUsers]             = useState<Profile[]>([]);
  const [loans, setLoans]             = useState<Loan[]>([]);
  const [session, setSession]         = useState<Session | null>(null);
  const [loading, setLoading]         = useState(true);
  const [loansLoading, setLoansLoading] = useState(false);
  const [view, setView]               = useState<View>('collection');
  const [activeUserFilter, setActiveUserFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [loanTargetItem, setLoanTargetItem] = useState<InventoryItem | null>(null);
  const [gridView, setGridView]       = useState(true);
  const [recentlyModified, setRecentlyModified] = useState<Profile[]>([]);

  /* ── Data fetching ── */
  const fetchUsers = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('full_name');
    if (data) {
      const profiles = data as Profile[];
      setUsers(profiles);

      // Recently modified: top 5 by updated_at
      const sorted = [...profiles]
        .filter(u => u.updated_at)
        .sort((a, b) => new Date(b.updated_at!).getTime() - new Date(a.updated_at!).getTime())
        .slice(0, 5);
      setRecentlyModified(sorted);
    }
  }, []);

  const fetchInventory = useCallback(async () => {
    let q = supabase
      .from('inventory_items')
      .select('*, games(id,title,cover_url,summary), profiles(id,full_name,avatar_url,role,updated_at)')
      .order('created_at', { ascending: false });
    if (activeUserFilter) q = q.eq('user_id', activeUserFilter);
    const { data, error } = await q;
    if (error) console.error(error);
    if (data) setItems(data as unknown as InventoryItem[]);
    setLoading(false);
  }, [activeUserFilter]);

  const fetchLoans = useCallback(async () => {
    setLoansLoading(true);
    const { data } = await supabase
      .from('loans')
      .select('*, inventory_items(*, games(id,title,cover_url)), profiles(id,full_name,avatar_url)')
      .order('loan_date', { ascending: false })
      .limit(200);
    if (data) setLoans(data as unknown as Loan[]);
    setLoansLoading(false);
  }, []);

  /* ── Init + realtime ── */
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    
    const init = async () => {
      await Promise.all([fetchUsers(), fetchInventory(), fetchLoans()]);
    };
    init();

    const ch1 = supabase.channel('rt-inventory')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, fetchInventory)
      .subscribe();
    const ch2 = supabase.channel('rt-profiles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchUsers)
      .subscribe();
    const ch3 = supabase.channel('rt-loans')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loans' }, fetchLoans)
      .subscribe();

    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
      supabase.removeChannel(ch3);
    };
  }, [session, fetchInventory, fetchUsers, fetchLoans]);

  const currentAdmin = useMemo(() => {
    if (session && users.length > 0) {
      return users.find(u => u.id === session.user.id) || null;
    }
    return null;
  }, [session, users]);

  /* ── Actions ── */
  const handleStatusChange = async (itemId: string, newStatus: string) => {
    await supabase.from('inventory_items').update({ status: newStatus }).eq('id', itemId);
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, status: newStatus as InventoryItem['status'] } : i));
  };

  const handleToggleAdmin = async (userId: string, role: string) => {
    const newRole = role === 'admin' ? 'student' : 'admin';
    await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
    await fetchUsers();
  };

  const handleUserModified = async () => {
    await fetchUsers();
  };

  const handleLoanReturn = useCallback((loanId: string) => {
    setLoans(prev => prev.map(l =>
      l.id === loanId ? { ...l, return_date: new Date().toISOString(), status: 'returned' } : l
    ));
    fetchInventory();
  }, [fetchInventory]);

  /* ── Filtering ── */
  const filteredItems = useMemo(() => {
    let result = items;
    if (statusFilter !== 'all') result = result.filter(i => i.status === statusFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(i =>
        i.games?.title.toLowerCase().includes(q) ||
        i.barcode.includes(q) ||
        i.profiles?.full_name.toLowerCase().includes(q)
      );
    }
    return result;
  }, [items, statusFilter, searchQuery]);

  const stats = useMemo(() => ({
    total:     items.length,
    available: items.filter(i => i.status === 'available').length,
    loaned:    items.filter(i => i.status === 'loaned').length,
    users:     users.length,
  }), [items, users]);

  /* ── Render ── */
  if (!session) {
    return <LoginView />;
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--gv-bg)', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ── SIDEBAR ── */}
      <Sidebar
        view={view}
        setView={setView}
        users={users}
        recentlyModified={recentlyModified}
        activeUserFilter={activeUserFilter}
        setActiveUserFilter={setActiveUserFilter}
        currentAdmin={currentAdmin}
        loans={loans}
        stats={stats}
      />

      {/* ── MAIN ── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top Bar */}
        <header className="shrink-0 flex items-center justify-between px-8 py-4 border-b border-white/5" style={{ background: 'rgba(8,15,30,0.8)', backdropFilter: 'blur(20px)' }}>
          <div>
            {view === 'collection' && (
              <>
                <h1 className="text-2xl font-black text-white tracking-tight">Colección de Juegos</h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  {activeUserFilter
                    ? `Colección de ${users.find(u => u.id === activeUserFilter)?.full_name}`
                    : 'Vista completa del ecosistema'}
                </p>
              </>
            )}
            {view === 'loans' && (
              <>
                <h1 className="text-2xl font-black text-white tracking-tight">Préstamos</h1>
                <p className="text-xs text-slate-500 mt-0.5">Gestión de préstamos activos e historial</p>
              </>
            )}
            {view === 'users' && (
              <>
                <h1 className="text-2xl font-black text-white tracking-tight">Gestión de Usuarios</h1>
                <p className="text-xs text-slate-500 mt-0.5">{users.length} usuarios registrados</p>
              </>
            )}
            {view === 'chat' && (
              <>
                <h1 className="text-2xl font-black text-white tracking-tight">Mensajes</h1>
                <p className="text-xs text-slate-500 mt-0.5">Comunicación en tiempo real con usuarios</p>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            {view === 'collection' && (
              <>
                {/* Search */}
                <div className="relative">
                  <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Buscar juegos, usuarios…"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-emerald-500/40 text-white placeholder-slate-600 w-52"
                  />
                </div>

                {/* Status filter */}
                <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/5">
                  {['all', 'available', 'loaned', 'maintenance'].map(s => (
                    <button
                      key={s}
                      onClick={() => setStatusFilter(s)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                        statusFilter === s ? 'bg-emerald-500 text-slate-950 shadow-md' : 'text-slate-500 hover:text-white'
                      }`}
                    >
                      {s === 'all' ? 'Todos' : s === 'available' ? 'Libre' : s === 'loaned' ? 'Prestado' : 'Mantenimiento'}
                    </button>
                  ))}
                </div>

                {/* Grid/List toggle */}
                <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/5">
                  <button onClick={() => setGridView(true)} className={`p-1.5 rounded-lg transition-all ${gridView ? 'bg-white/10 text-white' : 'text-slate-600 hover:text-slate-300'}`}>
                    <Icon name="grid" className="w-4 h-4" />
                  </button>
                  <button onClick={() => setGridView(false)} className={`p-1.5 rounded-lg transition-all ${!gridView ? 'bg-white/10 text-white' : 'text-slate-600 hover:text-slate-300'}`}>
                    <Icon name="list" className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}

            {/* Logout Button (Web) */}
            <button
              onClick={() => supabase.auth.signOut()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 transition-all font-bold text-xs"
              title="Cerrar Sesión"
            >
              <Icon name="logout" className="w-4 h-4" />
              <span className="hidden sm:inline">Cerrar Sesión</span>
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">
          {view === 'collection' && (
            <CollectionView
              items={filteredItems}
              loading={loading}
              gridView={gridView}
              onSelectItem={setSelectedItem}
            />
          )}
          {view === 'loans' && (
            <LoanView
              loans={loans}
              loading={loansLoading}
              onReturn={handleLoanReturn}
            />
          )}
          {view === 'users' && (
            <UserManagement
              users={users}
              onToggleAdmin={handleToggleAdmin}
              onUserModified={handleUserModified}
            />
          )}
          {view === 'chat' && (
            <ChatView />
          )}
        </div>
      </main>

      {/* ── MODALS ── */}
      {selectedItem && (
        <GameDetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onStatusChange={handleStatusChange}
          onLoan={(item) => setLoanTargetItem(item)}
        />
      )}
      {loanTargetItem && (
        <LoanModal
          item={loanTargetItem}
          users={users}
          onClose={() => setLoanTargetItem(null)}
          onSuccess={() => { fetchLoans(); fetchInventory(); }}
        />
      )}
    </div>
  );
}