import { useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  PieChart,
  Settings,
  LogOut,
  Menu,
  X,
  Bell,
  Briefcase,
  UserCog,
  Globe,
  Kanban,
  Phone,
  FileText,
  MessageCircle,
  Share2,
  Building2,
  ShieldCheck,
  Receipt,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Nav item type ────────────────────────────────────────────────────────────

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  /** Use prefix-matching instead of exact matching (e.g. /website-projects/:id) */
  matchPrefix?: boolean;
}

export default function DashboardLayout() {
  const { profile, signOut, isAdmin } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  const formatRole = (role?: string) => {
    if (!role) return "Loading...";
    return role
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  };

  // ── General nav — visible to every authenticated user ─────────────────────
  const mainNavItems: NavItem[] = [
    { name: "Dashboard",        href: "/",                icon: LayoutDashboard },
    { name: "Leads",            href: "/leads",           icon: Users           },
    { name: "Pipeline",         href: "/pipeline",        icon: Kanban          },
    { name: "Telecaller",       href: "/telecaller",      icon: Phone           },
    { name: "Tasks",            href: "/tasks",           icon: CheckSquare     },
    { name: "Proposals",        href: "/proposals",       icon: FileText        },
    { name: "WhatsApp",         href: "/whatsapp",        icon: MessageCircle   },
    { name: "Social Media",     href: "/social-media",    icon: Share2          },
    { name: "HR",               href: "/hr",              icon: Briefcase       },
    { name: "Website Projects", href: "/website-projects",icon: Globe,          matchPrefix: true },
    { name: "Client Portal",    href: "/client-portal",   icon: Building2       },
  ];

  // ── Admin nav — visible only to company_admin and super_admin ─────────────
  const adminNavItems: NavItem[] = isAdmin
    ? [
        { name: "Analytics",    href: "/analytics",    icon: PieChart    },
        { name: "Admin Panel",  href: "/admin",        icon: ShieldCheck },
        { name: "Invoices",     href: "/invoices",     icon: Receipt     },
        { name: "Integrations", href: "/integrations", icon: Zap         },
        { name: "Users",        href: "/users",        icon: UserCog     },
        { name: "Settings",     href: "/settings",     icon: Settings    },
      ]
    : [];

  const isActive = (item: NavItem) =>
    item.href === "/"
      ? location.pathname === "/"
      : item.matchPrefix
        ? location.pathname.startsWith(item.href)
        : location.pathname === item.href;

  const NavLink = ({ item }: { item: NavItem }) => {
    const Icon    = item.icon;
    const active  = isActive(item);
    return (
      <Link
        key={item.name}
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
        {item.name}
      </Link>
    );
  };

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
          {/* ── Main modules ── */}
          {mainNavItems.map((item) => (
            <NavLink key={item.name} item={item} />
          ))}

          {/* ── Administration section (admin roles only) ── */}
          {adminNavItems.length > 0 && (
            <>
              <div className="pt-4 pb-1 px-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                  Administration
                </p>
              </div>
              {adminNavItems.map((item) => (
                <NavLink key={item.name} item={item} />
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
