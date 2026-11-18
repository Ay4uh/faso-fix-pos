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
import { Ticket, Customer, DashboardStats } from './types';
import { CheckCircle2 } from 'lucide-react';
import { posAudio } from './utils/audio';

export function App() {
  const [currentTab, setCurrentTab] = useState<'repairs' | 'customers' | 'inventory' | 'analytics' | 'settings'>('repairs');
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [selectedBench] = useState('ALL');

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Modals / Screens
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [printTicket, setPrintTicket] = useState<Ticket | null>(null);
  const [smsTicket, setSmsTicket] = useState<Ticket | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
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
        fetch(`/api/tickets?${params.toString()}`),
        fetch(`/api/stats?${selectedBench !== 'ALL' ? `bench=${selectedBench}` : ''}`),
        fetch('/api/customers'),
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
    }, 2500);
    return () => clearInterval(interval);
  }, [activeFilter, searchQuery, selectedBench, selectedTicket?.id]);

  useEffect(() => {
    const handleFocus = () => fetchData(true);
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const handleSelectTicket = async (t: Ticket) => {
    try {
      setSelectedTicket(t);
      const res = await fetch(`/api/tickets/${t.id}`);
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

      const res = await fetch(`/api/tickets/${ticketId}`, {
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

      const res = await fetch(`/api/tickets/${ticketId}/quick-complete`, {
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

  return (
    <div className="min-h-screen bg-[#F4F5F7] text-slate-800 flex flex-col font-sans">
      {/* Top Loading Progress Line */}
      {isLoading && (
        <div className="fixed top-0 left-0 right-0 h-0.5 bg-indigo-600 z-50 animate-pulse" />
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-in slide-in-from-bottom-5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
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
      />

      {/* Main Layout Area */}
      <div className="flex flex-1">
        {/* Left Sidebar */}
        <div className="hidden md:block">
          <Sidebar
            currentTab={currentTab}
            setCurrentTab={setCurrentTab}
            stats={stats}
            selectedBench={selectedBench}
            openCreateModal={() => setIsCreateModalOpen(true)}
          />
        </div>

        {/* Dynamic Content Workspace */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-5">
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
                onSelectTicket={handleSelectTicket}
                onUpdateStatus={handleUpdateStatus}
                onQuickComplete={handleQuickComplete}
                onOpenSmsModal={(t) => setSmsTicket(t)}
                onPrintTicket={(t) => setPrintTicket(t)}
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
            <SettingsView onSettingsUpdated={() => fetchData(true)} />
          )}
        </main>
      </div>

      {/* ========================================================
          FULL-SCREEN WORK ORDER DETAIL SCREEN
         ======================================================== */}
      {selectedTicket && (
        <WorkOrderScreen
          ticket={selectedTicket}
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
        />
      )}

      {/* Modals */}
      <CreateTicketModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => fetchData(true)}
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
    </div>
  );
}

export default App;
