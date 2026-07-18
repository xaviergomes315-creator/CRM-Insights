import { useState } from 'react';
import { clsx } from 'clsx';
import {
  Plus, Pencil, Trash2, X, CalendarDays, ChevronLeft, ChevronRight,
  Facebook, Instagram, Share2,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type Platform = 'Facebook' | 'Instagram';

interface ScheduledPost {
  id: number;
  platform: Platform;
  content: string;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime: string; // HH:MM
}

interface PostForm {
  platform: Platform;
  content: string;
  scheduledDate: string;
  scheduledTime: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_STYLES: Record<Platform, { badge: string; icon: string; dot: string }> = {
  Facebook:  { badge: 'bg-blue-100 text-blue-700 border border-blue-200',     icon: 'text-blue-600',   dot: 'bg-blue-500' },
  Instagram: { badge: 'bg-pink-100 text-pink-700 border border-pink-200',     icon: 'text-pink-600',   dot: 'bg-pink-500' },
};

const INITIAL_POSTS: ScheduledPost[] = [
  { id: 1, platform: 'Facebook',  content: 'Excited to announce our new service launch! 🚀 Stay tuned for more details coming this week.',           scheduledDate: '2026-07-20', scheduledTime: '09:00' },
  { id: 2, platform: 'Instagram', content: 'Behind the scenes at CRM Pro HQ 📸 Our team is working hard to bring you the best experience.',          scheduledDate: '2026-07-20', scheduledTime: '11:30' },
  { id: 3, platform: 'Facebook',  content: 'Client success story: How Priya Sharma grew her business 3x using our CRM tools. Read the case study 👇', scheduledDate: '2026-07-22', scheduledTime: '14:00' },
  { id: 4, platform: 'Instagram', content: '✨ Monday motivation! Every great business starts with great relationships. Build yours with CRM Pro.',    scheduledDate: '2026-07-25', scheduledTime: '08:00' },
  { id: 5, platform: 'Facebook',  content: 'Weekend tip: Schedule your follow-up calls before Friday so you start the week strong. 💼',               scheduledDate: '2026-07-28', scheduledTime: '10:00' },
];

const EMPTY_FORM: PostForm = { platform: 'Facebook', content: '', scheduledDate: '', scheduledTime: '09:00' };

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(date: string, time: string) {
  const [y, m, d] = date.split('-').map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  const [h, min] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12  = h % 12 || 12;
  return `${label} · ${h12}:${String(min).padStart(2, '0')} ${ampm}`;
}

// ─── Platform Icon ────────────────────────────────────────────────────────────

function PlatformIcon({ platform, className }: { platform: Platform; className?: string }) {
  const cls = clsx('h-4 w-4', PLATFORM_STYLES[platform].icon, className);
  return platform === 'Facebook' ? <Facebook className={cls} /> : <Instagram className={cls} />;
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

function PostCalendar({ posts }: { posts: ScheduledPost[] }) {
  const today  = new Date(2026, 6, 18); // July 18 2026
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });

  const prev = () => setCursor(c => c.month === 0  ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 });
  const next = () => setCursor(c => c.month === 11 ? { year: c.year + 1, month: 0  } : { year: c.year, month: c.month + 1 });

  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const firstDay    = new Date(cursor.year, cursor.month, 1).getDay();
  const monthLabel  = new Date(cursor.year, cursor.month, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  // Map date → platforms scheduled that day
  const dayPlatforms = new Map<string, Set<Platform>>();
  posts.forEach(p => {
    if (!dayPlatforms.has(p.scheduledDate)) dayPlatforms.set(p.scheduledDate, new Set());
    dayPlatforms.get(p.scheduledDate)!.add(p.platform);
  });

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          Post Calendar
        </h2>
        <div className="flex items-center gap-1">
          <button onClick={prev} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-3 text-sm font-medium text-foreground min-w-[130px] text-center">{monthLabel}</span>
          <button onClick={next} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS_OF_WEEK.map(d => (
          <div key={d} className="py-1.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">{d}</div>
        ))}
      </div>

      {/* Date grid */}
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, idx) => {
          if (day === null) return <div key={`e-${idx}`} />;
          const iso      = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isToday  = cursor.year === today.getFullYear() && cursor.month === today.getMonth() && day === today.getDate();
          const platforms = dayPlatforms.get(iso);

          return (
            <div key={day} className="flex flex-col items-center gap-0.5 py-1">
              <div className={clsx(
                'flex h-8 w-8 items-center justify-center rounded-full text-sm transition-colors',
                isToday  ? 'bg-primary text-primary-foreground font-bold' : 'text-foreground hover:bg-muted',
              )}>
                {day}
              </div>
              {/* Platform dots */}
              {platforms && (
                <div className="flex gap-0.5">
                  {[...platforms].map(pl => (
                    <span key={pl} className={clsx('h-1.5 w-1.5 rounded-full', PLATFORM_STYLES[pl].dot)} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground border-t border-border pt-4">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-primary inline-block" /> Today</span>
        <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-blue-500 inline-block" /> Facebook</span>
        <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-pink-500 inline-block" /> Instagram</span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SocialMediaPage() {
  const [posts, setPosts]         = useState<ScheduledPost[]>(INITIAL_POSTS);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<ScheduledPost | null>(null);
  const [form, setForm]           = useState<PostForm>(EMPTY_FORM);
  const [errors, setErrors]       = useState<Partial<PostForm>>({});

  const openAddModal = () => {
    setEditingPost(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setModalOpen(true);
  };

  const openEditModal = (post: ScheduledPost) => {
    setEditingPost(post);
    setForm({ platform: post.platform, content: post.content, scheduledDate: post.scheduledDate, scheduledTime: post.scheduledTime });
    setErrors({});
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingPost(null);
    setForm(EMPTY_FORM);
    setErrors({});
  };

  const validate = (): Partial<PostForm> => {
    const e: Partial<PostForm> = {};
    if (!form.content.trim())      e.content       = 'Post content is required';
    if (!form.scheduledDate)       e.scheduledDate  = 'Please pick a date';
    if (!form.scheduledTime)       e.scheduledTime  = 'Please pick a time';
    return e;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    if (editingPost) {
      setPosts(prev => prev.map(p => p.id === editingPost.id ? { ...p, ...form } : p));
    } else {
      const newId = Math.max(0, ...posts.map(p => p.id)) + 1;
      setPosts(prev => [...prev, { id: newId, ...form }]);
    }
    closeModal();
  };

  const handleDelete = (id: number) => setPosts(prev => prev.filter(p => p.id !== id));

  // Sort upcoming: soonest first
  const sorted = [...posts].sort((a, b) => {
    const da = a.scheduledDate + 'T' + a.scheduledTime;
    const db = b.scheduledDate + 'T' + b.scheduledTime;
    return da < db ? -1 : da > db ? 1 : 0;
  });

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Social Media Scheduler</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {posts.length} post{posts.length !== 1 ? 's' : ''} scheduled
          </p>
        </div>
        <button
          onClick={openAddModal}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          New Post
        </button>
      </div>

      {/* Calendar */}
      <PostCalendar posts={posts} />

      {/* Upcoming Posts */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
          <Share2 className="h-4 w-4 text-primary" />
          Upcoming Posts
        </h2>

        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-5 py-3.5 text-left font-semibold text-muted-foreground tracking-wide text-xs uppercase">Platform</th>
                <th className="px-5 py-3.5 text-left font-semibold text-muted-foreground tracking-wide text-xs uppercase">Content</th>
                <th className="px-5 py-3.5 text-left font-semibold text-muted-foreground tracking-wide text-xs uppercase">Scheduled</th>
                <th className="px-5 py-3.5 text-right font-semibold text-muted-foreground tracking-wide text-xs uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-muted-foreground text-sm">
                    No posts scheduled. Click &ldquo;New Post&rdquo; to create one.
                  </td>
                </tr>
              ) : (
                sorted.map((post, idx) => (
                  <tr
                    key={post.id}
                    className={clsx(
                      'border-b border-border last:border-0 transition-colors hover:bg-muted/30',
                      idx % 2 === 0 ? 'bg-card' : 'bg-muted/10',
                    )}
                  >
                    {/* Platform badge */}
                    <td className="px-5 py-4">
                      <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold', PLATFORM_STYLES[post.platform].badge)}>
                        <PlatformIcon platform={post.platform} className="h-3 w-3" />
                        {post.platform}
                      </span>
                    </td>

                    {/* Content preview */}
                    <td className="px-5 py-4 max-w-xs">
                      <p className="text-foreground line-clamp-2 leading-snug">{post.content}</p>
                    </td>

                    {/* Scheduled datetime */}
                    <td className="px-5 py-4 text-muted-foreground whitespace-nowrap">
                      {formatDateTime(post.scheduledDate, post.scheduledTime)}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditModal(post)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(post.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New / Edit Post Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeModal} />

          <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card shadow-xl mx-4">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-border">
              <h2 className="text-base font-semibold text-foreground">
                {editingPost ? 'Edit Post' : 'New Post'}
              </h2>
              <button
                onClick={closeModal}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} noValidate>
              <div className="px-6 py-5 space-y-4">

                {/* Platform */}
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">Platform</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['Facebook', 'Instagram'] as Platform[]).map(pl => (
                      <button
                        key={pl}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, platform: pl }))}
                        className={clsx(
                          'flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
                          form.platform === pl
                            ? pl === 'Facebook'
                              ? 'border-blue-300 bg-blue-50 text-blue-700'
                              : 'border-pink-300 bg-pink-50 text-pink-700'
                            : 'border-border bg-background text-foreground hover:bg-muted',
                        )}
                      >
                        {pl === 'Facebook'
                          ? <Facebook className="h-4 w-4" />
                          : <Instagram className="h-4 w-4" />}
                        {pl}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Content */}
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Post Content <span className="text-destructive">*</span>
                  </label>
                  <textarea
                    value={form.content}
                    onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                    rows={4}
                    placeholder="Write your post content here…"
                    className={clsx(
                      'w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:ring-2 focus:ring-primary/30 resize-none',
                      errors.content ? 'border-destructive' : 'border-border focus:border-primary',
                    )}
                  />
                  {errors.content && <p className="mt-1 text-xs text-destructive">{errors.content}</p>}
                </div>

                {/* Date + Time */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1.5">
                      Date <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="date"
                      value={form.scheduledDate}
                      onChange={e => setForm(f => ({ ...f, scheduledDate: e.target.value }))}
                      className={clsx(
                        'w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:ring-2 focus:ring-primary/30',
                        errors.scheduledDate ? 'border-destructive' : 'border-border focus:border-primary',
                      )}
                    />
                    {errors.scheduledDate && <p className="mt-1 text-xs text-destructive">{errors.scheduledDate}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1.5">
                      Time <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="time"
                      value={form.scheduledTime}
                      onChange={e => setForm(f => ({ ...f, scheduledTime: e.target.value }))}
                      className={clsx(
                        'w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:ring-2 focus:ring-primary/30',
                        errors.scheduledTime ? 'border-destructive' : 'border-border focus:border-primary',
                      )}
                    />
                    {errors.scheduledTime && <p className="mt-1 text-xs text-destructive">{errors.scheduledTime}</p>}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted/20 rounded-b-2xl">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  {editingPost ? 'Save Changes' : 'Schedule Post'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
