import React, { useEffect, useRef } from 'react';
import { Search, Plus, Wrench, Download, Cpu, Command } from 'lucide-react';
import { posAudio } from '../utils/audio';

interface HeaderProps {
  currentTab: 'dashboard' | 'dataview' | 'analytics' | 'customers' | 'inventory' | 'settings';
  setCurrentTab: (tab: 'dashboard' | 'dataview' | 'analytics' | 'customers' | 'inventory' | 'settings') => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedBench: string;
  setSelectedBench: (bench: string) => void;
  openCreateModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  setCurrentTab,
  searchQuery,
  setSearchQuery,
  selectedBench,
  setSelectedBench,
  openCreateModal,
}) => {
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut: Cmd/Ctrl + K to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        posAudio.playScanBeep();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleExportCsv = () => {
    window.open('/api/export/tickets', '_blank');
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-6 py-3 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xs">
      {/* Brand & Bench Selector */}
      <div className="flex items-center gap-5 w-full md:w-auto justify-between md:justify-start">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-100">
            <Wrench className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 tracking-tight text-base">
                ApexFix <span className="text-indigo-600">POS & TECH</span> CRM
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Live
              </span>
            </div>
            {/* Workstation Bench Selector */}
            <div className="flex items-center gap-1 mt-0.5">
              <Cpu className="w-3 h-3 text-slate-400" />
              <select
                value={selectedBench}
                onChange={(e) => setSelectedBench(e.target.value)}
                className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 bg-transparent border-0 focus:outline-none cursor-pointer p-0"
              >
                <option value="ALL">All Shop Workstations</option>
                <option value="Bench #01">Bench #01 (Display Diagnostic)</option>
                <option value="Bench #02">Bench #02 (Battery Cleanroom)</option>
                <option value="Bench #03">Bench #03 (Console & Micro-solder)</option>
                <option value="Bench #04">Bench #04 (Hardware Diagnostic - Active)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="hidden lg:flex items-center gap-1 bg-slate-100/80 p-1 rounded-lg border border-slate-200/80">
          <button
            onClick={() => setCurrentTab('dashboard')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
              currentTab === 'dashboard'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setCurrentTab('dataview')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
              currentTab === 'dataview'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Data View
          </button>
          <button
            onClick={() => setCurrentTab('analytics')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
              currentTab === 'analytics'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Analytics Board
          </button>
        </nav>
      </div>

      {/* Global Search, CSV Export & Action */}
      <div className="flex items-center gap-2.5 w-full md:w-auto">
        <div className="relative flex-1 md:w-64 lg:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search ticket #, customer, IMEI..."
            className="w-full pl-9 pr-14 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all font-mono"
          />
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[9px] font-semibold text-slate-400 bg-white border border-slate-200 rounded shadow-xs">
              ⌘K
            </kbd>
          </div>
        </div>

        {/* CSV Export Button */}
        <button
          onClick={handleExportCsv}
          className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
          title="Export CSV Report"
        >
          <Download className="w-4 h-4" />
        </button>

        <button
          onClick={openCreateModal}
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-lg text-xs font-semibold shadow-xs shadow-indigo-200 transition-all whitespace-nowrap cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Create Ticket</span>
        </button>
      </div>
    </header>
  );
};
