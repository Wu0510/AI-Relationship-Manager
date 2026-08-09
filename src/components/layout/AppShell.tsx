'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bell,
  CalendarDays,
  LayoutDashboard,
  Moon,
  Settings,
  Sparkles,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/** 導覽項目 — 對應原型的 NAV_ITEMS */
const NAV_ITEMS = [
  { href: '/', label: '首頁', icon: LayoutDashboard },
  { href: '/customers', label: '客戶管理', icon: Users },
  { href: '/calendar', label: '行事曆', icon: CalendarDays },
  { href: '/assistant', label: 'AI 助理', icon: Sparkles },
  { href: '/reminders', label: '提醒中心', icon: Bell },
  { href: '/settings', label: '設定', icon: Settings },
] as const;

export interface ShellReminder {
  customerName: string;
  text: string;
}

export interface ShellAdvisor {
  name: string;
  email: string;
  branch: string | null;
}

/**
 * App 骨架：左側導覽 + 上方 Header + 內容區。
 * 深色切換沿用原型做法（切 <html class="dark">），並存進 localStorage。
 */
export function AppShell({
  advisor,
  todayLabel,
  reminders,
  children,
}: {
  advisor: ShellAdvisor;
  todayLabel: string;
  reminders: ShellReminder[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [dark, setDark] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);

  // 初始化主題（原型預設淺色）
  useEffect(() => {
    const stored = localStorage.getItem('arm_theme');
    const isDark = stored === 'dark';
    setDark(isDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);

  function toggleDark() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('arm_theme', next ? 'dark' : 'light');
  }

  // 點空白處關閉通知下拉
  useEffect(() => {
    if (!bellOpen) return;
    const close = () => setBellOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [bellOpen]);

  async function logout() {
    await createClient().auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="app-shell">
      {/* ── 側邊導覽 ─────────────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">
            <Sparkles size={16} />
          </div>
          <span className="brand-label">理專助理 AI</span>
        </div>

        <nav className="nav">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <a key={href} href={href} className={`nav-item ${active ? 'active' : ''}`}>
                <Icon size={18} />
                <span className="nav-label">{label}</span>
              </a>
            );
          })}
        </nav>

        <div className="sidebar-foot">
          {advisor.branch ?? '財富管理部'}
          <br />
          資料受 RLS 隔離，僅顯示您名下的客戶。
        </div>
      </aside>

      {/* ── 主欄 ─────────────────────────────────────────────────────── */}
      <div className="main-col">
        <header className="topbar">
          <div>
            <p className="topbar-greeting">早安，{advisor.name || advisor.email}</p>
            <p className="topbar-date">{todayLabel}</p>
          </div>

          <div className="topbar-actions">
            <button
              type="button"
              className="icon-btn"
              onClick={toggleDark}
              aria-label={dark ? '切換淺色模式' : '切換深色模式'}
            >
              {dark ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            <div style={{ position: 'relative' }}>
              <button
                type="button"
                className="icon-btn"
                aria-label="通知"
                onClick={(e) => {
                  e.stopPropagation();
                  setBellOpen((v) => !v);
                }}
              >
                <Bell size={17} />
                {reminders.length > 0 && (
                  <span className="badge-dot">
                    {reminders.length > 9 ? '9+' : reminders.length}
                  </span>
                )}
              </button>

              {bellOpen && (
                <div className="bell-dropdown" onClick={(e) => e.stopPropagation()}>
                  <div className="bell-dropdown-title">近期提醒</div>
                  <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
                    {reminders.length === 0 ? (
                      <div className="empty-row">目前沒有待處理提醒</div>
                    ) : (
                      reminders.slice(0, 6).map((r, i) => (
                        <div key={i} className="bell-item">
                          <b>{r.customerName}</b> · {r.text}
                        </div>
                      ))
                    )}
                  </div>
                  <a href="/reminders" className="bell-more block">
                    查看全部提醒 →
                  </a>
                </div>
              )}
            </div>

            <div className="avatar-me" title={advisor.name || advisor.email}>
              {(advisor.name || advisor.email).slice(0, 1)}
            </div>

            <button type="button" className="icon-btn" onClick={logout} title="登出">
              <X size={17} />
            </button>
          </div>
        </header>

        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}
