import { Search, Bell } from "lucide-react";

export default function Topbar() {
  return (
    <header className="flex h-20 items-center justify-between border-b border-slate-200 bg-white px-8">
      
      <div className="relative w-full max-w-xl">
        <Search
          size={18}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
        />

        <input
          type="text"
          placeholder="Search customers, call logs, notes..."
          className="w-full rounded-lg border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <div className="ml-8 flex items-center gap-5">
        <button className="text-slate-500 transition hover:text-slate-900">
          <Bell size={20} />
        </button>

        <div className="text-right">
          <p className="text-sm font-semibold text-slate-900">
            Portfolio Demo
          </p>

          <p className="text-xs text-slate-500">
            Relationship Manager
          </p>
        </div>

        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
          RM
        </div>
      </div>

    </header>
  );
}