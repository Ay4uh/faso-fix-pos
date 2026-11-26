import { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { MetricCards } from './components/MetricCards';
import { TicketTable, PaginationMeta } from './components/TicketTable';
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
import { TimeClockModal } from './components/TimeClockModal';
import { useBarcodeScanner } from './hooks/useBarcodeScanner';
import { Ticket, Customer, DashboardStats, User } from './types';
import { CheckCircle2, ShieldAlert, Lock, Cpu } from 'lucide-react';
import { posAudio } from './utils/audio';
import {
  clearSessionState,
  fetchWithAuth,
  getSessionEpoch,
  hasActiveSession,
  isSessionExpired,
  markSessionActive,
} from './utils/auth';

const getInitialUser = (): User | null => {
  try {
    const raw = localStorage.getItem('apexfix_cached_user');
    if (raw && hasActiveSession()) {
      return JSON.parse(raw);
    }
    if (isSessionExpired() && getSessionEpoch()) {
      clearSessionState();
    }
  } catch {}
  return null;
};

const getDeletedTicketIds = (): Set<string> => {
  try {
    const raw = localStorage.getItem('apexfix_deleted_ticket_ids');
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return new Set();
};

const getInitialTickets = (): Ticket[] => {
  try {
    localStorage.removeItem('apexfix_cached_tickets');
  } catch {}
  return [];
};

const TAB_IDS = ['repairs', 'customers', 'inventory', 'analytics', 'settings', 'admin'] as const;
type TabId = (typeof TAB_IDS)[number];

const getTabFromLocation = (): TabId => {
  try {
    const hash = window.location.hash.replace(/^#\/?/, '').split('?')[0].toLowerCase();
    if ((TAB_IDS as readonly string[]).includes(hash)) return hash as TabId;
    const path = window.location.pathname.replace(/^\/+/, '').split('/')[0].toLowerCase();
    if ((TAB_IDS as readonly string[]).includes(path)) return path as TabId;
  } catch {}
  return 'repairs';
};

export function App() {
  const [currentTab, setCurrentTab] = useState<TabId>(getTabFromLocation);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [selectedBench] = useState('ALL');

  const [tickets, setTickets] = useState<Ticket[]>(getInitialTickets);
  const [ticketsPage, setTicketsPage] = useState(1);
  const [ticketsPagination, setTicketsPagination] = useState<PaginationMeta | null>(null);
  const deletedTicketIdsRef = useRef<Set<string>>(getDeletedTicketIds());
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersPage, setCustomersPage] = useState(1);
  const [customersSearch, setCustomersSearch] = useState('');
  const [customersPagination, setCustomersPagination] = useState<PaginationMeta | null>(null);
  const [historyRefreshTick, setHistoryRefreshTick] = useState(0);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [shopTaxRateBps, setShopTaxRateBps] = useState(1300);
  const [shopTaxLabel, setShopTaxLabel] = useState('HST');

  // Authentication & Session
  const [currentUser, setCurrentUser] = useState<User | null>(getInitialUser);
  const [isVerifyingSession, setIsVerifyingSession] = useState(!getInitialUser());
  const [isAdminLoginModalOpen, setIsAdminLoginModalOpen] = useState(false);
  const [isTerminalLocked, setIsTerminalLocked] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockCode, setUnlockCode] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);

  // Modals / Screens
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [prefillCustomer, setPrefillCustomer] = useState<Customer | null>(null);
  const [isTimeClockModalOpen, setIsTimeClockModalOpen] = useState(false);
  const [timeClockInitialTab, setTimeClockInitialTab] = useState<'clock' | 'history' | 'schedule' | 'paystubs'>('clock');
  const [adminInitialSection, setAdminInitialSection] = useState<'overview' | 'users' | 'tickets' | 'roles' | 'audit' | 'attendance' | 'payroll' | 'schedule' | 'sales-labor'>('overview');
  const [timeClockStatus, setTimeClockStatus] = useState<any | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const selectedTicketIdRef = useRef<string | null>(null);
  const [printTicket, setPrintTicket] = useState<Ticket | null>(null);
  const [smsTicket, setSmsTicket] = useState<Ticket | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  useEffect(() => {
    const handleExpired = (e: any) => {
      const reason = e?.detail?.reason || 'Your 24-hour session has expired for security. Please sign in again.';
      setCurrentUser(null);
      setSessionExpiredNotice(reason);
      clearSessionState();
    };

    window.addEventListener('session-expired', handleExpired);

    // Periodic check enforcing the strict 24-hour maximum session lifetime
    const timer = setInterval(() => {
      if (getSessionEpoch() && isSessionExpired()) {
        handleExpired({ detail: { reason: 'Your 24-hour session has expired for security. Please log in again.' } });
      }
    }, 30_000);

    return () => {
      window.removeEventListener('session-expired', handleExpired);
      clearInterval(timer);
    };
  }, []);

  useBarcodeScanner({
    enabled: !!currentUser,
    onScanTicket: async (ticketNum) => {
      const num = parseInt(ticketNum.replace(/\D/g, ''), 10);
      const found = tickets.find((t) => (!isNaN(num) && t.ticketNumber === num) || t.id === ticketNum);
      if (found) {
        handleSelectTicket(found);
        showToast(`📦 Scanned Work Order #${found.ticketNumber}`);
        return;
      }
      try {
        const res = await fetchWithAuth(`/api/tickets/${encodeURIComponent(ticketNum)}`);
        if (res.ok) {
          const json = await res.json();
          if (json.data) {
            selectedTicketIdRef.current = json.data.id;
            setSelectedTicket(json.data);
            showToast(`📦 Scanned Work Order #${json.data.ticketNumber}`);
            return;
          }
        }
      } catch {}
      setSearchQuery(ticketNum);
      setCurrentTab('repairs');
      showToast(`🔍 Searching scanned Work Order: ${ticketNum}`);
    },
    onScanItem: (sku) => {
      setSearchQuery(sku);
      showToast(`📦 Scanned Item SKU: ${sku}`);
    },
  });

  // Check auth session on startup (cookie-backed) + sync multi-tab logout
  useEffect(() => {
    const verifySession = async () => {
      try {
        const mountEpoch = getSessionEpoch();
        const res = await fetchWithAuth('/api/auth/me');
        if (getSessionEpoch() !== mountEpoch) return;
        if (res.ok) {
          const json = await res.json();
          if (getSessionEpoch() !== mountEpoch) return;
          if (json.authenticated && json.user) {
            if (!mountEpoch) markSessionActive();
            setCurrentUser(json.user);
            try {
              localStorage.setItem('apexfix_cached_user', JSON.stringify(json.user));
            } catch {}
          } else {
            clearSessionState();
            setCurrentUser(null);
          }
        } else if (res.status === 401 || res.status === 403) {
          clearSessionState();
          setCurrentUser(null);
        }
      } catch (err) {
        console.error('[Session Check Error]', err);
      } finally {
        setIsVerifyingSession(false);
      }
    };
    verifySession();

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'apexfix_session_epoch' && !e.newValue) {
        setCurrentUser(null);
        setSelectedTicket(null);
        setPrintTicket(null);
        setSmsTicket(null);
        setIsAdminLoginModalOpen(false);
        setIsTimeClockModalOpen(false);
        setIsCreateModalOpen(false);
        setIsMobileMenuOpen(false);
        selectedTicketIdRef.current = null;
        setSessionExpiredNotice(null);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const fetchTimeClockStatus = async () => {
    if (!currentUser) return;
    const applyOfflineFallback = () => {
      const localActiveRaw = localStorage.getItem(`apexfix_active_shift_${currentUser.id}`);
      if (localActiveRaw) {
        try {
          const localShift = JSON.parse(localActiveRaw);
          if (localShift?.clockIn) {
            setTimeClockStatus((prev: any) => ({
              ...prev,
              isClockedIn: localShift.status === 'ACTIVE' || localShift.status === 'ON_BREAK',
              clockedIn: localShift.status === 'ACTIVE' || localShift.status === 'ON_BREAK',
              isOnBreak: localShift.status === 'ON_BREAK',
              onBreak: localShift.status === 'ON_BREAK',
              activeShift: localShift,
            }));
          }
        } catch {}
      }
    };

    try {
      const res = await fetchWithAuth('/api/timeclock/status');
      if (res.ok) {
        const json = await res.json();
        const s = json.data;
        const serverClockedIn = Boolean(s?.isClockedIn ?? s?.clockedIn);
        if (serverClockedIn && s?.activeShift) {
          try {
            localStorage.setItem(`apexfix_active_shift_${currentUser.id}`, JSON.stringify(s.activeShift));
          } catch {}
        } else {
          try {
            localStorage.removeItem(`apexfix_active_shift_${currentUser.id}`);
          } catch {}
        }
        setTimeClockStatus(s);
      } else {
        applyOfflineFallback();
      }
    } catch {
      applyOfflineFallback();
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchTimeClockStatus();
      fetchShopTaxConfig();
      const interval = setInterval(fetchTimeClockStatus, 60000);
      return () => clearInterval(interval);
    }
  }, [currentUser]);

  const fetchShopTaxConfig = async () => {
    try {
      const res = await fetchWithAuth('/api/settings');
      if (res.ok) {
        const json = await res.json();
        const s = json.data || json;
        if (typeof s?.taxRateBps === 'number') setShopTaxRateBps(s.taxRateBps);
        if (s?.taxLabel) setShopTaxLabel(s.taxLabel);
      }
    } catch {}
  };

  const handleQuickClockIn = async () => {
    if (!currentUser) return;
    const nowIso = new Date().toISOString();
    const tempShift = {
      id: `shift_${Date.now()}`,
      userId: currentUser.id,
      clockIn: nowIso,
      status: 'ACTIVE',
      breakMinutes: 0,
    };
    try {
      localStorage.setItem(`apexfix_active_shift_${currentUser.id}`, JSON.stringify(tempShift));
    } catch {}
    setTimeClockStatus((prev: any) => ({
      ...prev,
      isClockedIn: true,
      clockedIn: true,
      isOnBreak: false,
      onBreak: false,
      activeShift: tempShift,
    }));
    posAudio.playSuccessChime();
    showToast('⚡ Clocked In! Shift timer running.');

    try {
      const res = await fetchWithAuth('/api/timeclock/clock-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (json.data) {
        localStorage.setItem(`apexfix_active_shift_${currentUser.id}`, JSON.stringify(json.data));
        setTimeClockStatus((prev: any) => ({
          ...prev,
          activeShift: json.data,
        }));
      }
    } catch (err) {
      console.error('[Quick Clock In Error]', err);
    }
  };

  const handleQuickClockOut = async () => {
    if (!currentUser) return;
    const shiftData = timeClockStatus?.activeShift;
    try {
      localStorage.removeItem(`apexfix_active_shift_${currentUser.id}`);
    } catch {}
    setTimeClockStatus((prev: any) => ({
      ...prev,
      isClockedIn: false,
      clockedIn: false,
      isOnBreak: false,
      onBreak: false,
      activeShift: null,
    }));
    posAudio.playCashChime();
    showToast('⏹️ Shift complete! Clocked out successfully.');

    try {
      await fetchWithAuth('/api/timeclock/clock-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shiftData }),
      });
    } catch (err) {
      console.error('[Quick Clock Out Error]', err);
    }
  };

  const handleQuickToggleBreak = async () => {
    if (!currentUser) return;
    const currentlyOnBreak = Boolean(timeClockStatus?.isOnBreak ?? timeClockStatus?.onBreak);
    const targetBreak = !currentlyOnBreak;
    setTimeClockStatus((prev: any) => ({
      ...prev,
      isOnBreak: targetBreak,
      onBreak: targetBreak,
    }));
    try {
      const localRaw = localStorage.getItem(`apexfix_active_shift_${currentUser.id}`);
      if (localRaw) {
        const shift = JSON.parse(localRaw);
        shift.status = targetBreak ? 'ON_BREAK' : 'ACTIVE';
        localStorage.setItem(`apexfix_active_shift_${currentUser.id}`, JSON.stringify(shift));
      }
    } catch {}
    posAudio.playNotificationBeep();
    showToast(targetBreak ? '☕ Unpaid break started.' : '⚡ Welcome back! Shift resumed.');

    try {
      const endpoint = targetBreak ? '/api/timeclock/break-start' : '/api/timeclock/break-end';
      await fetchWithAuth(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: targetBreak ? JSON.stringify({ type: 'UNPAID_MEAL' }) : undefined,
      });
    } catch (err) {
      console.error('[Quick Break Error]', err);
    }
  };

  // Optional shared-counter inactivity auto-lock (from UserPreferences.autoLockMinutes)
  useEffect(() => {
    if (!currentUser || isTerminalLocked) return;
    let mins = 0;
    try {
      const p = JSON.parse(currentUser.preferences || '{}');
      mins = Number(p.autoLockMinutes || 0);
    } catch {}
    if (!mins || mins <= 0) return;

    const timeoutMs = mins * 60_000;
    let timer: ReturnType<typeof setTimeout>;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setUnlockPassword('');
        setUnlockCode('');
        setUnlockError(null);
        setIsTerminalLocked(true);
      }, timeoutMs);
    };

    resetTimer();
    const events = ['mousemove', 'keydown', 'pointerdown', 'touchstart'] as const;
    events.forEach((ev) => window.addEventListener(ev, resetTimer, { passive: true }));
    return () => {
      clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
    };
  }, [currentUser?.id, currentUser?.preferences, isTerminalLocked]);

  // Listen for unauthorized events to kick back to LoginPage immediately
  useEffect(() => {
    const handleUnauthorized = () => {
      setCurrentUser(null);
      localStorage.removeItem('apexfix_cached_user');
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
    // 1. Immediately wipe local UI session markers & cached user data
    clearSessionState();
    localStorage.removeItem('apexfix_cached_tickets');
    sessionStorage.clear();

    // 2. Synchronously clear ALL active user state & open modals to render LoginPage cleanly
    setSessionExpiredNotice(null);
    setIsTerminalLocked(false);
    setUnlockPassword('');
    setUnlockCode('');
    setUnlockError(null);
    setCurrentUser(null);
    setTickets([]);
    setCustomers([]);
    setStats(null);
    setTimeClockStatus(null);
    setSelectedTicket(null);
    selectedTicketIdRef.current = null;
    setPrintTicket(null);
    setSmsTicket(null);
    setIsAdminLoginModalOpen(false);
    setIsTimeClockModalOpen(false);
    setIsCreateModalOpen(false);
    setIsMobileMenuOpen(false);
    setCurrentTab('repairs');

    // Clear URL hash cleanly without leaving #admin or stale tabs behind
    try {
      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname || '/');
      }
    } catch {}

    // 3. Audio & Toast feedback
    posAudio.playBeep();
    showToast('Logged out successfully');

    // 4. Background cookie-authenticated logout request to revoke DB session & clear HttpOnly cookie
    fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'FasoFixPOS',
      },
      keepalive: true,
    }).catch(() => {});
  };

  const handleDeleteTicket = async (ticketId: string) => {
    try {
      // 1. Immediately record deletion locally so it NEVER resurfaces, regardless of serverless cache
      deletedTicketIdsRef.current.add(ticketId);
      try {
        localStorage.setItem(
          'apexfix_deleted_ticket_ids',
          JSON.stringify(Array.from(deletedTicketIdsRef.current))
        );
      } catch {}

      setTickets((prev) => {
        const next = prev.filter((t) => t.id !== ticketId);
        try {
          localStorage.setItem('apexfix_cached_tickets', JSON.stringify(next));
        } catch {}
        return next;
      });

      if (selectedTicketIdRef.current === ticketId || (selectedTicket && selectedTicket.id === ticketId)) {
        selectedTicketIdRef.current = null;
        setSelectedTicket(null);
      }

      // 2. Call server
      const res = await fetchWithAuth(`/api/tickets/${ticketId}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete work order');
      }

      // 3. Sync deleted list with server
      fetchWithAuth('/api/sync/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deletedIds: Array.from(deletedTicketIdsRef.current) }),
      }).catch(() => {});

      posAudio.playSuccessChime();
      showToast('Work order successfully deleted');
      setHistoryRefreshTick((n) => n + 1);
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
        selectedTicketIdRef.current = null;
        if (selectedTicket) setSelectedTicket(null);
        if (printTicket) setPrintTicket(null);
        if (smsTicket) setSmsTicket(null);
        if (isCreateModalOpen) setIsCreateModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTicket, printTicket, smsTicket, isCreateModalOpen]);

  const handleNavigateNotification = (linkTab: string) => {
    if (linkTab.startsWith('repairs:')) {
      const ticketId = linkTab.split(':')[1];
      setCurrentTab('repairs');
      if (ticketId) {
        fetchWithAuth(`/api/tickets/${ticketId}`)
          .then((r) => r.json())
          .then((json) => {
            if (json.data) {
              selectedTicketIdRef.current = json.data.id;
              setSelectedTicket(json.data);
            }
          })
          .catch(() => {});
      }
    } else if (linkTab === 'repairs') {
      setCurrentTab('repairs');
    } else if (linkTab === 'timeclock:schedule') {
      setTimeClockInitialTab('schedule');
      setIsTimeClockModalOpen(true);
    } else if (linkTab === 'timeclock:paystubs') {
      setTimeClockInitialTab('paystubs');
      setIsTimeClockModalOpen(true);
    } else if (linkTab === 'timeclock:clock') {
      setTimeClockInitialTab('clock');
      setIsTimeClockModalOpen(true);
    } else if (linkTab.startsWith('admin:') && currentUser?.role === 'ADMIN') {
      const section = linkTab.split(':')[1] as any;
      if (section) setAdminInitialSection(section);
      setCurrentTab('admin');
    }
  };

  useEffect(() => {
    setTicketsPage(1);
  }, [searchQuery, selectedBench]);

  const fetchData = async (silent = false) => {
    const reqEpoch = getSessionEpoch();
    if (!reqEpoch) {
      if (!silent) setIsLoading(false);
      return;
    }
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
      params.set('page', String(ticketsPage));
      params.set('pageSize', '25');

      const custParams = new URLSearchParams();
      custParams.set('page', String(customersPage));
      custParams.set('pageSize', '25');
      if (customersSearch.trim()) custParams.set('search', customersSearch.trim());

      const needTickets = !silent || currentTab === 'repairs';
      const needStats = !silent || currentTab === 'repairs' || currentTab === 'analytics';
      const needCustomers = (!silent && customers.length === 0) || currentTab === 'customers';

      const [ticketsRes, statsRes, customersRes] = await Promise.all([
        needTickets ? fetchWithAuth(`/api/tickets?${params.toString()}`) : Promise.resolve(null),
        needStats ? fetchWithAuth(`/api/stats?${selectedBench !== 'ALL' ? `bench=${selectedBench}` : ''}`) : Promise.resolve(null),
        needCustomers ? fetchWithAuth(`/api/customers?${custParams.toString()}`) : Promise.resolve(null),
      ]);

      // Guard against stale response resolving after logout or re-login
      if (getSessionEpoch() !== reqEpoch) return;

      if (ticketsRes?.ok) {
        const data = await ticketsRes.json();
        const serverList: Ticket[] = data.data || [];
        const deletedIds = deletedTicketIdsRef.current;

        const cleanServerList = serverList.filter((t) => !deletedIds.has(t.id));

        setTickets(cleanServerList);
        if (data.total !== undefined) {
          setTicketsPagination({
            page: data.page || ticketsPage,
            pageSize: data.pageSize || 25,
            total: data.total,
            totalPages: data.totalPages || 1,
            hasMore: Boolean(data.hasMore),
          });
        }
        try {
          localStorage.setItem('apexfix_cached_tickets', JSON.stringify(cleanServerList));
        } catch {}

        if (selectedTicketIdRef.current) {
          const currentId = selectedTicketIdRef.current;
          const matched = cleanServerList.find((t) => t.id === currentId);
          if (matched && selectedTicketIdRef.current === currentId) {
            setSelectedTicket((curr) => {
              if (!curr || curr.id !== currentId) return null;
              const merged = {
                ...curr,
                ...matched,
                events:
                  curr.events && curr.events.length > (matched.events?.length || 0)
                    ? curr.events
                    : matched.events ?? curr.events,
                otherTickets: matched.otherTickets ?? curr.otherTickets,
              };
              return JSON.stringify(merged) !== JSON.stringify(curr) ? merged : curr;
            });
          }
        }
      }

      if (statsRes?.ok) {
        const sData = await statsRes.json();
        setStats(sData.data || null);
      }

      if (customersRes?.ok) {
        const cData = await customersRes.json();
        setCustomers(cData.data || []);
        if (cData.total !== undefined) {
          setCustomersPagination({
            page: cData.page || customersPage,
            pageSize: cData.pageSize || 25,
            total: cData.total,
            totalPages: cData.totalPages || 1,
            hasMore: Boolean(cData.hasMore),
          });
        }
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  const fetchDataRef = useRef(fetchData);
  fetchDataRef.current = fetchData;

  useEffect(() => {
    if (!currentUser) {
      setIsLoading(false);
      return;
    }
    fetchData();
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      fetchDataRef.current(true);
    }, 20000);
    return () => clearInterval(interval);
  }, [currentUser?.id, currentTab, activeFilter, searchQuery, selectedBench, selectedTicket?.id, ticketsPage, customersPage, customersSearch]);

  // Sync active tab with URL hash so refresh, deep URLs (/admin, #customers), and Back/Forward buttons work reliably
  useEffect(() => {
    const onNav = () => setCurrentTab(getTabFromLocation());
    window.addEventListener('hashchange', onNav);
    window.addEventListener('popstate', onNav);
    return () => {
      window.removeEventListener('hashchange', onNav);
      window.removeEventListener('popstate', onNav);
    };
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    try {
      const targetHash = `#${currentTab}`;
      if (window.location.hash !== targetHash) {
        window.location.hash = targetHash;
      }
    } catch {}
  }, [currentTab, currentUser]);

  // Real-time live updates via Server-Sent Events (SSE)
  // Only connect on localhost with an active cookie session. On Vercel serverless, SSE holds lambdas open and forces multi-container divergence.
  useEffect(() => {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isLocal || !currentUser || !hasActiveSession()) return;

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
              const next = [newTicket, ...prev];
              try {
                localStorage.setItem('apexfix_cached_tickets', JSON.stringify(next));
              } catch {}
              return next;
            });
            setHistoryRefreshTick((n) => n + 1);
            fetchDataRef.current(true);
          } catch {}
        });

        es.addEventListener('ticket_updated', (e) => {
          try {
            const updated: Ticket = JSON.parse(e.data);
            setTickets((prev) => {
              const next = prev.map((t) => (t.id === updated.id ? updated : t));
              try {
                localStorage.setItem('apexfix_cached_tickets', JSON.stringify(next));
              } catch {}
              return next;
            });
            setSelectedTicket((curr) =>
              curr && curr.id === updated.id
                ? {
                    ...curr,
                    ...updated,
                    events: updated.events ?? curr.events,
                    otherTickets: updated.otherTickets ?? curr.otherTickets,
                  }
                : curr
            );
            setHistoryRefreshTick((n) => n + 1);
            fetchDataRef.current(true);
          } catch {}
        });

        es.addEventListener('ticket_deleted', (e) => {
          try {
            const { id } = JSON.parse(e.data);
            deletedTicketIdsRef.current.add(id);
            try {
              localStorage.setItem('apexfix_deleted_ticket_ids', JSON.stringify(Array.from(deletedTicketIdsRef.current)));
            } catch {}
            setTickets((prev) => {
              const next = prev.filter((t) => t.id !== id);
              try {
                localStorage.setItem('apexfix_cached_tickets', JSON.stringify(next));
              } catch {}
              return next;
            });
            setSelectedTicket((curr) => (curr && curr.id === id ? null : curr));
            setHistoryRefreshTick((n) => n + 1);
            fetchDataRef.current(true);
          } catch {}
        });

        es.addEventListener('customer_updated', () => {
          setHistoryRefreshTick((n) => n + 1);
          fetchDataRef.current(true);
        });

        es.addEventListener('inventory_updated', () => {
          fetchDataRef.current(true);
        });

        es.addEventListener('settings_updated', () => {
          fetchDataRef.current(true);
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
  }, [currentUser?.id]);

  useEffect(() => {
    const handleFocus = () => fetchDataRef.current(true);
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const handleSelectTicket = async (t: Ticket) => {
    try {
      selectedTicketIdRef.current = t.id;
      setSelectedTicket(t);
      const res = await fetchWithAuth(`/api/tickets/${t.id}`);
      if (res.ok) {
        const full = await res.json();
        if (full.data && selectedTicketIdRef.current === t.id) {
          setSelectedTicket(full.data);
        }
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
      setHistoryRefreshTick((n) => n + 1);
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
      setHistoryRefreshTick((n) => n + 1);
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
        <div className="flex items-center space-x-2 text-xs text-slate-500 font-medium">
          <div className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <span>Loading Faso Fix POS...</span>
        </div>
      </div>
    );
  }

  // 2. Strict Entry Gate: Unauthenticated users MUST log in first
  if (!currentUser) {
    return (
      <LoginPage
        sessionExpiredNotice={sessionExpiredNotice}
        onLoginSuccess={(user) => {
          setSessionExpiredNotice(null);
          setCurrentUser(user);
          try {
            localStorage.setItem('apexfix_cached_user', JSON.stringify(user));
          } catch {}
          // Always direct straight to the main Dashboard upon login
          setCurrentTab('repairs');
          try {
            window.location.hash = '#repairs';
          } catch {}
          showToast(`Welcome back, ${user.name}`);
        }}
      />
    );
  }

  // 2.5 Shared-Counter Screen Lock Overlay (unmounts POS workspace DOM while locked)
  if (isTerminalLocked) {
    const handleUnlockSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsUnlocking(true);
      setUnlockError(null);
      try {
        const res = await fetchWithAuth('/api/auth/verify-unlock', {
          method: 'POST',
          body: JSON.stringify({
            password: unlockPassword,
            ...(currentUser.twoFactorEnabled ? { code: unlockCode.trim() } : {}),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Verification failed');
        posAudio.playSuccessChime();
        setUnlockPassword('');
        setUnlockCode('');
        setIsTerminalLocked(false);
      } catch (err: any) {
        setUnlockError(err.message || 'Could not unlock terminal');
        posAudio.playWarningBeep();
      } finally {
        setIsUnlocking(false);
      }
    };

    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 text-slate-800 ui-backdrop">
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden ui-modal">
          <div className="bg-slate-50 px-6 py-5 border-b border-slate-200 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-slate-900">Terminal Locked</h2>
              <p className="text-xs text-slate-500">
                Active session: <strong className="text-slate-700">{currentUser.name}</strong>
              </p>
            </div>
          </div>

          <form onSubmit={handleUnlockSubmit} className="p-6 space-y-4">
            {unlockError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium ui-shake">
                {unlockError}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Account Password</label>
              <input
                type="password"
                required
                autoFocus
                value={unlockPassword}
                onChange={(e) => setUnlockPassword(e.target.value)}
                placeholder="Enter password to unlock"
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono transition-colors"
              />
            </div>

            {currentUser.twoFactorEnabled && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Authenticator Code</label>
                <input
                  type="text"
                  required
                  value={unlockCode}
                  onChange={(e) => setUnlockCode(e.target.value)}
                  placeholder="6-digit TOTP or recovery code"
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono transition-colors"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={isUnlocking}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm ui-press ui-btn-glow cursor-pointer disabled:opacity-50"
            >
              {isUnlocking ? 'Unlocking...' : 'Unlock Counter Terminal'}
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="w-full py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold ui-press cursor-pointer"
            >
              Sign Out / Switch User
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col font-sans overflow-x-clip">
      {/* Top Loading Progress Line */}
      {isLoading && (
        <div className="fixed top-0 left-0 right-0 h-1 bg-indigo-100/80 z-50 overflow-hidden pointer-events-none">
          <div className="h-full w-2/5 bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-600 rounded-full ui-progress-indeterminate" />
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div
          key={toastMessage}
          className="fixed bottom-20 md:bottom-6 left-4 right-4 sm:left-auto sm:right-6 z-50 bg-white text-slate-900 px-4 py-2.5 rounded-2xl shadow-xl border border-slate-200 flex items-center gap-2 text-xs font-semibold overflow-hidden ui-toast"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 ui-pop" />
          <span className="truncate">{toastMessage}</span>
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500/80 ui-toast-bar" />
        </div>
      )}

      {/* Sticky Top Header with God Mode Search */}
      <Header
        currentTab={currentTab}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        openCreateModal={() => setIsCreateModalOpen(true)}
        tickets={tickets}
        onSelectTicket={handleSelectTicket}
        currentUser={currentUser}
        onLogout={handleLogout}
        onLockTerminal={() => {
          setUnlockPassword('');
          setUnlockCode('');
          setUnlockError(null);
          setIsTerminalLocked(true);
        }}
        onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
        onOpenTimeClock={() => {
          setTimeClockInitialTab('clock');
          setIsTimeClockModalOpen(true);
        }}
        isClockedIn={Boolean(timeClockStatus?.isClockedIn ?? timeClockStatus?.clockedIn)}
        isOnBreak={Boolean(timeClockStatus?.isOnBreak ?? timeClockStatus?.onBreak)}
        clockInTime={timeClockStatus?.activeShift?.clockIn}
        breakMinutes={timeClockStatus?.activeShift?.breakMinutes || 0}
        onQuickClockIn={handleQuickClockIn}
        onQuickClockOut={handleQuickClockOut}
        onQuickToggleBreak={handleQuickToggleBreak}
        onNavigateNotification={handleNavigateNotification}
      />

      {/* Main Layout Area */}
      <div className="flex flex-1">
        {/* Left Sidebar */}
        <div className="hidden md:block shrink-0">
          <Sidebar
            currentTab={currentTab}
            setCurrentTab={setCurrentTab}
            stats={stats}
            currentUser={currentUser}
            onOpenAdminLogin={() => setIsAdminLoginModalOpen(true)}
            onLogout={handleLogout}
            onUserUpdated={(u) => {
              setCurrentUser(u);
              try {
                localStorage.setItem('apexfix_cached_user', JSON.stringify(u));
              } catch {}
              showToast('✨ Profile updated');
            }}
          />
        </div>

        {/* Dynamic Content Workspace */}
        <main className="flex-1 p-3 sm:p-5 md:p-6 lg:p-8 max-w-[1720px] mx-auto w-full space-y-5 pb-24 md:pb-8 min-w-0 overflow-x-hidden">
          <div key={currentTab} className="ui-view-enter">
          {/* 1. Primary Tab: Repairs Queue */}
          {currentTab === 'repairs' && (
            <div className="space-y-5">
              {/* Quick KPI Overview */}
              <MetricCards
                stats={stats}
                tickets={tickets}
                onSelectFilter={(f) => {
                  setTicketsPage(1);
                  setActiveFilter(f);
                }}
              />

              {/* Main Ticket Queue Table */}
              <TicketTable
                tickets={tickets}
                totalTicketsCount={ticketsPagination?.total ?? tickets.length}
                stats={stats}
                activeFilter={activeFilter}
                setActiveFilter={(f) => {
                  setTicketsPage(1);
                  setActiveFilter(f);
                }}
                currentUser={currentUser}
                onSelectTicket={handleSelectTicket}
                onUpdateStatus={handleUpdateStatus}
                onQuickComplete={handleQuickComplete}
                onOpenSmsModal={(t) => setSmsTicket(t)}
                onPrintTicket={(t) => setPrintTicket(t)}
                onDeleteTicket={handleDeleteTicket}
                pagination={ticketsPagination}
                onPageChange={(p) => setTicketsPage(p)}
              />
            </div>
          )}

          {/* 2. Customers CRM Directory */}
          {currentTab === 'customers' && (
            <CustomersView
              customers={customers}
              tickets={tickets}
              onOpenCreateWithCustomer={(c) => {
                setPrefillCustomer(c);
                setIsCreateModalOpen(true);
              }}
              onSelectTicket={handleSelectTicket}
              onPrintTicket={(t) => setPrintTicket(t)}
              onOpenSmsModal={(t) => setSmsTicket(t)}
              pagination={customersPagination}
              onPageChange={(p) => setCustomersPage(p)}
              searchQuery={customersSearch}
              onSearchChange={(q) => {
                setCustomersSearch(q);
                setCustomersPage(1);
              }}
              refreshKey={historyRefreshTick}
              onCustomerUpdated={() => {
                setHistoryRefreshTick((n) => n + 1);
                fetchData(true);
              }}
            />
          )}

          {/* 3. Parts Inventory & Stock Adjuster */}
          {currentTab === 'inventory' && (
            <InventoryView />
          )}

          {/* 4. Analytics & Reports */}
          {currentTab === 'analytics' && (
            <AnalyticsView tickets={tickets} stats={stats} refreshKey={historyRefreshTick} />
          )}

          {/* 5. Shop Settings */}
          {currentTab === 'settings' && (
            <SettingsView
              currentUser={currentUser}
              onSettingsUpdated={() => {
                fetchShopTaxConfig();
                fetchData(true);
              }}
              onUserUpdated={(u) => {
                setCurrentUser(u);
                try {
                  localStorage.setItem('apexfix_cached_user', JSON.stringify(u));
                } catch {}
              }}
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
                initialSection={adminInitialSection}
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
          </div>
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
        onOpenTimeClock={() => setIsTimeClockModalOpen(true)}
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
            selectedTicketIdRef.current = null;
            setSelectedTicket(null);
            fetchData(true);
          }}
          onUpdateStatus={handleUpdateStatus}
          onRefresh={() => {
            if (selectedTicketIdRef.current) {
              const currentId = selectedTicketIdRef.current;
              fetchWithAuth(`/api/tickets/${currentId}`)
                .then((r) => r.json())
                .then((j) => {
                  if (j.data && selectedTicketIdRef.current === currentId) {
                    setSelectedTicket(j.data);
                  }
                })
                .catch(() => {});
            }
          }}
          onTicketUpdated={(updated) => {
            if (selectedTicketIdRef.current === updated.id) {
              setSelectedTicket(updated);
            }
            setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
            setHistoryRefreshTick((n) => n + 1);
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
        onClose={() => {
          setIsCreateModalOpen(false);
          setPrefillCustomer(null);
        }}
        initialCustomer={prefillCustomer}
        onSuccess={(createdTicket) => {
          if (createdTicket) {
            setTickets((prev) => {
              const next = [createdTicket, ...prev.filter((t) => t.id !== createdTicket.id)];
              try {
                localStorage.setItem('apexfix_cached_tickets', JSON.stringify(next));
              } catch {}
              return next;
            });
            selectedTicketIdRef.current = createdTicket.id;
            setSelectedTicket(createdTicket);
          }
          showToast(`Work order #${createdTicket?.ticketNumber || ''} created successfully`);
          setHistoryRefreshTick((n) => n + 1);
          fetchData(true);
        }}
        existingCustomers={customers}
        shopTaxRateBps={shopTaxRateBps}
        shopTaxLabel={shopTaxLabel}
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

      <TimeClockModal
        isOpen={isTimeClockModalOpen}
        onClose={() => setIsTimeClockModalOpen(false)}
        currentUser={currentUser}
        onStatusChange={fetchTimeClockStatus}
        initialTab={timeClockInitialTab}
      />

      <AdminLoginModal
        isOpen={isAdminLoginModalOpen}
        onClose={() => setIsAdminLoginModalOpen(false)}
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          try {
            localStorage.setItem('apexfix_cached_user', JSON.stringify(user));
          } catch {}
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
