import { clsx } from 'clsx';
import { ShieldCheck, Users, UserCog, Mail, BadgeCheck } from 'lucide-react';
import { useAuth, ALL_USERS, type AuthUser } from '@/contexts/AuthContext';

// ─── Role badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: AuthUser['role'] }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border',
        role === 'Admin'
          ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
          : 'bg-amber-100 text-amber-700 border-amber-200',
      )}
    >
      <ShieldCheck className="h-3 w-3" />
      {role}
    </span>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: number; icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex items-center gap-4">
      <div className={clsx('flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0', color)}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className="text-2xl font-bold text-foreground mt-0.5">{value}</p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { user: currentUser } = useAuth();

  const admins      = ALL_USERS.filter(u => u.role === 'Admin');
  const telecallers = ALL_USERS.filter(u => u.role === 'Telecaller');

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <UserCog className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Admin Panel</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Master control panel — visible to Admins only.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs text-emerald-700 font-medium self-start">
          <ShieldCheck className="h-3.5 w-3.5" />
          Logged in as {currentUser?.name}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard label="Total Users"   value={ALL_USERS.length}      icon={Users}        color="bg-primary/10 text-primary"          />
        <StatCard label="Admins"        value={admins.length}          icon={ShieldCheck}  color="bg-emerald-50 text-emerald-600"      />
        <StatCard label="Telecallers"   value={telecallers.length}     icon={BadgeCheck}   color="bg-amber-50 text-amber-600"          />
      </div>

      {/* User management table */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground">User Management</h2>
        </div>

        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">#</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Role</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody>
                {ALL_USERS.map((u, idx) => (
                  <tr
                    key={u.id}
                    className={clsx(
                      'border-b border-border last:border-0 transition-colors hover:bg-muted/30',
                      u.id === currentUser?.id ? 'bg-primary/5' : idx % 2 === 0 ? 'bg-card' : 'bg-muted/10',
                    )}
                  >
                    <td className="px-5 py-4 text-muted-foreground text-xs font-mono">{String(idx + 1).padStart(2, '0')}</td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <div className={clsx(
                          'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold flex-shrink-0',
                          u.role === 'Admin'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700',
                        )}>
                          {u.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <p className="font-semibold text-foreground text-sm">{u.name}</p>
                          {u.id === currentUser?.id && (
                            <p className="text-xs text-primary font-medium">← you</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <a
                        href={`mailto:${u.email}`}
                        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
                      >
                        <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                        {u.email}
                      </a>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-600 border border-emerald-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Active
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Showing {ALL_USERS.length} users · Mock data — connect to Supabase Auth to manage real users.
        </p>
      </div>

      {/* RBAC reference */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">Role Permissions Reference</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[480px]">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-2 text-left font-semibold text-muted-foreground">Feature</th>
                <th className="pb-2 text-center font-semibold text-emerald-600">Admin</th>
                <th className="pb-2 text-center font-semibold text-amber-600">Telecaller</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[
                ['View all leads',          true,  true  ],
                ['Add / Edit / Delete leads',true,  false ],
                ['Full phone numbers',       true,  false ],
                ['Pipeline (Kanban)',         true,  true  ],
                ['Tasks & Reminders',         true,  true  ],
                ['WhatsApp messaging',        true,  true  ],
                ['Proposals',                true,  true  ],
                ['Analytics',                true,  false ],
                ['Invoices & Downloads',     true,  false ],
                ['Admin Panel',              true,  false ],
                ['Client Portal',            true,  false ],
              ].map(([feature, admin, tele]) => (
                <tr key={String(feature)}>
                  <td className="py-2.5 font-medium text-foreground">{String(feature)}</td>
                  <td className="py-2.5 text-center">
                    {admin ? <span className="text-emerald-500 font-bold">✓</span> : <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="py-2.5 text-center">
                    {tele ? <span className="text-emerald-500 font-bold">✓</span> : <span className="text-muted-foreground/40">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
