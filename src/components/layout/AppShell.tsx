'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import {
  Bell,
  CalendarDays,
  LayoutDashboard,
  LogOut,
  Moon,
  Settings,
  Sparkles,
  Sun,
  Users,
} from 'lucide-react';

import { createClient } from '@/lib/supabase/client';


const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/assistant', label: 'AI Insight', icon: Sparkles },
  { href: '/reminders', label: 'Reminders', icon: Bell },
  { href: '/settings', label: 'Settings', icon: Settings },
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


  useEffect(() => {
    const stored = localStorage.getItem('arm_theme');
    const isDark = stored === 'dark';

    setDark(isDark);

    document.documentElement.classList.toggle(
      'dark',
      isDark,
    );
  }, []);


  function toggleDark() {
    const next = !dark;

    setDark(next);

    document.documentElement.classList.toggle(
      'dark',
      next,
    );

    localStorage.setItem(
      'arm_theme',
      next ? 'dark' : 'light',
    );
  }


  useEffect(() => {
    if (!bellOpen) return;

    const close = () => setBellOpen(false);

    window.addEventListener('click', close);

    return () =>
      window.removeEventListener('click', close);
  }, [bellOpen]);


  async function logout() {
    await createClient().auth.signOut();

    router.push('/login');
    router.refresh();
  }


  /* ============================================================
   * Theme
   * ============================================================ */

  const shellBg = dark
    ? 'bg-slate-950 text-slate-100'
    : 'bg-slate-50 text-slate-900';

  const sidebarBg = dark
    ? 'border-slate-800 bg-slate-950'
    : 'border-slate-200 bg-white';

  const topbarBg = dark
    ? 'border-slate-800 bg-slate-950/95'
    : 'border-slate-200 bg-white/95';

  const logoBorder = dark
    ? 'border-slate-800'
    : 'border-slate-100';

  const titleColor = dark
    ? 'text-slate-100'
    : 'text-slate-900';

  const secondaryText = dark
    ? 'text-slate-400'
    : 'text-slate-500';

  const subtleText = dark
    ? 'text-slate-500'
    : 'text-slate-400';

  const buttonStyle = dark
    ? 'border-slate-700 bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white'
    : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900';


  return (
    <div className={`min-h-screen ${shellBg}`}>

      {/* ========================================================
       * SIDEBAR
       * ======================================================== */}

      <aside
        className={`
          fixed left-0 top-0 z-40
          flex h-screen w-64 flex-col
          border-r
          transition-colors duration-200
          ${sidebarBg}
        `}
      >

        {/* LOGO */}

        <div
          className={`
            flex h-20 items-center
            border-b px-6
            ${logoBorder}
          `}
        >

          <div className="mr-3 flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
            <Sparkles size={18} />
          </div>


          <div>

            <div
              className={`
                text-sm font-semibold tracking-tight
                ${titleColor}
              `}
            >
              AI Relationship
            </div>

            <div
              className={`text-xs ${subtleText}`}
            >
              Manager
            </div>

          </div>

        </div>


        {/* NAVIGATION */}

        <nav className="flex-1 space-y-1 px-4 py-6">

          <p
            className={`
              mb-3 px-3 text-[11px]
              font-semibold uppercase tracking-wider
              ${subtleText}
            `}
          >
            Workspace
          </p>


          {NAV_ITEMS.map(
            ({ href, label, icon: Icon }) => {

              const active =
                href === '/'
                  ? pathname === '/'
                  : pathname.startsWith(href);


              const inactiveStyle = dark
                ? 'text-slate-400 hover:bg-slate-900 hover:text-white'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900';


              const activeStyle = dark
                ? 'bg-blue-500/10 text-blue-400'
                : 'bg-blue-50 text-blue-700';


              return (

                <a
                  key={href}
                  href={href}
                  className={`
                    flex items-center gap-3
                    rounded-lg px-3 py-2.5
                    text-sm font-medium
                    transition
                    ${
                      active
                        ? activeStyle
                        : inactiveStyle
                    }
                  `}
                >

                  <Icon size={18} />

                  <span>{label}</span>

                </a>

              );
            },
          )}

        </nav>


        {/* SIDEBAR FOOTER */}

        <div
          className={`
            border-t p-4
            ${
              dark
                ? 'border-slate-800'
                : 'border-slate-100'
            }
          `}
        >

          <div
            className={`
              rounded-xl p-3
              ${
                dark
                  ? 'bg-slate-900'
                  : 'bg-slate-50'
              }
            `}
          >

            <p
              className={`
                m-0 text-xs font-medium
                ${
                  dark
                    ? 'text-slate-300'
                    : 'text-slate-700'
                }
              `}
            >
              {advisor.branch ??
                'Wealth Management'}
            </p>


            <p
              className={`
                mb-0 mt-1 text-[11px]
                leading-4
                ${subtleText}
              `}
            >
              Secure customer workspace
            </p>

          </div>

        </div>

      </aside>


      {/* ========================================================
       * MAIN
       * ======================================================== */}

      <div className="ml-64 min-h-screen">

        {/* ======================================================
         * TOP BAR
         * ====================================================== */}

        <header
          className={`
            sticky top-0 z-30
            flex h-20 items-center justify-between
            border-b px-8
            backdrop-blur
            transition-colors duration-200
            ${topbarBg}
          `}
        >

          {/* GREETING */}

          <div>

            <p
              className={`
                m-0 text-sm font-semibold
                ${titleColor}
              `}
            >
              早安，{advisor.name || advisor.email} 👋
            </p>


            <p
              className={`
                mb-0 mt-1 text-xs
                ${subtleText}
              `}
            >
              {todayLabel}
            </p>

          </div>


          {/* ACTIONS */}

          <div className="flex items-center gap-3">

            {/* DARK MODE */}

            <button
              type="button"
              onClick={toggleDark}
              aria-label={
                dark
                  ? '切換淺色模式'
                  : '切換深色模式'
              }
              className={`
                flex h-10 w-10
                items-center justify-center
                rounded-lg border
                transition
                ${buttonStyle}
              `}
            >

              {dark
                ? <Sun size={17} />
                : <Moon size={17} />}

            </button>


            {/* NOTIFICATION */}

            <div className="relative">

              <button
                type="button"
                aria-label="通知"
                className={`
                  relative
                  flex h-10 w-10
                  items-center justify-center
                  rounded-lg border
                  transition
                  ${buttonStyle}
                `}
                onClick={(e) => {
                  e.stopPropagation();
                  setBellOpen(
                    (value) => !value,
                  );
                }}
              >

                <Bell size={17} />


                {reminders.length > 0 && (

                  <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold text-white">

                    {reminders.length > 9
                      ? '9+'
                      : reminders.length}

                  </span>

                )}

              </button>


              {/* DROPDOWN */}

              {bellOpen && (

                <div
                  className={`
                    absolute right-0 top-12
                    w-80 overflow-hidden
                    rounded-xl border
                    shadow-xl
                    ${
                      dark
                        ? 'border-slate-700 bg-slate-900'
                        : 'border-slate-200 bg-white'
                    }
                  `}
                  onClick={(e) =>
                    e.stopPropagation()
                  }
                >

                  <div
                    className={`
                      border-b px-4 py-3
                      ${
                        dark
                          ? 'border-slate-800'
                          : 'border-slate-100'
                      }
                    `}
                  >

                    <p
                      className={`
                        m-0 text-sm font-semibold
                        ${titleColor}
                      `}
                    >
                      近期提醒
                    </p>

                  </div>


                  <div className="max-h-72 overflow-y-auto p-2">

                    {reminders.length === 0 ? (

                      <div
                        className={`
                          px-3 py-6
                          text-center text-sm
                          ${subtleText}
                        `}
                      >
                        目前沒有待處理提醒
                      </div>

                    ) : (

                      reminders
                        .slice(0, 6)
                        .map((reminder, index) => (

                          <div
                            key={index}
                            className={`
                              rounded-lg
                              px-3 py-3
                              text-sm
                              transition
                              ${
                                dark
                                  ? 'text-slate-400 hover:bg-slate-800'
                                  : 'text-slate-600 hover:bg-slate-50'
                              }
                            `}
                          >

                            <span
                              className={`
                                font-medium
                                ${titleColor}
                              `}
                            >
                              {reminder.customerName}
                            </span>

                            <span className={secondaryText}>
                              {' '}·{' '}
                            </span>

                            {reminder.text}

                          </div>

                        ))

                    )}

                  </div>


                  <a
                    href="/reminders"
                    className={`
                      block border-t
                      px-4 py-3
                      text-center text-xs
                      font-medium text-blue-500
                      ${
                        dark
                          ? 'border-slate-800 hover:bg-slate-800'
                          : 'border-slate-100 hover:bg-slate-50'
                      }
                    `}
                  >
                    查看全部提醒 →
                  </a>

                </div>

              )}

            </div>


            {/* USER */}

            <div
              className={`
                ml-2 flex items-center gap-3
                border-l pl-5
                ${
                  dark
                    ? 'border-slate-800'
                    : 'border-slate-200'
                }
              `}
            >

              <div
                className={`
                  flex h-10 w-10
                  items-center justify-center
                  rounded-full
                  text-sm font-semibold
                  ${
                    dark
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-900 text-white'
                  }
                `}
              >
                {(advisor.name || advisor.email)
                  .slice(0, 1)
                  .toUpperCase()}
              </div>


              <div className="hidden sm:block">

                <p
                  className={`
                    m-0 max-w-32 truncate
                    text-sm font-semibold
                    ${titleColor}
                  `}
                >
                  {advisor.name ||
                    'Portfolio Demo'}
                </p>


                <p
                  className={`
                    m-0 max-w-32 truncate
                    text-xs
                    ${subtleText}
                  `}
                >
                  Relationship Manager
                </p>

              </div>

            </div>


            {/* LOGOUT */}

            <button
              type="button"
              onClick={logout}
              title="登出"
              className={`
                ml-1 flex h-10 w-10
                items-center justify-center
                rounded-lg
                transition
                ${
                  dark
                    ? 'text-slate-500 hover:bg-red-500/10 hover:text-red-400'
                    : 'text-slate-400 hover:bg-red-50 hover:text-red-500'
                }
              `}
            >
              <LogOut size={17} />
            </button>

          </div>

        </header>


        {/* ======================================================
         * PAGE CONTENT
         * ====================================================== */}

        <main
          className={`
            mx-auto min-h-[calc(100vh-80px)]
            w-full max-w-[1600px]
            p-8
            transition-colors duration-200
            ${
              dark
                ? 'bg-slate-950'
                : 'bg-slate-50'
            }
          `}
        >
          {children}
        </main>

      </div>

    </div>
  );
}