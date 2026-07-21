/**
 * useVisibleModules
 *
 * Fetches the sidebar module list from GET /api/modules/visible, which runs
 * the full getVisibleModules() filter on the server:
 *   • production_ready = true
 *   • hidden = false
 *   • is_enabled = true (per business_configuration)
 *   • required_permissions includes the current user's role
 *
 * The hook expands modules with navigable secondary_hrefs (e.g. /call-log,
 * /whatsapp/campaigns) into separate sidebar items while skipping route-param
 * patterns (e.g. /website-projects/:id — these drive prefix-matching only).
 *
 * Graceful fallback: if the API is unreachable or returns an error, the hook
 * returns the original hardcoded nav list so the sidebar is never broken.
 */

import { useQuery }   from "@tanstack/react-query";
import { useAuth }    from "@/contexts/AuthContext";
import {
  Users,
  Kanban,
  CheckSquare,
  Phone,
  PhoneCall,
  MessageCircle,
  Share2,
  FileText,
  Receipt,
  Briefcase,
  Globe,
  Building2,
  PieChart,
  Megaphone,
  LayoutDashboard,
  FolderOpen,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";

// ── Public shape consumed by DashboardLayout ──────────────────────────────────

export interface SidebarNavItem {
  key:          string;
  label:        string;
  href:         string;
  icon:         LucideIcon;
  /** Use startsWith matching instead of exact matching (e.g. /website-projects/:id) */
  matchPrefix?: boolean;
  /** Show a "Beta" badge next to the label */
  beta?:        boolean;
}

// ── Icon resolution ───────────────────────────────────────────────────────────
// Maps lucide-react PascalCase icon names (as stored in the Module Registry)
// to the actual imported React components.

const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard,
  Users,
  Kanban,
  CheckSquare,
  Phone,
  PhoneCall,
  MessageCircle,
  Share2,
  FileText,
  Receipt,
  Briefcase,
  Globe,
  Building2,
  PieChart,
  Megaphone,
  FolderOpen,   // documents module (hidden, won't appear)
  HelpCircle,   // support_tickets fallback (hidden, won't appear)
};

function resolveIcon(name: string): LucideIcon {
  return ICON_MAP[name] ?? LayoutDashboard;
}

// ── Secondary nav item metadata ───────────────────────────────────────────────
// Some modules have navigable secondary_hrefs that get their own sidebar row.
// Route-param patterns (containing ":") are skipped — they only drive prefix
// matching for the parent item.

const SUB_ITEM_META: Record<string, { label: string; icon: LucideIcon }> = {
  "/call-log":           { label: "Call Log",     icon: PhoneCall },
  "/whatsapp/campaigns": { label: "WA Campaigns", icon: Megaphone },
};

// ── Hardcoded fallback ────────────────────────────────────────────────────────
// Mirrors the original mainNavItems in DashboardLayout so the sidebar stays
// functional when the API is unavailable (no Supabase credentials, network
// error, etc.).

export const FALLBACK_NAV_ITEMS: SidebarNavItem[] = [
  { key: "leads",            label: "Leads",           href: "/leads",              icon: Users         },
  { key: "pipeline",         label: "Pipeline",         href: "/pipeline",           icon: Kanban        },
  { key: "telecaller",       label: "Telecaller",       href: "/telecaller",         icon: Phone         },
  { key: "call-log",         label: "Call Log",         href: "/call-log",           icon: PhoneCall     },
  { key: "tasks",            label: "Tasks",            href: "/tasks",              icon: CheckSquare   },
  { key: "proposals",        label: "Proposals",        href: "/proposals",          icon: FileText      },
  { key: "whatsapp",         label: "WhatsApp",         href: "/whatsapp",           icon: MessageCircle },
  { key: "wa-campaigns",     label: "WA Campaigns",     href: "/whatsapp/campaigns", icon: Megaphone     },
  { key: "social-media",     label: "Social Media",     href: "/social-media",       icon: Share2        },
  { key: "hr",               label: "HR",               href: "/hr",                 icon: Briefcase     },
  { key: "website-projects", label: "Website Projects", href: "/website-projects",   icon: Globe,        matchPrefix: true },
  { key: "client-portal",    label: "Client Portal",    href: "/client-portal",      icon: Building2     },
];

// ── API response shape ────────────────────────────────────────────────────────

interface ApiModule {
  module_key:          string;
  display_name:        string;
  icon:                string;
  nav_href:            string;
  secondary_hrefs?:    string[];
  beta:                boolean;
  is_enabled:          boolean;
  is_supported:        boolean;
  sort_order:          number;
  required_permissions: string[];
}

interface VisibleModulesResponse {
  modules: ApiModule[];
}

// ── Module → SidebarNavItem ───────────────────────────────────────────────────

function expandModule(mod: ApiModule): SidebarNavItem[] {
  const items: SidebarNavItem[] = [];

  // Does this module have any :param patterns in its secondary_hrefs?
  // If so, the primary nav item uses prefix matching.
  const hasParamSecondary = (mod.secondary_hrefs ?? []).some((h) =>
    h.includes(":"),
  );

  items.push({
    key:         mod.module_key,
    label:       mod.display_name,
    href:        mod.nav_href,
    icon:        resolveIcon(mod.icon),
    matchPrefix: hasParamSecondary || undefined,
    beta:        mod.beta || undefined,
  });

  // Emit a separate sidebar row for each navigable secondary href
  for (const href of mod.secondary_hrefs ?? []) {
    if (href.includes(":")) continue; // route-param pattern — skip
    const meta = SUB_ITEM_META[href];
    if (!meta) continue; // no display metadata defined — skip
    items.push({
      key:   `${mod.module_key}--${href}`,
      label: meta.label,
      href,
      icon:  meta.icon,
    });
  }

  return items;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useVisibleModules(): {
  navItems:  SidebarNavItem[];
  isLoading: boolean;
  isError:   boolean;
} {
  const { session, profile } = useAuth();

  const query = useQuery<VisibleModulesResponse, Error>({
    queryKey: ["visible-modules", profile?.company_id, profile?.role],
    queryFn:  async () => {
      const res = await fetch("/api/modules/visible", {
        headers: {
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
      });
      if (!res.ok) {
        throw new Error(`[useVisibleModules] API returned ${res.status}`);
      }
      return res.json() as Promise<VisibleModulesResponse>;
    },
    // Only run when the user has a valid session and a company
    enabled:   !!session?.access_token && !!profile?.company_id,
    staleTime: 5 * 60 * 1000,  // module config rarely changes — cache for 5 min
    retry:     1,               // one retry, then fall back to hardcoded list
  });

  // Expand API modules into flat sidebar items; fall back to hardcoded list
  // when the query has not yet succeeded (loading, error, or disabled).
  const navItems: SidebarNavItem[] =
    query.data?.modules != null
      ? query.data.modules.flatMap(expandModule)
      : FALLBACK_NAV_ITEMS;

  return {
    navItems,
    isLoading: query.isLoading,
    isError:   query.isError,
  };
}
