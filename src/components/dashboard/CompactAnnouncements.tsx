import { useEffect, useState } from 'react';
import {
  Megaphone,
  Info,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  Building2,
  X,
  ChevronRight,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { cn } from '../../lib/utils';

type AnnouncementPriority = 'info' | 'success' | 'warning' | 'critical';

interface Announcement {
  id: string;
  title: string;
  message: string;
  priority: AnnouncementPriority;
  starts_at: string | null;
  ends_at: string | null;
  company_id: string | null;
  created_at: string;
  companies?: { name: string } | null;
}

const PRIORITY_STYLES: Record<AnnouncementPriority, { wrap: string; iconWrap: string; icon: any; label: string }> = {
  info: { wrap: 'bg-sky-50 border-sky-200', iconWrap: 'bg-sky-100 text-sky-700', icon: Info, label: 'Info' },
  success: {
    wrap: 'bg-emerald-50 border-emerald-200',
    iconWrap: 'bg-emerald-100 text-emerald-700',
    icon: CheckCircle2,
    label: 'Update',
  },
  warning: {
    wrap: 'bg-amber-50 border-amber-200',
    iconWrap: 'bg-amber-100 text-amber-700',
    icon: AlertTriangle,
    label: 'Warning',
  },
  critical: {
    wrap: 'bg-rose-50 border-rose-200',
    iconWrap: 'bg-rose-100 text-rose-700',
    icon: AlertOctagon,
    label: 'Critical',
  },
};

export function CompactAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Announcement | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('announcements')
        .select('id,title,message,priority,starts_at,ends_at,company_id,created_at,companies(name)')
        .eq('is_active', true)
        .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
        .or(`ends_at.is.null,ends_at.gte.${nowIso}`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setAnnouncements((data || []) as unknown as Announcement[]);
    } catch (error) {
      console.error('Error loading announcements:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <Megaphone className="w-4 h-4" />
          Loading announcements...
        </div>
      </div>
    );
  }

  if (announcements.length === 0) return null;

  const latest = announcements[0];
  const style = PRIORITY_STYLES[latest.priority] || PRIORITY_STYLES.info;
  const Icon = style.icon;

  return (
    <>
      <button
        type="button"
        onClick={() => setSelected(latest)}
        className={cn(
          'w-full text-left flex items-center gap-3 px-3.5 py-2.5 rounded-xl border transition hover:shadow-sm',
          style.wrap
        )}
      >
        <div className={cn('p-1.5 rounded-lg flex-shrink-0', style.iconWrap)}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1 flex items-center gap-2">
          <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-white/70 border border-slate-200 text-slate-600 flex-shrink-0">
            {style.label}
          </span>
          <span className="font-semibold text-sm text-slate-900 truncate">{latest.title}</span>
          <span className="text-xs text-slate-600 truncate hidden sm:inline">— {latest.message}</span>
        </div>
        {announcements.length > 1 && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              setShowAll(true);
            }}
            className="text-xs font-medium text-slate-600 hover:text-slate-900 flex items-center gap-0.5 flex-shrink-0"
          >
            View all ({announcements.length})
            <ChevronRight className="w-3.5 h-3.5" />
          </span>
        )}
      </button>

      {showAll && (
        <AnnouncementListModal
          announcements={announcements}
          onSelect={(a) => {
            setShowAll(false);
            setSelected(a);
          }}
          onClose={() => setShowAll(false)}
        />
      )}

      {selected && <AnnouncementModal announcement={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function AnnouncementListModal({
  announcements,
  onSelect,
  onClose,
}: {
  announcements: Announcement[];
  onSelect: (a: Announcement) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900">All Announcements</h3>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-md hover:bg-slate-100">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <div className="overflow-y-auto p-2">
          {announcements.map((a) => {
            const style = PRIORITY_STYLES[a.priority] || PRIORITY_STYLES.info;
            const Icon = style.icon;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onSelect(a)}
                className="w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition"
              >
                <div className={cn('p-1.5 rounded-lg flex-shrink-0', style.iconWrap)}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 truncate">{a.title}</p>
                  <p className="text-xs text-slate-500 truncate">{a.message}</p>
                </div>
                <span className="text-xs text-slate-400 flex-shrink-0">
                  {new Date(a.created_at).toLocaleDateString()}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AnnouncementModal({ announcement, onClose }: { announcement: Announcement; onClose: () => void }) {
  const style = PRIORITY_STYLES[announcement.priority] || PRIORITY_STYLES.info;
  const Icon = style.icon;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={cn('flex items-start gap-4 px-6 py-5 border-b', style.wrap)}>
          <div className={cn('p-2.5 rounded-lg flex-shrink-0', style.iconWrap)}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-slate-900 text-xl leading-snug">{announcement.title}</h3>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/80 border border-slate-200 text-xs font-medium text-slate-600">
                <Building2 className="w-3 h-3" />
                {announcement.company_id ? (announcement.companies?.name ?? 'Specific Company') : 'All Companies'}
              </span>
              <span className="text-xs text-slate-500">{new Date(announcement.created_at).toLocaleString()}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto">
          <p className="text-sm sm:text-base text-slate-700 whitespace-pre-wrap leading-relaxed">
            {announcement.message}
          </p>
        </div>
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
