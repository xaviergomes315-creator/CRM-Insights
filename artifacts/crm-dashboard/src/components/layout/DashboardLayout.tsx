import { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  LayoutDashboard, Users, PhoneCall, FileText, Globe,
  Bell, Search, ChevronRight, Building2, MessageCircle,
  CalendarDays, BarChart2, Menu, X, Kanban, ClipboardList,
  LogOut, UserCog, ShieldCheck, ShieldAlert,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

// ─── Nav config ───────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { to: '/',             label: 'Dashboard',    icon: LayoutDashboard, exact: true,  adminOnly: false },
  { to: '/leads',        label: 'CRM Leads',    icon: Users,           exact: false, adminOnly: false },
  { to: '/pipeline',     label: 'Pipeline',     icon: Kanban,          exact: false, adminOnly: false },
  { to: '/telecaller',   label: 'Telecaller',   icon: PhoneCall,       exact: false, adminOnly: false },
  { to: '/tasks',        label: 'Tasks',        icon: ClipboardList,   exact: false, adminOnly: false },
  { to: '/proposals',    label: 'Proposals',    icon: FileText,        exact: false, adminOnly: false },
  { to: '/whatsapp',     label: 'WhatsApp',     icon: MessageCircle,   exact: false, adminOnly: false },
  { to: '/social-media', label: 'Social Media', icon: CalendarDays,    exact: false, adminOnly: false },
  // Admin-only pages — hidden from Telecaller
  { to: '/analytics',    label: 'Analytics',    icon: BarChart2,       exact: false, adminOnly: true  },
  { to: '/invoices',     label: 'Invoices',     icon: FileText,        exact: false, adminOnly: true  },
  { to: '/admin',        label: 'Admin Panel',  icon: UserCog,         exact: false, adminOnly: true  },
  { to: '/client-portal',label: 'Client Portal',icon: Globe,           exact: false, adminOnly: true  },
] as const;

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function DashboardLayout() {
  const location  = useLocation();
  const navigate  = useNavigate();
  const { user, logout, isAdmin, isTelecaller } = useAuth();

  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close sidebar on route change
  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  // Close sidebar on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarOpen(false); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  const isActive = (to: string, exact: boolean) =>
    exact ? location.pathname === to : location.pathname.startsWith(to);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  // Filter nav items by role
  const visibleNav = NAV_ITEMS.filter(item => !item.adminOnly || isAdmin);

  // Initials for avatar
  const initials = user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2) ?? '?';

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">

      {/* ── Mobile overlay ──────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside
        className={clsx(
          'flex w-64 flex-col bg-sidebar border-r border-sidebar-border flex-shrink-0',
          'fixed inset-y-0 left-0 z-30 transition-transform duration-300 ease-in-out',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          'md:relative md:translate-x-0 md:transition-none',
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border flex-shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary flex-shrink-0">
            <Building2 className="h-5 w-5 text-sidebar-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-sidebar-foreground leading-tight">CRM Pro</p>
            <p className="text-xs text-sidebar-foreground/50">Business Suite</p>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors md:hidden"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <p className="px-3 mb-2 text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/40">
            Main Menu
          </p>
          {visibleNav.map(({ to, label, icon: Icon, exact }) => {
            const active = isActive(to, exact);
            return (
              <NavLink
                key={to}
                to={to}
                end={exact}
                className={clsx(
                  'group flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-all duration-150',
                  active
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                )}
              >
                <Icon className={clsx(
                  'h-4 w-4 flex-shrink-0',
                  active
                    ? 'text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground/50 group-hover:text-sidebar-accent-foreground',
                )} />
                <span className="flex-1">{label}</span>
                {active && <ChevronRight className="h-3 w-3 opacity-60" />}
              </NavLink>
            );
          })}
        </nav>

        {/* Sidebar footer — user info + logout */}
        <div className="px-4 py-4 border-t border-sidebar-border flex-shrink-0 space-y-3">
          {/* Role indicator */}
          <div className={clsx(
            'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold border',
            isTelecaller
              ? 'bg-amber-50/80 border-amber-200 text-amber-700'
              : 'bg-emerald-50/80 border-emerald-200 text-emerald-700',
          )}>
            {isTelecaller
              ? <ShieldAlert className="h-3.5 w-3.5 flex-shrink-0" />
              : <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0" />
            }
            <span>{user?.role ?? 'Unknown'} Account</span>
          </div>

          {/* User row + logout */}
          <div className="flex items-center gap-3">
            <div className={clsx(
              'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold flex-shrink-0',
              isTelecaller
                ? 'bg-amber-100 text-amber-700'
                : 'bg-sidebar-primary/20 text-sidebar-primary',
            )}>
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-sidebar-foreground truncate">{user?.name ?? 'Guest'}</p>
              <p className="text-xs text-sidebar-foreground/40 truncate">{user?.email}</p>
            </div>
            <button
              onClick={handleLogout}
              title="Sign out"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-sidebar-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
              aria-label="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">

        {/* Top Navbar */}
        <header className="flex h-16 items-center border-b border-border bg-card px-4 flex-shrink-0 gap-3">
          {/* Hamburger — mobile only */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors md:hidden flex-shrink-0"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Search */}
          <div className="hidden sm:flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 flex-1 max-w-xs">
            <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <input
              type="text"
              placeholder="Search..."
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none min-w-0"
            />
          </div>

          <div className="flex-1 sm:hidden" />

          {/* Right side */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {/* Mobile search */}
            <button className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors sm:hidden">
              <Search className="h-4 w-4" />
            </button>

            {/* Bell */}
            <button className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <Bell className="h-4 w-4" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive" />
            </button>

            <div className="h-8 w-px bg-border hidden sm:block" />

            {/* User identity */}
            <div className="flex items-center gap-2">
              <div className={clsx(
                'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold flex-shrink-0',
                isTelecaller ? 'bg-amber-500 text-white' : 'bg-primary text-primary-foreground',
              )}>
                {initials}
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-medium text-foreground leading-tight">{user?.name}</p>
                <p className={clsx('text-xs leading-tight', isTelecaller ? 'text-amber-600' : 'text-emerald-600')}>
                  {user?.role}
                </p>
              </div>
            </div>

            {/* Logout */}
            <button
              onClick={handleLogout}
              title="Sign out"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-background p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
