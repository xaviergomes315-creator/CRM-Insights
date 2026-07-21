import { useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard,
  UserCog,
  Settings,
  LogOut,
  Menu,
  X,
  Bell,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useVisibleModules,
  type SidebarNavItem,
} from "@/hooks/useVisibleModules";

// ─── Static admin-utility items ───────────────────────────────────────────────
// These are not CRM modules in the registry; they are always shown to admins
// regardless of business type or module configuration.

const ADMIN_UTILITY_ITEMS: SidebarNavItem[] = [
  { key: "admin",        label: "Admin Panel",  href: "/admin",        icon: ShieldCheck },
  { key: "integrations", label: "Integrations", href: "/integrations", icon: Zap         },
  { key: "users",        label: "Users",        href: "/users",        icon: UserCog     },
  { key: "settings",     label: "Settings",     href: "/settings",     icon: Settings    },
];

// ─── Dashboard item (not in the module registry) ──────────────────────────────

const DASHBOARD_ITEM: SidebarNavItem = {
  key:   "dashboard",
  label: "Dashboard",
  href:  "/",
  icon:  LayoutDashboard,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function DashboardLayout() {
  const { profile, signOut, isAdmin } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  // Dynamic sidebar from the module registry; gracefully falls back to the
  // hardcoded list when the API is unavailable.
  const { navItems } = useVisibleModules();

  const formatRole = (role?: string) => {
    if (!role) return "Loading...";
    return role
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  };

  // ── Active-link detection ─────────────────────────────────────────────────
  const isActive = (item: SidebarNavItem) => {
    if (item.href === "/") return location.pathname === "/";
    if (item.matchPrefix) return location.pathname.startsWith(item.href);
    return location.pathname === item.href;
  };

  // ── NavLink component ─────────────────────────────────────────────────────
  const NavLink = ({ item }: { item: SidebarNavItem }) => {
    const Icon   = item.icon;
    const active = isActive(item);
    return (
      <Link
        to={item.href}
        onClick={() => setIsSidebarOpen(false)}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
          active
            ? "bg-blue-50 text-blue-700 font-semibold"
            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
        }`}
      >
        <Icon
          size={20}
          className={active ? "text-blue-600" : "text-gray-400"}
        />
        <span className="flex-1 truncate">{item.label}</span>
        {item.beta && (
          <span className="text-[10px] bg-amber-100 text-amber-700 font-semibold px-1.5 py-0.5 rounded-full leading-none">
            Beta
          </span>
        )}
      </Link>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* Mobile Topbar */}
      <div className="md:hidden flex items-center justify-between bg-white border-b px-4 py-3 absolute w-full z-20">
        <span className="font-bold text-xl text-blue-600">ERP Enterprise</span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        >
          {isSidebarOpen ? <X /> : <Menu />}
        </Button>
      </div>

      {/* Sidebar */}
      <aside
        className={`
          fixed md:static inset-y-0 left-0 z-10 w-64 bg-white border-r shadow-sm
          transform transition-transform duration-200 ease-in-out md:translate-x-0
          flex flex-col
          ${isSidebarOpen ? "translate-x-0 mt-14 md:mt-0" : "-translate-x-full"}
        `}
      >
        {/* Logo */}
        <div className="hidden md:flex h-16 items-center px-6 border-b">
          <span className="font-extrabold text-2xl text-blue-600 tracking-tight">
            CRM Insights
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">

          {/* ── Dashboard — always first ── */}
          <NavLink item={DASHBOARD_ITEM} />

          {/* ── Dynamic module items from the Module Registry ── */}
          {navItems.map((item) => (
            <NavLink key={item.key} item={item} />
          ))}

          {/* ── Administration section (admin roles only) ── */}
          {isAdmin && (
            <>
              <div className="pt-4 pb-1 px-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                  Administration
                </p>
              </div>
              {ADMIN_UTILITY_ITEMS.map((item) => (
                <NavLink key={item.key} item={item} />
              ))}
            </>
          )}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden pt-14 md:pt-0">

        {/* Top Header */}
        <header className="h-16 bg-white border-b flex items-center justify-end px-6 shadow-sm z-10">
          <div className="flex items-center gap-4">

            {/* Notification Bell */}
            <Button
              variant="ghost"
              size="icon"
              className="text-gray-500 hover:text-blue-600"
            >
              <Bell size={20} />
            </Button>

            <div className="h-8 w-px bg-gray-200 mx-2" />

            {/* User Profile Badge */}
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-gray-900 leading-tight">
                  {profile?.full_name || "New User"}
                </p>
                <p className="text-xs text-gray-500 font-medium">
                  {formatRole(profile?.role)}
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-700 font-bold shadow-sm">
                {profile?.full_name?.charAt(0)?.toUpperCase() || "U"}
              </div>
            </div>

            {/* Logout */}
            <Button
              variant="ghost"
              size="icon"
              onClick={signOut}
              className="text-gray-400 hover:text-red-600 hover:bg-red-50 ml-2"
              title="Sign Out"
            >
              <LogOut size={20} />
            </Button>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
