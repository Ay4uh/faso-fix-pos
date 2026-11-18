import { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { MetricCards } from './components/MetricCards';
import { TicketTable } from './components/TicketTable';
import { CreateTicketModal } from './components/CreateTicketModal';
import { WorkOrderScreen } from './components/WorkOrderScreen';
import { PrintTicketModal } from './components/PrintTicketModal';
import { SendSmsModal } from './components/SendSmsModal';
import { CustomersView } from './components/CustomersView';
import { InventoryView } from './components/InventoryView';
import { AnalyticsView } from './components/AnalyticsView';
import { SettingsView } from './components/SettingsView';
import { AdminDashboard } from './components/AdminDashboard';
import { AdminLoginModal } from './components/AdminLoginModal';
import { LoginPage } from './components/LoginPage';
import { MobileDrawer } from './components/MobileDrawer';
import { MobileBottomNav } from './components/MobileBottomNav';
import { Ticket, Customer, DashboardStats, User } from './types';
import { CheckCircle2, ShieldAlert, Lock, Cpu } from 'lucide-react';
import { posAudio } from './utils/audio';
import { fetchWithAuth, removeToken } from './utils/auth';

export function App() {
  const [currentTab, setCurrentTab] = useState<'repairs' | 'customers' | 'inventory' | 'analytics' | 'settings' | 'admin'>('repairs');
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [selectedBench] = useState('ALL');

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Authentication & Session
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isVerifyingSession, setIsVerifyingSession] = useState(true);
  const [isAdminLoginModalOpen, setIsAdminLoginModalOpen] = useState(false);

  // Modals / Screens
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [printTicket, setPrintTicket] = useState<Ticket | null>(null);
  const [smsTicket, setSmsTicket] = useState<Ticket | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Check auth session on startup
  useEffect(() => {
    const verifySession = async () => {
      try {
        const res = await fetchWithAuth('/api/auth/me');
        if (res.ok) {
          const json = await res.json();
          if (json.authenticated && json.user) {
            setCurrentUser(json.user);
          } else {
            setCurrentUser(null);
          }
        } else {
          setCurrentUser(null);
        }
      } catch (err) {
        console.error('[Session Check Error]', err);
        setCurrentUser(null);
      } finally {
        setIsVerifyingSession(false);
      }
    };
    verifySession();
  }, []);

  // Listen for unauthorized events to kick back to LoginPage immediately
  useEffect(() => {
    const handleUnauthorized = () => {
      setCurrentUser(null);
      showToast('Session expired or unauthorized. Please sign in.');
    };
    window.addEventListener('apexfix_auth_unauthorized', handleUnauthorized);
    return () => window.removeEventListener('apexfix_auth_unauthorized', handleUnauthorized);
  }, []);

  // Ensure standard users can never view admin tab
  useEffect(() => {
    if (currentUser && currentUser.role !== 'ADMIN' && currentTab === 'admin') {
      setCurrentTab('repairs');
      showToast('Administrator privileges required');
    }
  }, [currentUser, currentTab]);

  const handleLogout = () => {
    const tokenToRevoke = localStorage.getItem('apexfix_session_token');
    // 1. Immediately wipe local auth credentials
    removeToken();
    localStorage.removeItem('apexfix_session_token');
    sessionStorage.clear();

    // 2. Synchronously clear active user state to render LoginPage immediately
    setCurrentUser(null);
    setSelectedTicket(null);
    setPrintTicket(null);
    setSmsTicket(null);
    if (currentTab === 'admin') {
      setCurrentTab('repairs');
    }

    // 3. Audio & Toast feedback
    posAudio.playBeep();
    showToast('Logged out successfully');

    // 4. Background fire-and-forget notification to server (never blocks UI)
    fetch('/api/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(tokenToRevoke ? { Authorization: `Bearer ${tokenToRevoke}` } : {}),
      },
      keepalive: true,
    }).catch(() => {});
  };

  const handleDeleteTicket = async (ticketId: string) => {
    try {
      const res = await fetchWithAuth(`/api/tickets/${ticketId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete work order');
      }
      posAudio.playSuccessChime();
      showToast('Work order successfully deleted');
      if (selectedTicket && selectedTicket.id === ticketId) {
        setSelectedTicket(null);
      }
      fetchData(true);
    } catch (err: any) {
      posAudio.playWarningBeep();
      showToast(err.message || 'Error deleting work order');
    }
  };

  // Global ESC key listener to close modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedTicket) setSelectedTicket(null);
        if (printTicket) setPrintTicket(null);
        if (smsTicket) setSmsTicket(null);
        if (isCreateModalOpen) setIsCreateModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTicket, printTicket, smsTicket, isCreateModalOpen]);

  const fetchData = async (silent = false) => {
    try {
      if (!silent) setIsLoading(true);
      const params = new URLSearchParams();
      if (activeFilter === 'ALL') {
        params.set('view', 'ALL');
      } else {
        params.set('status', activeFilter);
      }
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (selectedBench !== 'ALL') params.set('bench', selectedBench);

      const [ticketsRes, statsRes, customersRes] = await Promise.all([
        fetchWithAuth(`/api/tickets?${params.toString()}`),
        fetchWithAuth(`/api/stats?${selectedBench !== 'ALL' ? `bench=${selectedBench}` : ''}`),
        fetchWithAuth('/api/customers'),
      ]);

      if (ticketsRes.ok) {
        const data = await ticketsRes.json();
        const freshList: Ticket[] = data.data || [];
        setTickets(freshList);

        // Keep selectedTicket in sync if open
        if (selectedTicket) {
          const matched = freshList.find((t) => t.id === selectedTicket.id);
          if (matched && JSON.stringify(matched) !== JSON.stringify(selectedTicket)) {
            setSelectedTicket(matched);
          }
        }
      }

      if (statsRes.ok) {
        const sData = await statsRes.json();
        setStats(sData.data || null);
      }

      if (customersRes.ok) {
        const cData = await customersRes.json();
        setCustomers(cData.data || []);
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      fetchData(true);
    }, 3000);
    return () => clearInterval(interval);
  }, [activeFilter, searchQuery, selectedBench, selectedTicket?.id]);

  // Real-time live updates via Server-Sent Events (SSE)
  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: any = null;

    const connectSSE = () => {
      try {
        es = new EventSource('/api/live/stream');

        es.addEventListener('ticket_created', (e) => {
          try {
            const newTicket: Ticket = JSON.parse(e.data);
            setTickets((prev) => {
              if (prev.some((t) => t.id === newTicket.id)) return prev;
              return [newTicket, ...prev];
            });
            fetchData(true);
          } catch {}
        });

        es.addEventListener('ticket_updated', (e) => {
          try {
            const updated: Ticket = JSON.parse(e.data);
            setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
            setSelectedTicket((curr) => (curr && curr.id === updated.id ? updated : curr));
            fetchData(true);
          } catch {}
        });

        es.addEventListener('ticket_deleted', (e) => {
          try {
            const { id } = JSON.parse(e.data);
            setTickets((prev) => prev.filter((t) => t.id !== id));
            setSelectedTicket((curr) => (curr && curr.id === id ? null : curr));
            fetchData(true);
          } catch {}
        });

        es.addEventListener('customer_updated', () => {
          fetchData(true);
        });

        es.addEventListener('inventory_updated', () => {
          fetchData(true);
        });

        es.addEventListener('settings_updated', () => {
          fetchData(true);
        });

        es.onerror = () => {
          es?.close();
          reconnectTimer = setTimeout(connectSSE, 4000);
        };
      } catch (err) {
        console.warn('[SSE Init Error]', err);
      }
    };

    connectSSE();

    return () => {
      if (es) es.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, []);

  useEffect(() => {
    const handleFocus = () => fetchData(true);
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const handleSelectTicket = async (t: Ticket) => {
    try {
      setSelectedTicket(t);
      const res = await fetchWithAuth(`/api/tickets/${t.id}`);
      if (res.ok) {
        const full = await res.json();
        if (full.data) setSelectedTicket(full.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateStatus = async (ticketId: string, newStatus: Ticket['status']) => {
    try {
      if (newStatus === 'COMPLETED') posAudio.playSuccessChime();

      setTickets((prev) =>
        prev.map((t) => (t.id === ticketId ? { ...t, status: newStatus } : t))
      );

      if (selectedTicket && selectedTicket.id === ticketId) {
        setSelectedTicket((prev) => (prev ? { ...prev, status: newStatus } : null));
      }

      const res = await fetchWithAuth(`/api/tickets/${ticketId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) throw new Error('Failed to update status');
      const json = await res.json();
      if (json.data) {
        setTickets((prev) =>
          prev.map((t) => (t.id === ticketId ? json.data : t))
        );
        if (selectedTicket && selectedTicket.id === ticketId) {
          setSelectedTicket(json.data);
        }
      }

      showToast(`Work order status updated to ${newStatus}`);
      fetchData(true);
    } catch (err) {
      console.error(err);
      fetchData(true);
    }
  };

  const handleQuickComplete = async (ticketId: string) => {
    try {
      posAudio.playSuccessChime();

      setTickets((prev) =>
        prev.map((t) => (t.id === ticketId ? { ...t, status: 'COMPLETED' } : t))
      );
      if (selectedTicket && selectedTicket.id === ticketId) {
        setSelectedTicket((prev) => (prev ? { ...prev, status: 'COMPLETED' } : null));
      }

      const res = await fetchWithAuth(`/api/tickets/${ticketId}/quick-complete`, {
        method: 'POST',
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setTickets((prev) =>
            prev.map((t) => (t.id === ticketId ? json.data : t))
          );
          if (selectedTicket && selectedTicket.id === ticketId) {
            setSelectedTicket(json.data);
          }
        }
      }
      showToast('Work order marked Completed');
      fetchData(true);
    } catch (err) {
      console.error(err);
      fetchData(true);
    }
  };

  // 1. Initial Session Verification Splash
  if (isVerifyingSession) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-800 space-y-4 select-none">
        <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/30">
          <Cpu className="w-6 h-6 text-white" />
        </div>
        <div className="flex items-center space-x-2 text-xs font-mono text-slate-500">
          <div className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <span>Verifying Terminal Security...</span>
        </div>
      </div>
    );
  }

  // 2. Strict Entry Gate: Unauthenticated users MUST log in first
  if (!currentUser) {
    return (
      <LoginPage
        onLoginSuccess={(user, targetView) => {
          setCurrentUser(user);
          if (user.role === 'ADMIN' && targetView === 'admin') {
            setCurrentTab('admin');
          } else {
            setCurrentTab('repairs');
          }
          showToast(`Welcome back, ${user.name}`);
          fetchData(true);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col font-sans">
      {/* Top Loading Progress Line */}
      {isLoading && (
        <div className="fixed top-0 left-0 right-0 h-0.5 bg-indigo-600 z-50 animate-pulse" />
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-20 md:bottom-6 right-4 sm:right-6 z-50 bg-white text-slate-900 px-4 py-2.5 rounded-xl shadow-xl border border-slate-200 flex items-center gap-2 text-xs font-semibold animate-in slide-in-from-bottom-5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Sticky Top Header with God Mode Search */}
      <Header
        currentTab={currentTab}
        viewMode={viewMode}
        setViewMode={setViewMode}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        openCreateModal={() => setIsCreateModalOpen(true)}
        tickets={tickets}
        onSelectTicket={handleSelectTicket}
        currentUser={currentUser}
        onLogout={handleLogout}
        onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
      />

      {/* Main Layout Area */}
      <div className="flex flex-1">
        {/* Left Sidebar */}
        <div className="hidden md:block">
          <Sidebar
            currentTab={currentTab}
            setCurrentTab={setCurrentTab}
            stats={stats}
            currentUser={currentUser}
            onOpenAdminLogin={() => setIsAdminLoginModalOpen(true)}
            onLogout={handleLogout}
            openCreateModal={() => setIsCreateModalOpen(true)}
          />
        </div>

        {/* Dynamic Content Workspace */}
        <main className="flex-1 p-3 sm:p-5 md:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-5 pb-24 md:pb-8 min-w-0 overflow-x-hidden">
          {/* 1. Primary Tab: Repairs Queue */}
          {currentTab === 'repairs' && (
            <div className="space-y-5">
              {/* Quick KPI Overview */}
              <MetricCards stats={stats} />

              {/* Main Ticket Queue Table */}
              <TicketTable
                tickets={tickets}
                totalTicketsCount={stats?.totalActive ? stats.totalActive + (stats.completed || 0) : tickets.length}
                activeFilter={activeFilter}
                setActiveFilter={setActiveFilter}
                viewMode={viewMode}
                currentUser={currentUser}
                onSelectTicket={handleSelectTicket}
                onUpdateStatus={handleUpdateStatus}
                onQuickComplete={handleQuickComplete}
                onOpenSmsModal={(t) => setSmsTicket(t)}
                onPrintTicket={(t) => setPrintTicket(t)}
                onDeleteTicket={handleDeleteTicket}
              />
            </div>
          )}

          {/* 2. Customers CRM Directory */}
          {currentTab === 'customers' && (
            <CustomersView
              customers={customers}
              tickets={tickets}
              onOpenCreateWithCustomer={(_c) => {
                setIsCreateModalOpen(true);
              }}
              onSelectTicket={handleSelectTicket}
              onPrintTicket={(t) => setPrintTicket(t)}
              onOpenSmsModal={(t) => setSmsTicket(t)}
            />
          )}

          {/* 3. Parts Inventory & Stock Adjuster */}
          {currentTab === 'inventory' && (
            <InventoryView />
          )}

          {/* 4. Analytics & Reports */}
          {currentTab === 'analytics' && (
            <AnalyticsView tickets={tickets} stats={stats} />
          )}

          {/* 5. Shop Settings */}
          {currentTab === 'settings' && (
            <SettingsView
              currentUser={currentUser}
              onSettingsUpdated={() => fetchData(true)}
              onUserUpdated={(u) => setCurrentUser(u)}
              onOpenAdminConsole={() => {
                if (currentUser?.role === 'ADMIN') {
                  setCurrentTab('admin');
                } else {
                  setIsAdminLoginModalOpen(true);
                }
              }}
              onLogout={handleLogout}
            />
          )}

          {/* 6. Admin Console / Dashboard (Server-Gated: Admin only) */}
          {currentTab === 'admin' && (
            currentUser?.role === 'ADMIN' ? (
              <AdminDashboard
                currentUser={currentUser}
                onLogout={handleLogout}
                onNavigateToTab={(t) => setCurrentTab(t as any)}
              />
            ) : (
              <div className="bg-white p-12 rounded-2xl border border-slate-200 shadow-sm text-center max-w-lg mx-auto space-y-4 my-8">
                <div className="w-14 h-14 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto shadow-inner">
                  <ShieldAlert className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-lg font-extrabold text-slate-900">Restricted Administrator Area</h2>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    You must be authenticated as an authorized system administrator to access user management, audit logs, and system controls.
                  </p>
                </div>
                <button
                  onClick={() => setIsAdminLoginModalOpen(true)}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-bold transition shadow-md shadow-indigo-600/25 inline-flex items-center space-x-2 cursor-pointer"
                >
                  <Lock className="w-4 h-4" />
                  <span>Administrator Authentication</span>
                </button>
              </div>
            )
          )}
        </main>
      </div>

      {/* Mobile Navigation Drawer */}
      <MobileDrawer
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        stats={stats}
        currentUser={currentUser}
        onLogout={handleLogout}
        openCreateModal={() => setIsCreateModalOpen(true)}
      />

      {/* Mobile Fixed Bottom Navigation Bar */}
      <MobileBottomNav
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        openCreateModal={() => setIsCreateModalOpen(true)}
        openMobileMenu={() => setIsMobileMenuOpen(true)}
        stats={stats}
      />

      {/* ========================================================
          FULL-SCREEN WORK ORDER DETAIL SCREEN
         ======================================================== */}
      {selectedTicket && (
        <WorkOrderScreen
          ticket={selectedTicket}
          currentUser={currentUser}
          onClose={() => {
            setSelectedTicket(null);
            fetchData(true);
          }}
          onUpdateStatus={handleUpdateStatus}
          onRefresh={() => {
            if (selectedTicket) handleSelectTicket(selectedTicket);
          }}
          onTicketUpdated={(updated) => {
            setSelectedTicket(updated);
            setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
            fetchData(true);
          }}
          onPrint={(t) => {
            setPrintTicket(t);
          }}
          onDeleteTicket={handleDeleteTicket}
        />
      )}

      {/* Modals */}
      <CreateTicketModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={(createdTicket) => {
          if (createdTicket) {
            setTickets((prev) => [createdTicket, ...prev.filter((t) => t.id !== createdTicket.id)]);
            setSelectedTicket(createdTicket);
          }
          showToast(`Work order #${createdTicket?.ticketNumber || ''} created successfully`);
          fetchData(true);
        }}
        existingCustomers={customers}
      />

      <SendSmsModal
        ticket={smsTicket}
        onClose={() => setSmsTicket(null)}
        onSuccess={() => {
          showToast('Customer SMS alert dispatched.');
          fetchData(true);
        }}
      />

      <PrintTicketModal
        ticket={printTicket}
        onClose={() => setPrintTicket(null)}
      />

      <AdminLoginModal
        isOpen={isAdminLoginModalOpen}
        onClose={() => setIsAdminLoginModalOpen(false)}
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          showToast(`Authenticated as ${user.name}`);
          if (user.role === 'ADMIN') {
            setCurrentTab('admin');
          }
        }}
      />
    </div>
  );
}

export default App;
