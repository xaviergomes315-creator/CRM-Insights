import { useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { 
  LayoutDashboard, Users, CheckSquare, PieChart, 
  Settings, LogOut, Menu, X, Bell, Briefcase,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardLayout() {
  const { profile, signOut, isAdmin } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  // Role ko sundar dikhane ke liye (e.g., 'company_admin' -> 'Company Admin')
  const formatRole = (role?: string) => {
    if (!role) return "Loading...";
    return role.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  // Enterprise Sidebar Modules
  const navItems = [
    { name: "Dashboard", href: "/",          icon: LayoutDashboard },
    { name: "Leads",     href: "/leads",     icon: Users           },
    { name: "Tasks",     href: "/tasks",     icon: CheckSquare     },
    { name: "HR",        href: "/hr",        icon: Briefcase       },
    { name: "Analytics", href: "/analytics", icon: PieChart        },
    ...(isAdmin ? [{ name: "Settings", href: "/settings", icon: Settings }] : []),
  ];

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      
      {/* Mobile Topbar */}
      <div className="md:hidden flex items-center justify-between bg-white border-b px-4 py-3 absolute w-full z-20">
        <span className="font-bold text-xl text-blue-600">ERP Enterprise</span>
        <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
          {isSidebarOpen ? <X /> : <Menu />}
        </Button>
      </div>

      {/* Sidebar */}
      <aside className={`
        fixed md:static inset-y-0 left-0 z-10 w-64 bg-white border-r shadow-sm transform transition-transform duration-200 ease-in-out md:translate-x-0 flex flex-col
        ${isSidebarOpen ? "translate-x-0 mt-14 md:mt-0" : "-translate-x-full"}
      `}>
        <div className="hidden md:flex h-16 items-center px-6 border-b">
          <span className="font-extrabold text-2xl text-blue-600 tracking-tight">CRM Insights</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={() => setIsSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                  isActive 
                  ? "bg-blue-50 text-blue-700 font-semibold" 
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <Icon size={20} className={isActive ? "text-blue-600" : "text-gray-400"} />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden pt-14 md:pt-0">
        
        {/* Top Header */}
        <header className="h-16 bg-white border-b flex items-center justify-end px-6 shadow-sm z-10">
          <div className="flex items-center gap-4">
            
            {/* Notification Bell */}
            <Button variant="ghost" size="icon" className="text-gray-500 hover:text-blue-600">
              <Bell size={20} />
            </Button>

            <div className="h-8 w-px bg-gray-200 mx-2"></div>

            {/* Dynamic User Profile Badge */}
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

            {/* Logout Button */}
            <Button variant="ghost" size="icon" onClick={signOut} className="text-gray-400 hover:text-red-600 hover:bg-red-50 ml-2" title="Sign Out">
              <LogOut size={20} />
            </Button>

          </div>
        </header>

        {/* Dynamic Pages Load Here */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
