import { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import {
  Plus, X, Loader2, Users2, CalendarCheck, Briefcase,
  Clock, UserCheck, UserX, CalendarOff, ChevronDown,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Employee {
  id:          string;
  company_id:  string;
  full_name:   string;
  role:        string;
  join_date:   string | null;
  salary_info: string | null;
  created_at:  string;
}

type AttendanceStatus = 'Present' | 'Absent' | 'On-Leave';

interface AttendanceRow {
  id:          string;
  employee_id: string;
  company_id:  string;
  date:        string;
  status:      AttendanceStatus;
  check_in:    string | null;
  check_out:   string | null;
  employees:   { full_name: string } | null;
}

interface EmployeeForm {
  full_name:   string;
  role:        string;
  join_date:   string;
  salary_info: string;
}

interface AttendanceForm {
  employee_id: string;
  date:        string;
  status:      AttendanceStatus;
  check_in:    string;
  check_out:   string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; style: string; icon: React.ElementType }> = {
  Present:    { label: 'Present',   style: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: UserCheck  },
  Absent:     { label: 'Absent',    style: 'bg-red-100 text-red-700 border-red-200',             icon: UserX      },
  'On-Leave': { label: 'On Leave',  style: 'bg-amber-100 text-amber-700 border-amber-200',       icon: CalendarOff },
};

const EMPTY_EMP_FORM: EmployeeForm = { full_name: '', role: '', join_date: '', salary_info: '' };

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function EMPTY_ATT_FORM(): AttendanceForm {
  return { employee_id: '', date: todayISO(), status: 'Present', check_in: '', check_out: '' };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function formatTime(t: string | null) {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${(h % 12) || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-5 py-4">
          <div className="h-4 rounded bg-muted animate-pulse" style={{ width: `${60 + (i * 17) % 40}%` }} />
        </td>
      ))}
    </tr>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: number | string; sub: string; icon: React.ElementType; color: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 flex items-start gap-4">
      <div className={clsx('flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0', color)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className="text-2xl font-bold text-foreground mt-0.5">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
      </div>
    </div>
  );
}

// ─── Add Employee Modal ───────────────────────────────────────────────────────

function AddEmployeeModal({
  onClose,
  onSaved,
  companyId,
}: {
  onClose: () => void;
  onSaved: (emp: Employee) => void;
  companyId: string;
}) {
  const [form, setForm]     = useState<EmployeeForm>(EMPTY_EMP_FORM);
  const [errors, setErrors] = useState<Partial<EmployeeForm>>({});
  const [saving, setSaving] = useState(false);

  const validate = (): Partial<EmployeeForm> => {
    const e: Partial<EmployeeForm> = {};
    if (!form.full_name.trim()) e.full_name = 'Name is required';
    if (!form.role.trim())      e.role      = 'Role is required';
    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSaving(true);
    const { data, error } = await supabase
      .from('employees')
      .insert({
        company_id:  companyId,
        full_name:   form.full_name.trim(),
        role:        form.role.trim(),
        join_date:   form.join_date  || null,
        salary_info: form.salary_info.trim() || null,
      })
      .select()
      .single();
    setSaving(false);

    if (error) {
      toast.error('Failed to add employee', { description: error.message });
      return;
    }
    toast.success(`${form.full_name.trim()} added to directory`);
    onSaved(data as Employee);
    onClose();
  };

  const field = (
    key: keyof EmployeeForm,
    label: string,
    required: boolean,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <div>
      <label className="block text-xs font-semibold text-foreground mb-1.5">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      <input
        {...props}
        value={form[key]}
        onChange={e => { setForm(f => ({ ...f, [key]: e.target.value })); setErrors(er => ({ ...er, [key]: undefined })); }}
        className={clsx(
          'w-full rounded-lg border bg-background px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:ring-2 focus:ring-primary/30',
          errors[key] ? 'border-destructive' : 'border-border focus:border-primary',
        )}
      />
      {errors[key] && <p className="mt-1 text-xs text-destructive">{errors[key]}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-5 border-b border-border flex-shrink-0">
          <h2 className="text-base font-semibold text-foreground">Add Employee</h2>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col flex-1 min-h-0">
          <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
            {field('full_name',   'Full Name',    true,  { type: 'text',   placeholder: 'e.g. Ravi Kumar' })}
            {field('role',        'Job Role',     true,  { type: 'text',   placeholder: 'e.g. Sales Executive' })}
            {field('join_date',   'Join Date',    false, { type: 'date' })}
            {field('salary_info', 'Salary / CTC', false, { type: 'text',   placeholder: 'e.g. ₹4,00,000 per annum' })}
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 px-6 py-4 border-t border-border bg-muted/20 rounded-b-2xl flex-shrink-0">
            <button type="button" onClick={onClose} className="w-full sm:w-auto rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? 'Saving…' : 'Add Employee'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Mark Attendance Modal ────────────────────────────────────────────────────

function MarkAttendanceModal({
  employees,
  onClose,
  onSaved,
  companyId,
}: {
  employees: Employee[];
  onClose: () => void;
  onSaved: (row: AttendanceRow) => void;
  companyId: string;
}) {
  const [form, setForm]     = useState<AttendanceForm>(EMPTY_ATT_FORM());
  const [errors, setErrors] = useState<Partial<Record<keyof AttendanceForm, string>>>({});
  const [saving, setSaving] = useState(false);

  const validate = (): Partial<Record<keyof AttendanceForm, string>> => {
    const e: Partial<Record<keyof AttendanceForm, string>> = {};
    if (!form.employee_id) e.employee_id = 'Select an employee';
    if (!form.date)        e.date        = 'Date is required';
    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSaving(true);
    const { data, error } = await supabase
      .from('attendance')
      .upsert(
        {
          employee_id: form.employee_id,
          company_id:  companyId,
          date:        form.date,
          status:      form.status,
          check_in:    form.check_in  || null,
          check_out:   form.check_out || null,
        },
        { onConflict: 'employee_id,date' },
      )
      .select('*, employees(full_name)')
      .single();
    setSaving(false);

    if (error) {
      toast.error('Failed to mark attendance', { description: error.message });
      return;
    }
    const emp = employees.find(em => em.id === form.employee_id);
    toast.success(`Attendance marked for ${emp?.full_name ?? 'employee'}`);
    onSaved(data as AttendanceRow);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-5 border-b border-border flex-shrink-0">
          <h2 className="text-base font-semibold text-foreground">Mark Attendance</h2>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col flex-1 min-h-0">
          <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">

            {/* Employee select */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Employee <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <select
                  value={form.employee_id}
                  onChange={e => { setForm(f => ({ ...f, employee_id: e.target.value })); setErrors(er => ({ ...er, employee_id: undefined })); }}
                  className={clsx(
                    'w-full appearance-none rounded-lg border bg-background px-3 py-3 pr-8 text-sm text-foreground outline-none transition-colors focus:ring-2 focus:ring-primary/30',
                    errors.employee_id ? 'border-destructive' : 'border-border focus:border-primary',
                  )}
                >
                  <option value="">— Select employee —</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
              {errors.employee_id && <p className="mt-1 text-xs text-destructive">{errors.employee_id}</p>}
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Date <span className="text-destructive">*</span>
              </label>
              <input
                type="date"
                value={form.date}
                onChange={e => { setForm(f => ({ ...f, date: e.target.value })); setErrors(er => ({ ...er, date: undefined })); }}
                className={clsx(
                  'w-full rounded-lg border bg-background px-3 py-3 text-sm text-foreground outline-none transition-colors focus:ring-2 focus:ring-primary/30',
                  errors.date ? 'border-destructive' : 'border-border focus:border-primary',
                )}
              />
              {errors.date && <p className="mt-1 text-xs text-destructive">{errors.date}</p>}
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">Status</label>
              <div className="grid grid-cols-3 gap-2">
                {(['Present', 'Absent', 'On-Leave'] as AttendanceStatus[]).map(s => {
                  const cfg = STATUS_CONFIG[s];
                  const Icon = cfg.icon;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, status: s }))}
                      className={clsx(
                        'flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-xs font-semibold transition-all',
                        form.status === s
                          ? `${cfg.style} border shadow-sm`
                          : 'bg-background border-border text-muted-foreground hover:bg-muted',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Check-in / Check-out — only for Present */}
            {form.status === 'Present' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">Check-in</label>
                  <input
                    type="time"
                    value={form.check_in}
                    onChange={e => setForm(f => ({ ...f, check_in: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-3 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">Check-out</label>
                  <input
                    type="time"
                    value={form.check_out}
                    onChange={e => setForm(f => ({ ...f, check_out: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-3 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 px-6 py-4 border-t border-border bg-muted/20 rounded-b-2xl flex-shrink-0">
            <button type="button" onClick={onClose} className="w-full sm:w-auto rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? 'Saving…' : 'Mark Attendance'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'employees' | 'attendance';

export default function HRPage() {
  const { profile, isAdmin } = useAuth();
  const canManage = isAdmin || profile?.role === 'manager';

  const [activeTab,       setActiveTab]       = useState<Tab>('employees');
  const [employees,       setEmployees]       = useState<Employee[]>([]);
  const [attendance,      setAttendance]      = useState<AttendanceRow[]>([]);
  const [loadingEmp,      setLoadingEmp]      = useState(true);
  const [loadingAtt,      setLoadingAtt]      = useState(false);
  const [attLoaded,       setAttLoaded]       = useState(false);
  const [showAddEmp,      setShowAddEmp]      = useState(false);
  const [showMarkAtt,     setShowMarkAtt]     = useState(false);
  const [attDateFilter,   setAttDateFilter]   = useState('');

  // ── Fetch employees ──────────────────────────────────────────────────────

  const fetchEmployees = useCallback(async () => {
    setLoadingEmp(true);
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Could not load employees', { description: error.message });
    } else {
      setEmployees((data ?? []) as Employee[]);
    }
    setLoadingEmp(false);
  }, []);

  // ── Fetch attendance ─────────────────────────────────────────────────────

  const fetchAttendance = useCallback(async (dateFilter?: string) => {
    setLoadingAtt(true);
    let query = supabase
      .from('attendance')
      .select('*, employees(full_name)')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    if (dateFilter) {
      query = query.eq('date', dateFilter);
    }

    const { data, error } = await query;
    if (error) {
      toast.error('Could not load attendance', { description: error.message });
    } else {
      setAttendance((data ?? []) as AttendanceRow[]);
    }
    setLoadingAtt(false);
    setAttLoaded(true);
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // Load attendance when tab is first opened
  useEffect(() => {
    if (activeTab === 'attendance' && !attLoaded) {
      fetchAttendance(attDateFilter);
    }
  }, [activeTab, attLoaded, fetchAttendance, attDateFilter]);

  const handleDateFilterChange = (date: string) => {
    setAttDateFilter(date);
    fetchAttendance(date);
  };

  // ── Stats ────────────────────────────────────────────────────────────────

  const todayStr   = todayISO();
  const todayLog   = attendance.filter(a => a.date === todayStr);
  const presentToday = todayLog.filter(a => a.status === 'Present').length;
  const absentToday  = todayLog.filter(a => a.status === 'Absent').length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Briefcase className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">HR & Operations</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Employee directory and attendance management for your company.
          </p>
        </div>

        {canManage && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowMarkAtt(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              <CalendarCheck className="h-4 w-4" />
              Mark Attendance
            </button>
            <button
              onClick={() => setShowAddEmp(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <Plus className="h-4 w-4" />
              Add Employee
            </button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Employees" value={loadingEmp ? '—' : employees.length}   sub="In your company"    icon={Users2}       color="bg-blue-50 text-blue-600"     />
        <StatCard label="Present Today"   value={attLoaded  ? presentToday : '—'}        sub={`as of ${formatDate(todayStr)}`} icon={UserCheck}    color="bg-emerald-50 text-emerald-600" />
        <StatCard label="Absent Today"    value={attLoaded  ? absentToday  : '—'}        sub="Absent or on leave" icon={UserX}        color="bg-red-50 text-red-600"       />
        <StatCard label="On Leave"        value={attLoaded  ? todayLog.filter(a => a.status === 'On-Leave').length : '—'} sub="Today" icon={CalendarOff} color="bg-amber-50 text-amber-600"   />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {([['employees', 'Employee Directory', Users2], ['attendance', 'Attendance Log', CalendarCheck]] as const).map(([tab, label, Icon]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Employee Directory tab ─────────────────────────────────────────── */}
      {activeTab === 'employees' && (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Employee</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Role</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Join Date</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Salary / CTC</th>
                </tr>
              </thead>
              <tbody>
                {loadingEmp ? (
                  [1, 2, 3, 4].map(i => <SkeletonRow key={i} cols={4} />)
                ) : employees.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-14 text-center text-muted-foreground text-sm">
                      <div className="flex flex-col items-center gap-2">
                        <Users2 className="h-8 w-8 opacity-25" />
                        <p>No employees yet.{canManage ? ' Click "Add Employee" to get started.' : ''}</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  employees.map((emp, idx) => (
                    <tr
                      key={emp.id}
                      className={clsx(
                        'border-b border-border last:border-0 transition-colors hover:bg-muted/30',
                        idx % 2 === 0 ? 'bg-card' : 'bg-muted/10',
                      )}
                    >
                      {/* Name + initials avatar */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold flex-shrink-0">
                            {emp.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <span className="font-semibold text-foreground">{emp.full_name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">{emp.role || '—'}</td>
                      <td className="px-5 py-4 text-muted-foreground whitespace-nowrap">{formatDate(emp.join_date)}</td>
                      <td className="px-5 py-4 text-muted-foreground">{emp.salary_info || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Attendance Log tab ────────────────────────────────────────────── */}
      {activeTab === 'attendance' && (
        <div className="space-y-3">
          {/* Date filter */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm font-medium text-foreground">Filter by date:</span>
            </div>
            <input
              type="date"
              value={attDateFilter}
              onChange={e => handleDateFilterChange(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-colors"
            />
            {attDateFilter && (
              <button
                onClick={() => handleDateFilterChange('')}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Clear
              </button>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Employee</th>
                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date</th>
                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Check-in</th>
                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Check-out</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingAtt ? (
                    [1, 2, 3, 4].map(i => <SkeletonRow key={i} cols={5} />)
                  ) : attendance.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-14 text-center text-muted-foreground text-sm">
                        <div className="flex flex-col items-center gap-2">
                          <CalendarCheck className="h-8 w-8 opacity-25" />
                          <p>
                            {attDateFilter
                              ? `No attendance records for ${formatDate(attDateFilter)}.`
                              : 'No attendance records yet.'}
                            {canManage ? ' Click "Mark Attendance" to add one.' : ''}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    attendance.map((row, idx) => {
                      const cfg  = STATUS_CONFIG[row.status];
                      const Icon = cfg.icon;
                      return (
                        <tr
                          key={row.id}
                          className={clsx(
                            'border-b border-border last:border-0 transition-colors hover:bg-muted/30',
                            idx % 2 === 0 ? 'bg-card' : 'bg-muted/10',
                          )}
                        >
                          <td className="px-5 py-4 font-medium text-foreground whitespace-nowrap">
                            {row.employees?.full_name ?? '—'}
                          </td>
                          <td className="px-5 py-4 text-muted-foreground whitespace-nowrap">
                            {formatDate(row.date)}
                          </td>
                          <td className="px-5 py-4 whitespace-nowrap">
                            <span className={clsx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold', cfg.style)}>
                              <Icon className="h-3 w-3" />
                              {cfg.label}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-muted-foreground whitespace-nowrap tabular-nums">
                            {formatTime(row.check_in)}
                          </td>
                          <td className="px-5 py-4 text-muted-foreground whitespace-nowrap tabular-nums">
                            {formatTime(row.check_out)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {attendance.length > 0 && (
            <p className="text-xs text-muted-foreground text-right">
              {attendance.length} record{attendance.length !== 1 ? 's' : ''}
              {attDateFilter ? ` on ${formatDate(attDateFilter)}` : ' total'}
            </p>
          )}
        </div>
      )}

      {/* Modals */}
      {showAddEmp && profile?.company_id && (
        <AddEmployeeModal
          companyId={profile.company_id}
          onClose={() => setShowAddEmp(false)}
          onSaved={emp => setEmployees(prev => [emp, ...prev])}
        />
      )}

      {showMarkAtt && profile?.company_id && (
        <MarkAttendanceModal
          employees={employees}
          companyId={profile.company_id}
          onClose={() => setShowMarkAtt(false)}
          onSaved={row => {
            setAttendance(prev => {
              // Replace if same employee+date already in list (upsert), else prepend
              const exists = prev.findIndex(a => a.employee_id === row.employee_id && a.date === row.date);
              if (exists >= 0) {
                const next = [...prev];
                next[exists] = row;
                return next;
              }
              return [row, ...prev];
            });
          }}
        />
      )}
    </div>
  );
}
