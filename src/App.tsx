import React, { useState, useEffect } from 'react';
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
import { Ticket, Customer, DashboardStats } from './types';
import { RefreshCw, SlidersHorizontal, CheckCircle2 } from 'lucide-react';
import { posAudio } from './utils/audio';

export function App() {
  const [currentTab, setCurrentTab] = useState<'dashboard' | 'dataview' | 'analytics' | 'customers' | 'inventory' | 'settings'>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [selectedBench, setSelectedBench] = useState('ALL');

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

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (activeFilter !== 'ALL') params.set('status', activeFilter);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (selectedBench !== 'ALL') params.set('bench', selectedBench);

      const [ticketsRes, statsRes, customersRes] = await Promise.all([
        fetch(`/api/tickets?${params.toString()}`),
        fetch(`/api/stats?${selectedBench !== 'ALL' ? `bench=${selectedBench}` : ''}`),
        fetch('/api/customers'),
      ]);

      if (ticketsRes.ok) {
        const data = await ticketsRes.json();
        setTickets(data.data || []);
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
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeFilter, searchQuery, selectedBench]);

  const handleSelectTicket = async (t: Ticket) => {
    try {
      setSelectedTicket(t);
      const res = await fetch(`/api/tickets/${t.id}`);
      if (res.ok) {
        const full = await res.json();
        setSelectedTicket(full.data);
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

      showToast(`Work order status updated to ${newStatus}`);
      fetchData();
    } catch (err) {
      console.error(err);
      fetchData();
    }
  };

  const handleQuickComplete = async (ticketId: string) => {
    try {
      posAudio.playSuccessChime();

      setTickets((prev) =>
        prev.map((t) => (t.id === ticketId ? { ...t, status: 'COMPLETED' } : t))
      );

      const res = await fetch(`/api/tickets/${ticketId}/quick-complete`, {
        method: 'POST',
      });

      if (!res.ok) throw new Error('Failed to quick-complete ticket');

      showToast('Work order marked completed & QA verified!');
      fetchData();
    } catch (err) {
      console.error(err);
      fetchData();
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 flex flex-col font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-in slide-in-from-bottom-5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Sticky Top Header */}
      <Header
        currentTab={currentTab as any}
        setCurrentTab={setCurrentTab as any}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        selectedBench={selectedBench}
        setSelectedBench={setSelectedBench}
        openCreateModal={() => setIsCreateModalOpen(true)}
      />

      {/* Main Layout Area */}
      <div className="flex flex-1">
        {/* Left Sidebar */}
        <div className="hidden md:block">
          <Sidebar
            currentTab={currentTab}
            setCurrentTab={setCurrentTab}
            stats={stats}
            openCreateModal={() => setIsCreateModalOpen(true)}
          />
        </div>

        {/* Dynamic Content Workspace */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
          {/* Top Metric Cards */}
          {(currentTab === 'dashboard' || currentTab === 'dataview') && (
            <MetricCards stats={stats} />
          )}

          {/* Tab Views */}
          {currentTab === 'dashboard' && (
            <div className="space-y-4">
              <TicketTable
                tickets={tickets}
                totalTicketsCount={stats?.totalActive ? stats.totalActive + (stats.completed || 0) : tickets.length}
                activeFilter={activeFilter}
                setActiveFilter={setActiveFilter}
                onSelectTicket={handleSelectTicket}
                onUpdateStatus={handleUpdateStatus}
                onQuickComplete={handleQuickComplete}
                onOpenSmsModal={(t) => setSmsTicket(t)}
                onPrintTicket={(t) => setPrintTicket(t)}
              />
            </div>
          )}

          {currentTab === 'dataview' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Live Repair Grid (Data View)</h2>
                  <p className="text-xs text-slate-500">Unfiltered dense tabular layout with raw column views</p>
                </div>
                <button
                  onClick={fetchData}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  Sync Grid
                </button>
              </div>

              <TicketTable
                tickets={tickets}
                totalTicketsCount={tickets.length}
                activeFilter={activeFilter}
                setActiveFilter={setActiveFilter}
                onSelectTicket={handleSelectTicket}
                onUpdateStatus={handleUpdateStatus}
                onQuickComplete={handleQuickComplete}
                onOpenSmsModal={(t) => setSmsTicket(t)}
                onPrintTicket={(t) => setPrintTicket(t)}
              />
            </div>
          )}

          {currentTab === 'customers' && (
            <CustomersView
              customers={customers}
              tickets={tickets}
              onOpenCreateWithCustomer={(_c) => {
                setIsCreateModalOpen(true);
              }}
            />
          )}

          {currentTab === 'inventory' && (
            <InventoryView />
          )}

          {currentTab === 'analytics' && (
            <AnalyticsView tickets={tickets} stats={stats} />
          )}

          {currentTab === 'settings' && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4 max-w-2xl">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-indigo-600" />
                ApexFix Workstation Configuration
              </h2>
              <div className="space-y-3 text-xs text-slate-600">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex justify-between items-center">
                  <div>
                    <span className="font-bold text-slate-800 block">Active Workstation Station</span>
                    <span className="text-slate-500">Dundas Terminal Bench #04 (Hardware & Micro-solder)</span>
                  </div>
                  <span className="px-2 py-1 bg-emerald-100 text-emerald-800 rounded font-semibold text-[10px]">
                    Online & Active
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex justify-between items-center">
                  <div>
                    <span className="font-bold text-slate-800 block">Database Engine</span>
                    <span className="text-slate-500">Relational SQLite v2 (dev.db via Prisma ORM)</span>
                  </div>
                  <span className="px-2 py-1 bg-indigo-100 text-indigo-800 rounded font-semibold text-[10px]">
                    ACID Compliant
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex justify-between items-center">
                  <div>
                    <span className="font-bold text-slate-800 block">Default Shop Hourly Rate</span>
                    <span className="text-slate-500">Standard diagnostic & soldering labor rate</span>
                  </div>
                  <span className="font-mono font-bold text-indigo-600 text-sm">$85.00 / hr</span>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex justify-between items-center">
                  <div>
                    <span className="font-bold text-slate-800 block">Audio & Haptic Feedback</span>
                    <span className="text-slate-500">Native Web Audio POS chimes & scan beeps</span>
                  </div>
                  <span className="px-2 py-1 bg-emerald-100 text-emerald-800 rounded font-semibold text-[10px]">
                    Enabled
                  </span>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ========================================================
          FULL-SCREEN WORK ORDER DETAIL SCREEN
         ======================================================== */}
      {selectedTicket && (
        <WorkOrderScreen
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
          onUpdateStatus={handleUpdateStatus}
          onRefresh={() => handleSelectTicket(selectedTicket)}
          onPrint={(t) => {
            setPrintTicket(t);
          }}
        />
      )}

      {/* Modals */}
      <CreateTicketModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={fetchData}
        existingCustomers={customers}
      />

      <SendSmsModal
        ticket={smsTicket}
        onClose={() => setSmsTicket(null)}
        onSuccess={() => {
          showToast('Customer SMS alert dispatched.');
          fetchData();
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
