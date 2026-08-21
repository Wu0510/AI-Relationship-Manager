"use client";

import {
  LayoutDashboard,
  Users,
  Phone,
  CalendarDays,
  Sparkles,
  CheckSquare,
  BarChart3,
  Settings,
} from "lucide-react";

const menuItems = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Customers", icon: Users },
  { label: "Call Logs", icon: Phone },
  { label: "Calendar", icon: CalendarDays },
  { label: "AI Insight", icon: Sparkles },
  { label: "Tasks", icon: CheckSquare },
  { label: "Reports", icon: BarChart3 },
  { label: "Settings", icon: Settings },
];

export default function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-screen w-64 border-r border-slate-200 bg-white">
      <div className="flex h-20 items-center px-6">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            AI Relationship
          </h1>
          <p className="text-sm text-slate-500">Manager</p>
        </div>
      </div>

      <nav className="px-4 py-4">
        <div className="space-y-1">
          {menuItems.map((item, index) => {
            const Icon = item.icon;

            return (
              <button
                key={item.label}
                className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition ${
                  index === 0
                    ? "bg-blue-50 text-blue-600"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}