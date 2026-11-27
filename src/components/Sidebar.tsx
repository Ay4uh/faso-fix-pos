import React, { useState, useRef, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  BarChart3,
  Settings,
  Shield,
  ShieldAlert,
  LogOut,
  Lock,
  Camera,
  Pencil,
  X,
  Check,
  Trash2,
  AtSign,
  Phone,
  Mail,
  Wrench,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import { DashboardStats, User as UserType } from '../types';
import { fetchWithAuth } from '../utils/auth';
import { posAudio } from '../utils/audio';

interface SidebarProps {
  currentTab: 'repairs' | 'customers' | 'inventory' | 'analytics' | 'settings' | 'admin';
  setCurrentTab: (tab: 'repairs' | 'customers' | 'inventory' | 'analytics' | 'settings' | 'admin') => void;
  stats: DashboardStats | null;
  currentUser: UserType | null;
  onOpenAdminLogin: () => void;
  onLogout: () => void;
  onUserUpdated?: (user: UserType) => void;
  openCreateModal?: () => void;
  onOpenTimeClock?: () => void;
}

const PROFILE_THEMES = [
  { id: 'indigo', label: 'Indigo', cover: 'from-indigo-600 via-violet-600 to-purple-600', ring: 'from-indigo-500 to-violet-600' },
  { id: 'insta', label: 'Sunset', cover: 'from-amber-500 via-rose-500 to-fuchsia-600', ring: 'from-amber-500 via-rose-500 to-fuchsia-600' },
  { id: 'whatsapp', label: 'Emerald', cover: 'from-emerald-500 via-teal-500 to-cyan-600', ring: 'from-emerald-500 to-teal-600' },
  { id: 'ocean', label: 'Ocean', cover: 'from-sky-500 via-blue-600 to-indigo-700', ring: 'from-sky-500 to-blue-600' },
  { id: 'midnight', label: 'Midnight', cover: 'from-slate-800 via-slate-900 to-indigo-950', ring: 'from-slate-700 to-indigo-900' },
] as const;

const QUICK_BIOS = [
  '🔧 At the repair bench',
  '⚡ Available for diagnostics',
  '👑 Lead Shop Administrator',
  '🔬 Micro-soldering & board repair',
];

function parseUserPrefs(prefsRaw?: string | null): Record<string, any> {
  if (!prefsRaw) return {};
  try {
    return JSON.parse(prefsRaw) || {};
  } catch {
    return {};
  }
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  setCurrentTab,
  stats,
  currentUser,
  onOpenAdminLogin,
  onLogout,
  onUserUpdated,
}) => {
  const isAdmin = currentUser?.role === 'ADMIN';
  const prefs = parseUserPrefs(currentUser?.preferences);
  const savedAvatarUrl: string = prefs.avatarDataUrl || '';
  const savedThemeId: string = prefs.avatarTheme || (isAdmin ? 'indigo' : 'ocean');
  const activeTheme = PROFILE_THEMES.find((t) => t.id === savedThemeId) || PROFILE_THEMES[0];

  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [name, setName] = useState(currentUser?.name || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [bench, setBench] = useState(currentUser?.bench || '');
  const [bio, setBio] = useState(currentUser?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(savedAvatarUrl);
  const [themeId, setThemeId] = useState(savedThemeId);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Flexible Sidebar State (Pinned vs Collapsed Rail)
  const [isPinned, setIsPinned] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('apexfix_sidebar_pinned');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const [isHovered, setIsHovered] = useState(false);

  const togglePinned = () => {
    setIsPinned((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('apexfix_sidebar_pinned', String(next));
      } catch {}
      return next;
    });
  };

  const isExpanded = isPinned || isHovered;

  useEffect(() => {
    if (currentUser) {
      const p = parseUserPrefs(currentUser.preferences);
      setName(currentUser.name || '');
      setEmail(currentUser.email || '');
      setPhone(currentUser.phone || '');
      setBench(currentUser.bench || '');
      setBio(currentUser.bio || '');
      setAvatarUrl(p.avatarDataUrl || '');
      setThemeId(p.avatarTheme || (currentUser.role === 'ADMIN' ? 'indigo' : 'ocean'));
    }
  }, [currentUser, isProfileModalOpen]);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 160;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const minSide = Math.min(img.width, img.height);
          const sx = (img.width - minSide) / 2;
          const sy = (img.height - minSide) / 2;
          ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
          setAvatarUrl(canvas.toDataURL('image/jpeg', 0.85));
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!name.trim()) {
      setErrorMsg('Display name is required.');
      return;
    }
    setIsSaving(true);
    setErrorMsg(null);
    try {
      const existingPrefs = parseUserPrefs(currentUser.preferences);
      const updatedPrefs = JSON.stringify({
        ...existingPrefs,
        avatarDataUrl: avatarUrl || '',
        avatarTheme: themeId,
      });

      const res = await fetchWithAuth('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          bench: bench.trim(),
          bio: bio.trim(),
          preferences: updatedPrefs,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update profile');
      posAudio.playSuccessChime();
      if (onUserUpdated && data.user) {
        onUserUpdated(data.user);
      }
      setIsProfileModalOpen(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not save profile');
      posAudio.playWarningBeep();
    } finally {
      setIsSaving(false);
    }
  };

  const modalTheme = PROFILE_THEMES.find((t) => t.id === themeId) || PROFILE_THEMES[0];

  const navLabelCls =
    'ui-sidebar-label w-[176px] shrink-0 flex items-center justify-between ml-3 pointer-events-none';
  const navBtnBase =
    'w-full h-11 flex items-center px-[13px] rounded-2xl text-xs font-bold cursor-pointer overflow-hidden transition-colors duration-200';

  return (
    <>
      <aside
        data-expanded={isExpanded}
        data-pinned={isPinned}
        onMouseEnter={() => {
          if (!isPinned) setIsHovered(true);
        }}
        onMouseLeave={() => {
          if (!isPinned) setIsHovered(false);
        }}
        className="group/sidebar ui-sidebar-rail sticky top-16 h-[calc(100vh-64px)] shrink-0 bg-slate-50 border-r border-slate-200/90 flex flex-col justify-between select-none z-20 overflow-hidden"
      >
        {/* Top Navigation */}
        <div className="overflow-y-auto overflow-x-hidden flex-1">
          <nav className="p-3 space-y-1.5">
            {/* Header & Pin/Collapse Toggle */}
            <div className="flex items-center justify-between px-1 pb-1.5 h-7">
              <span className="ui-sidebar-label px-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap overflow-hidden">
                Workspace
              </span>
              <button
                type="button"
                onClick={togglePinned}
                title={isPinned ? 'Collapse sidebar (Compact rail)' : 'Pin sidebar open (Expanded)'}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-200/70 active:bg-slate-300 flex items-center justify-center transition-colors cursor-pointer shrink-0 ml-auto"
              >
                {isPinned ? (
                  <PanelLeftClose className="w-4 h-4 transition-transform duration-200" />
                ) : (
                  <PanelLeft className="w-4 h-4 text-indigo-600 transition-transform duration-200" />
                )}
              </button>
            </div>

            {/* 1. Dashboard */}
            <button
              onClick={() => setCurrentTab('repairs')}
              title="Dashboard"
              className={`${navBtnBase} ${
                currentTab === 'repairs'
                  ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/90'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
              }`}
            >
              <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                <LayoutDashboard
                  className={`w-4 h-4 shrink-0 ${
                    currentTab === 'repairs' ? 'text-indigo-600' : 'text-slate-500'
                  }`}
                />
              </div>
              <div className={navLabelCls}>
                <span className="whitespace-nowrap">Dashboard</span>
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full font-bold tabular-nums shrink-0 ${
                    currentTab === 'repairs' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-200/80 text-slate-700'
                  }`}
                >
                  {stats?.totalActive ?? 0}
                </span>
              </div>
            </button>

            {/* 2. Customers */}
            <button
              onClick={() => setCurrentTab('customers')}
              title="Customers"
              className={`${navBtnBase} ${
                currentTab === 'customers'
                  ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/90'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
              }`}
            >
              <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                <Users
                  className={`w-4 h-4 shrink-0 ${
                    currentTab === 'customers' ? 'text-indigo-600' : 'text-slate-500'
                  }`}
                />
              </div>
              <div className={navLabelCls}>
                <span className="whitespace-nowrap">Customers</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700 font-semibold tabular-nums shrink-0">
                  {stats?.customerCount ?? 0}
                </span>
              </div>
            </button>

            {/* 3. Analytics */}
            <button
              onClick={() => setCurrentTab('analytics')}
              title="Analytics"
              className={`${navBtnBase} ${
                currentTab === 'analytics'
                  ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/90'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
              }`}
            >
              <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                <BarChart3
                  className={`w-4 h-4 shrink-0 ${
                    currentTab === 'analytics' ? 'text-indigo-600' : 'text-slate-500'
                  }`}
                />
              </div>
              <div className={navLabelCls}>
                <span className="whitespace-nowrap">Analytics</span>
              </div>
            </button>

            {/* 4. Settings */}
            <button
              onClick={() => setCurrentTab('settings')}
              title="Settings"
              className={`${navBtnBase} ${
                currentTab === 'settings'
                  ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/90'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
              }`}
            >
              <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                <Settings
                  className={`w-4 h-4 shrink-0 ${
                    currentTab === 'settings' ? 'text-indigo-600' : 'text-slate-500'
                  }`}
                />
              </div>
              <div className={navLabelCls}>
                <span className="whitespace-nowrap">Settings</span>
              </div>
            </button>

            {/* 5. Admin Console */}
            {isAdmin && (
              <button
                onClick={() => setCurrentTab('admin')}
                title="Admin Console"
                className={`${navBtnBase} border ${
                  currentTab === 'admin'
                    ? 'bg-purple-600 text-white shadow-xs border-purple-600'
                    : 'text-purple-700 hover:bg-purple-50 border-transparent'
                }`}
              >
                <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                  <ShieldAlert
                    className={`w-4 h-4 shrink-0 ${
                      currentTab === 'admin' ? 'text-purple-200' : 'text-purple-600'
                    }`}
                  />
                </div>
                <div className={navLabelCls}>
                  <span className="whitespace-nowrap">Admin Console</span>
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-purple-600 text-white font-bold uppercase shrink-0">
                    Admin
                  </span>
                </div>
              </button>
            )}
          </nav>
        </div>

        {/* Bottom Auth & Click-to-Edit Social Profile Section */}
        <div className="p-3 border-t border-slate-200 bg-white space-y-2">
          {currentUser ? (
            <div className="space-y-2">
              {/* Clickable Profile Card (Instagram / WhatsApp style) */}
              <button
                type="button"
                onClick={() => setIsProfileModalOpen(true)}
                title="Click to edit your profile, photo & bio"
                className={`w-full h-11 text-left p-[5px] rounded-2xl border flex items-center overflow-hidden transition-colors duration-200 group/profile cursor-pointer ${
                  isAdmin
                    ? 'bg-purple-50/70 hover:bg-purple-100/70 text-purple-950 border-purple-200/90 shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-900 border-slate-200'
                }`}
              >
                <div className="relative shrink-0">
                  <div className={`w-8 h-8 rounded-full p-[1.5px] bg-gradient-to-tr ${activeTheme.ring} shadow-xs`}>
                    {savedAvatarUrl ? (
                      <img
                        src={savedAvatarUrl}
                        alt={currentUser.name}
                        className="w-full h-full rounded-full object-cover bg-white"
                      />
                    ) : (
                      <div className="w-full h-full rounded-full bg-white flex items-center justify-center text-xs font-extrabold text-slate-800">
                        {currentUser.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <span
                    className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white absolute -bottom-0.5 -right-0.5"
                    title="Online • Click to edit profile"
                  />
                </div>
                <div className="ui-sidebar-label w-[172px] shrink-0 flex items-center justify-between ml-2.5 pr-1">
                  <div className="min-w-0 pr-2">
                    <p className="text-xs font-bold truncate text-slate-900">{currentUser.name}</p>
                    <p
                      className={`text-[10px] truncate ${
                        isAdmin ? 'text-purple-700 font-semibold' : 'text-slate-500'
                      }`}
                    >
                      {currentUser.bio || (isAdmin ? 'Administrator' : currentUser.bench || 'Technician')}
                    </p>
                  </div>
                  <span className="text-slate-400 group-hover/profile:text-indigo-600 shrink-0">
                    <Pencil className="w-3.5 h-3.5" />
                  </span>
                </div>
              </button>

              {/* Dedicated High-Contrast Logout Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onLogout();
                }}
                title="Sign out of current account"
                className="w-full h-11 px-[13px] bg-rose-50 hover:bg-rose-100 active:bg-rose-200 border border-rose-200 text-rose-700 rounded-2xl text-xs font-bold flex items-center overflow-hidden cursor-pointer shadow-2xs transition-colors duration-200"
              >
                <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                  <LogOut className="w-4 h-4 text-rose-600 shrink-0" />
                </div>
                <span className="ui-sidebar-label w-[176px] shrink-0 ml-3 whitespace-nowrap text-left">
                  Log Out
                </span>
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                onClick={onLogout}
                title="Exit to Login"
                className="w-full h-11 px-[13px] bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-2xl text-xs font-bold ui-press flex items-center overflow-hidden cursor-pointer"
              >
                <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                  <LogOut className="w-4 h-4 text-slate-500 shrink-0" />
                </div>
                <span className="ui-sidebar-label ml-3 whitespace-nowrap">
                  Exit to Login
                </span>
              </button>

              <button
                type="button"
                onClick={onOpenAdminLogin}
                title="Admin Login"
                className="w-full h-11 flex items-center p-[5px] rounded-2xl bg-purple-50 hover:bg-purple-100 active:bg-purple-200 border border-purple-200 text-purple-900 ui-press shadow-xs group cursor-pointer overflow-hidden"
              >
                <div className="w-8 h-8 rounded-xl bg-purple-100 border border-purple-200 text-purple-700 flex items-center justify-center shrink-0">
                  <Lock className="w-3.5 h-3.5" />
                </div>
                <div className="ui-sidebar-label ml-2.5 whitespace-nowrap text-left">
                  <div className="text-xs font-extrabold text-purple-900 flex items-center gap-1">
                    <span>Admin Login</span>
                    <Shield className="w-3 h-3 text-purple-700" />
                  </div>
                  <p className="text-[10px] text-purple-600">Master controls</p>
                </div>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* =====================================================================
          INSTAGRAM / WHATSAPP / FACEBOOK STYLE EDIT PROFILE MODAL
         ===================================================================== */}
      {isProfileModalOpen && currentUser && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 ui-backdrop"
          onClick={() => setIsProfileModalOpen(false)}
        >
          <div
            className="bg-white w-full max-w-md rounded-3xl border border-slate-200/90 shadow-2xl overflow-hidden ui-modal"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cover Banner with Theme Swatches */}
            <div className={`relative h-28 bg-gradient-to-r ${modalTheme.cover} p-4 flex items-start justify-between`}>
              <div className="flex items-center gap-1.5 bg-black/25 backdrop-blur-xs px-2.5 py-1 rounded-full">
                {PROFILE_THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setThemeId(t.id)}
                    title={`${t.label} theme`}
                    className={`w-4 h-4 rounded-full bg-gradient-to-tr ${t.ring} cursor-pointer transition-transform ${
                      themeId === t.id ? 'scale-125 ring-2 ring-white' : 'opacity-75 hover:opacity-100'
                    }`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => setIsProfileModalOpen(false)}
                className="w-8 h-8 rounded-full bg-black/25 hover:bg-black/40 text-white flex items-center justify-center cursor-pointer ui-press"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Overlapping Circular Profile Picture + Camera Button */}
            <div className="px-6 -mt-12 flex items-end justify-between">
              <div className="relative group/avatar">
                <div className={`w-24 h-24 rounded-full p-1 bg-gradient-to-tr ${modalTheme.ring} shadow-lg bg-white`}>
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={name}
                      className="w-full h-full rounded-full object-cover bg-white border-2 border-white"
                    />
                  ) : (
                    <div className="w-full h-full rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-2xl font-black text-slate-800">
                      {(name || currentUser.name || 'U').charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Change profile photo"
                  className="absolute bottom-0.5 right-0.5 w-8 h-8 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white ring-2 ring-white shadow-md flex items-center justify-center cursor-pointer ui-press"
                >
                  <Camera className="w-4 h-4" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </div>

              <div className="flex items-center gap-2 pb-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer ui-press"
                >
                  Change Photo
                </button>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => setAvatarUrl('')}
                    title="Remove photo"
                    className="p-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 cursor-pointer ui-press"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Social Profile Form */}
            <form onSubmit={handleSaveProfile} className="p-6 pt-4 space-y-3.5">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-slate-900 leading-tight">{name || currentUser.name}</h3>
                  <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/70 text-[10px] font-bold">
                    {isAdmin ? '👑 Admin' : '🔧 Staff'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-mono flex items-center gap-0.5">
                  <AtSign className="w-3 h-3" />
                  {currentUser.username}
                </p>
              </div>

              {errorMsg && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-semibold">
                  {errorMsg}
                </div>
              )}

              {/* Display Name */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your display name"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600"
                />
              </div>

              {/* Bio / Status (WhatsApp / Instagram style) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Bio / Status</label>
                  <span className="text-[10px] text-slate-400 tabular-nums">{bio.length}/120</span>
                </div>
                <input
                  type="text"
                  maxLength={120}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Add a bio or current bench status…"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600"
                />
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {QUICK_BIOS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setBio(chip)}
                      className="px-2 py-0.5 rounded-full bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 text-[10px] font-semibold cursor-pointer ui-press"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* Contact & Workstation Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <Phone className="w-3 h-3" /> Phone
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Phone number"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <Wrench className="w-3 h-3" /> Workstation
                  </label>
                  <input
                    type="text"
                    value={bench}
                    onChange={(e) => setBench(e.target.value)}
                    placeholder="e.g. Bench #01"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <Mail className="w-3 h-3" /> Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsProfileModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer ui-press"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-bold shadow-md shadow-indigo-600/25 flex items-center gap-1.5 cursor-pointer ui-press disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isSaving ? 'Saving…' : 'Save Profile'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
