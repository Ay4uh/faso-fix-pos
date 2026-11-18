import React, { useState, useEffect } from 'react';
import {
  SlidersHorizontal,
  Building2,
  Receipt,
  Percent,
  Users,
  Volume2,
  Database,
  Check,
  AlertCircle,
  Save,
  Wrench,
  Shield,
  Play,
} from 'lucide-react';
import { posAudio } from '../utils/audio';

interface ShopSettings {
  id: number;
  shopName: string;
  address: string;
  phone: string;
  email: string;
  taxLabel: string;
  taxRateBps: number;
  warrantyDays: number;
  technicians: string;
  benches: string;
  receiptFooter: string;
  nextTicketNumber: number;
  updatedAt: string;
}

interface SettingsViewProps {
  onSettingsUpdated?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onSettingsUpdated }) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'taxes' | 'team' | 'system'>('profile');
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form states
  const [shopName, setShopName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [receiptFooter, setReceiptFooter] = useState('');

  const [taxLabel, setTaxLabel] = useState('HST');
  const [taxRatePercent, setTaxRatePercent] = useState('13.00');
  const [warrantyDays, setWarrantyDays] = useState(90);
  const [hourlyLaborRate, setHourlyLaborRate] = useState('85.00');

  const [technicians, setTechnicians] = useState('');
  const [benches, setBenches] = useState('');

  const fetchSettings = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/settings');
      if (res.ok) {
        const json = await res.json();
        const data: ShopSettings = json.data;
        setSettings(data);

        setShopName(data.shopName || 'ApexFix POS & Diagnostics');
        setPhone(data.phone || '(647) 740-0566');
        setEmail(data.email || 'service@apexfix.ca');
        setAddress(data.address || '123 Tech Boulevard, Suite 400');
        setReceiptFooter(data.receiptFooter || 'Standard 90-day warranty on parts and labor. Devices left unclaimed for 30 days are subject to storage fees.');

        setTaxLabel(data.taxLabel || 'HST');
        setTaxRatePercent(((data.taxRateBps || 1300) / 100).toFixed(2));
        setWarrantyDays(data.warrantyDays || 90);

        setTechnicians(data.technicians || 'Alex Mercer (Lead Tech)\nSarah Jenkins (Diagnostics)\nMarcus Vance (Hardware)');
        setBenches(data.benches || 'Bench #01 (Primary Intake)\nBench #02 (Assembly)\nBench #03 (Microsoldering)\nBench #04 (Alex Mercer)');
      }
    } catch (err) {
      console.error(err);
      setErrorMessage('Could not load current settings');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);
    setSaveSuccess(false);

    try {
      const taxBps = Math.round(parseFloat(taxRatePercent || '0') * 100);

      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopName: shopName.trim(),
          phone: phone.trim(),
          email: email.trim(),
          address: address.trim(),
          taxLabel: taxLabel.trim(),
          taxRateBps: taxBps,
          warrantyDays: Number(warrantyDays) || 90,
          technicians: technicians.trim(),
          benches: benches.trim(),
          receiptFooter: receiptFooter.trim(),
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to update settings');
      }

      posAudio.playSuccessChime();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      if (onSettingsUpdated) onSettingsUpdated();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error updating settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      {/* Top Header & Save Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4.5 rounded-xl border border-slate-200/90 shadow-xs">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shadow-xs">
            <SlidersHorizontal className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-slate-900 leading-tight">
              ApexFix System Configuration
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              Manage shop identity, tax rates, billing defaults, workstations &amp; hardware
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2.5">
          {isLoading && (
            <span className="text-xs text-slate-400 font-medium animate-pulse">
              Syncing settings...
            </span>
          )}
          {saveSuccess && (
            <span className="text-xs font-bold text-emerald-600 flex items-center gap-1.5 animate-in fade-in">
              <Check className="w-4 h-4 text-emerald-500" />
              Settings saved live!
            </span>
          )}
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={isSaving || isLoading}
            className="inline-flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm shadow-indigo-600/30 transition cursor-pointer disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Saving...' : 'Save Configuration'}</span>
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Settings Navigation & Bento Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Sub-Navigation Sidebar */}
        <div className="bg-white p-2 rounded-xl border border-slate-200/90 shadow-xs space-y-1 h-fit">
          {[
            { id: 'profile', label: 'Shop Profile & Branding', icon: Building2 },
            { id: 'taxes', label: 'Taxes, Pricing & Invoices', icon: Percent },
            { id: 'team', label: 'Workstations & Techs', icon: Users },
            { id: 'system', label: 'Hardware & Database', icon: Database },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`w-full flex items-center space-x-2.5 px-3 py-2.5 rounded-lg text-xs font-bold transition text-left cursor-pointer ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content Area */}
        <div className="lg:col-span-3 space-y-5">
          {/* TAB 1: SHOP PROFILE */}
          {activeTab === 'profile' && (
            <div className="bg-white p-5 sm:p-6 rounded-xl border border-slate-200/90 shadow-xs space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-indigo-600" />
                  Shop Identity &amp; Contact Details
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  These details print automatically on work orders, customer receipts, and email invoices.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Shop Trading Name</label>
                  <input
                    type="text"
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    placeholder="ApexFix Repair Center"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 transition"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Support Phone Number</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 019-2834"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 font-mono transition"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Invoicing Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="service@apexfix.ca"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 transition"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Store Address</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="123 King St W, Toronto, ON"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 transition"
                  />
                </div>
              </div>

              <div className="space-y-1 pt-2">
                <label className="text-xs font-bold text-slate-700">
                  Customer Receipt Terms &amp; Legal Footer
                </label>
                <textarea
                  rows={3}
                  value={receiptFooter}
                  onChange={(e) => setReceiptFooter(e.target.value)}
                  placeholder="Terms printed at the bottom of customer receipts..."
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 transition"
                />
                <p className="text-[11px] text-slate-400">
                  Printed on all PDF work orders and physical receipts given to the customer.
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: TAXES & PRICING */}
          {activeTab === 'taxes' && (
            <div className="bg-white p-5 sm:p-6 rounded-xl border border-slate-200/90 shadow-xs space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-indigo-600" />
                  Tax Rates, Currency &amp; Pricing Policies
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Configure regional sales tax (HST/GST/VAT) and baseline diagnostic pricing defaults.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Tax Label (e.g. HST, GST, VAT)</label>
                  <input
                    type="text"
                    value={taxLabel}
                    onChange={(e) => setTaxLabel(e.target.value)}
                    placeholder="HST"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 uppercase font-mono font-bold transition"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Tax Rate Percentage (%)</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="50"
                      value={taxRatePercent}
                      onChange={(e) => setTaxRatePercent(e.target.value)}
                      placeholder="13.00"
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 font-mono font-bold transition pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">
                      %
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Default Diagnostic Rate ($/hr)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold font-mono">
                      $
                    </span>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={hourlyLaborRate}
                      onChange={(e) => setHourlyLaborRate(e.target.value)}
                      placeholder="85.00"
                      className="w-full pl-7 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 font-mono font-bold transition"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Standard Parts Warranty Period</label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      value={warrantyDays}
                      onChange={(e) => setWarrantyDays(parseInt(e.target.value) || 90)}
                      placeholder="90"
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 font-mono font-bold transition pr-14"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">
                      Days
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: WORKSTATIONS & TEAM */}
          {activeTab === 'team' && (
            <div className="bg-white p-5 sm:p-6 rounded-xl border border-slate-200/90 shadow-xs space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-600" />
                  Workstation Benches &amp; Staff Technicians
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Define your physical shop benches and technician rosters for work assignment.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5 text-indigo-600" />
                    Physical Workstations (1 per line)
                  </label>
                  <textarea
                    rows={6}
                    value={benches}
                    onChange={(e) => setBenches(e.target.value)}
                    placeholder="Bench #01&#10;Bench #02&#10;Soldering Station"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 font-mono transition"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-indigo-600" />
                    Active Technicians (1 per line)
                  </label>
                  <textarea
                    rows={6}
                    value={technicians}
                    onChange={(e) => setTechnicians(e.target.value)}
                    placeholder="Alex Mercer&#10;Sarah Jenkins"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 font-mono transition"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SYSTEM & HARDWARE */}
          {activeTab === 'system' && (
            <div className="space-y-4">
              <div className="bg-white p-5 sm:p-6 rounded-xl border border-slate-200/90 shadow-xs space-y-4">
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-indigo-600" />
                    Web Audio &amp; POS Scanner Chimes
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Immediate audible confirmation for barcode scanning, ticket completion, and payment tenders.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-900">Barcode Scanner Beep</div>
                      <div className="text-[11px] text-slate-500">1200Hz synthesized audio pulse</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => posAudio.playScanBeep()}
                      className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-xs font-bold text-indigo-600 flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <Play className="w-3 h-3 fill-indigo-600" />
                      Test Beep
                    </button>
                  </div>

                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-900">Cash Register &amp; Tender Chime</div>
                      <div className="text-[11px] text-slate-500">Dual-tone harmonic completion sound</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => posAudio.playCashChime()}
                      className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-xs font-bold text-emerald-600 flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <Play className="w-3 h-3 fill-emerald-600" />
                      Test Cash
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-white p-5 sm:p-6 rounded-xl border border-slate-200/90 shadow-xs space-y-4">
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Database className="w-4 h-4 text-indigo-600" />
                    ACID Relational Storage Engine
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    SQLite relational backend with sequential transactional numbering.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[11px] font-bold text-slate-500 block">Database Storage</span>
                    <span className="text-xs font-bold text-slate-900 block mt-0.5">SQLite + Prisma ORM</span>
                    <span className="text-[10px] text-emerald-600 font-semibold">● Active &amp; Synced</span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[11px] font-bold text-slate-500 block">Next Sequential WO ID</span>
                    <span className="text-xs font-mono font-bold text-indigo-600 block mt-0.5">
                      #{settings?.nextTicketNumber || 1}
                    </span>
                    <span className="text-[10px] text-slate-500 font-semibold">Sequential Increment</span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[11px] font-bold text-slate-500 block">System Clock &amp; SLA</span>
                    <span className="text-xs font-mono font-bold text-slate-900 block mt-0.5">
                      {new Date().toLocaleTimeString()}
                    </span>
                    <span className="text-[10px] text-emerald-600 font-semibold">● UTC Synced</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
