import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { BarChart3, Bell, Briefcase, FileText, Handshake, Inbox, LayoutDashboard, LifeBuoy, LogOut, Megaphone, Menu, MessageSquareQuote, PlusCircle, ShieldCheck, User, Users, X } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import Logo from "./Logo";
import { ago } from "./ui";

function NotificationBell() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const ref = useRef(null);
  const load = useCallback(() => api("/notifications").then(setData).catch(() => {}), []);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);
  useEffect(() => { load(); }, [pathname, load]);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const go = async (n) => {
    setOpen(false);
    if (!n.read) await api(`/notifications/${n.id}/read`, { method: "POST" }).catch(() => {});
    load();
    if (n.link) navigate(n.link);
  };
  const readAll = async () => { await api("/notifications/read-all", { method: "POST" }); load(); };
  const unread = data?.unread || 0;
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="relative rounded-full p-2 text-ink-muted hover:bg-white hover:text-ink" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
        <Bell className="h-4 w-4" />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold text-white">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-black/[.06] bg-white shadow-float">
          <div className="flex items-center justify-between border-b border-black/[.06] px-4 py-3">
            <span className="text-sm font-medium">Notifications</span>
            {unread > 0 && <button onClick={readAll} className="text-xs text-brand-700 hover:underline">Mark all read</button>}
          </div>
          <ul className="max-h-[60vh] divide-y divide-black/[.05] overflow-y-auto">
            {(data?.items || []).length === 0 && <li className="p-6 text-center text-sm text-ink-muted">You're all caught up.</li>}
            {(data?.items || []).map((n) => (
              <li key={n.id}>
                <button onClick={() => go(n)} className={`flex w-full gap-3 px-4 py-3 text-left hover:bg-brand-50/40 ${n.read ? "" : "bg-brand-50/30"}`}>
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-brand-600"}`} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{n.title}</span>
                    {n.body && <span className="block truncate text-xs text-ink-muted">{n.body}</span>}
                    <span className="mt-0.5 block text-[11px] text-ink-muted">{ago(n.created_at)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const NAV = {
  student: [
    { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
    { to: "/drives", label: "Drives", icon: Briefcase },
    { to: "/insights", label: "Insights", icon: BarChart3 },
    { to: "/notices", label: "Notices", icon: Megaphone },
    { to: "/experiences", label: "Experiences", icon: MessageSquareQuote },
    { to: "/resume", label: "Resume", icon: FileText },
    { to: "/profile", label: "Profile", icon: User },
    { to: "/help", label: "Help", icon: LifeBuoy },
  ],
  recruiter: [
    { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
    { to: "/inbox", label: "Inbox", icon: Inbox },
    { to: "/connect", label: "Colleges", icon: Handshake },
    { to: "/drives", label: "My drives", icon: Briefcase },
    { to: "/drives/new", label: "New drive", icon: PlusCircle, end: true },
  ],
  coordinator: [
    { to: "/", label: "Analytics", icon: BarChart3, end: true },
    { to: "/inbox", label: "Inbox", icon: Inbox },
    { to: "/drives", label: "Drives", icon: Briefcase },
    { to: "/students", label: "Students", icon: Users },
    { to: "/connect", label: "Companies", icon: Handshake },
    { to: "/notices", label: "Notices", icon: Megaphone },
  ],
  admin: [
    { to: "/", label: "Approvals", icon: ShieldCheck, end: true },
  ],
};
const ROLE_LABEL = { student: "Student", recruiter: "Company", coordinator: "Placement cell", admin: "Admin" };

export default function Layout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const items = NAV[user.role] || [];

  const logout = () => { signOut(); navigate("/"); };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-3 pb-6 pt-1"><Logo sub={ROLE_LABEL[user.role]} /></div>
      <nav className="flex flex-col gap-1" aria-label="Main">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-full px-4 py-2.5 text-sm transition ${
                isActive ? "bg-ink text-white shadow-[0_6px_20px_-8px_rgba(17,17,20,.5)]" : "text-ink-soft hover:bg-white hover:text-ink"}`}>
            <Icon className="h-4 w-4 shrink-0" /> {label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto border-t border-black/[.06] px-3 pt-4">
        <div className="truncate text-sm font-medium">{user.name}</div>
        <div className="truncate text-xs text-ink-muted">{user.college?.short ? `${user.college.short} · ${user.college.city}` : user.company || user.email}</div>
        <button onClick={logout} className="mt-3 flex items-center gap-2 text-sm text-ink-muted hover:text-ink"><LogOut className="h-4 w-4" /> Sign out</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-black/[.05] bg-[#fbfaff]/80 p-4 backdrop-blur-xl lg:block">
        {sidebar}
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 bg-ink/30 lg:hidden" onClick={() => setOpen(false)}>
          <div className="relative h-full w-72 bg-[#fbfaff] p-4" onClick={(e) => e.stopPropagation()}>
            <button className="absolute right-4 top-5" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
            {sidebar}
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-black/[.05] bg-[#fbfaff]/80 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-5 py-3 sm:px-8">
            <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-6 w-6" /></button>
            <div className="lg:hidden"><Logo sub={ROLE_LABEL[user.role]} /></div>
            <div className="ml-auto"><NotificationBell /></div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
