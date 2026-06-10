import { useState, useEffect, useCallback, useRef } from 'react';
import { Bell, X, CheckCircle, XCircle, RotateCcw, Send, Ban, UserCheck, Info, CheckCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ViewType } from './Layout';

interface Notification {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  request_type: string | null;
  request_number: string | null;
  request_id: string | null;
  target_view: string | null;
  is_read: boolean;
  created_at: string;
}

interface NotificationPanelProps {
  onNavigate: (view: ViewType) => void;
}

function getRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getNotificationIcon(type: string) {
  switch (type) {
    case 'approval': return <CheckCircle size={18} className="text-emerald-500" />;
    case 'rejection': return <XCircle size={18} className="text-red-500" />;
    case 'return': return <RotateCcw size={18} className="text-amber-500" />;
    case 'submission': return <Send size={18} className="text-blue-500" />;
    case 'cancellation': return <Ban size={18} className="text-slate-500" />;
    case 'account': return <UserCheck size={18} className="text-indigo-500" />;
    default: return <Info size={18} className="text-slate-400" />;
  }
}

export function NotificationBell({ onNavigate }: NotificationPanelProps) {
  const { profile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [pulse, setPulse] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 30;

  const fetchNotifications = useCallback(async (offset = 0, append = false) => {
    if (!profile?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('user_notifications')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (data) {
      if (append) {
        setNotifications(prev => [...prev, ...data]);
      } else {
        setNotifications(data);
      }
      setHasMore(data.length === PAGE_SIZE);
    }
    setLoading(false);
  }, [profile?.id]);

  const fetchUnreadCount = useCallback(async () => {
    if (!profile?.id) return;
    const { count } = await supabase
      .from('user_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', profile.id)
      .eq('is_read', false);
    setUnreadCount(count || 0);
  }, [profile?.id]);

  useEffect(() => {
    fetchUnreadCount();
    fetchNotifications();
  }, [fetchUnreadCount, fetchNotifications]);

  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel('user_notifications_realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_notifications',
          filter: `user_id=eq.${profile.id}`,
        },
        (payload) => {
          const newNotif = payload.new as Notification;
          setNotifications(prev => [newNotif, ...prev]);
          setUnreadCount(prev => prev + 1);
          setPulse(true);
          setTimeout(() => setPulse(false), 2000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  const markAsRead = async (id: string) => {
    await supabase
      .from('user_notifications')
      .update({ is_read: true })
      .eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllAsRead = async () => {
    if (!profile?.id) return;
    await supabase
      .from('user_notifications')
      .update({ is_read: true })
      .eq('user_id', profile.id)
      .eq('is_read', false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }
    if (notification.target_view) {
      onNavigate(notification.target_view as ViewType);
    }
    setIsOpen(false);
  };

  const loadMore = () => {
    fetchNotifications(notifications.length, true);
  };

  return (
    <>
      {/* Bell Icon */}
      <button
        onClick={() => setIsOpen(true)}
        className="relative p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
        title="Notifications"
      >
        <Bell size={20} className={`text-slate-600 ${pulse ? 'animate-bounce' : ''}`} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-[60] transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Slide-out Panel */}
      <div
        ref={panelRef}
        className={`fixed top-0 right-0 h-full w-full sm:w-[400px] bg-white shadow-2xl z-[70] transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Panel Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            <Bell size={20} className="text-slate-700" />
            <h2 className="text-lg font-semibold text-slate-900">Notifications</h2>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700">
                {unreadCount} new
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <CheckCheck size={14} />
                Mark all read
              </button>
            )}
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors"
            >
              <X size={20} className="text-slate-600" />
            </button>
          </div>
        </div>

        {/* Notification List */}
        <div className="overflow-y-auto h-[calc(100%-65px)]">
          {notifications.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <Bell size={40} className="mb-3 opacity-40" />
              <p className="text-sm font-medium">No notifications yet</p>
              <p className="text-xs mt-1">System activity will appear here</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {notifications.map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`w-full text-left px-5 py-3.5 hover:bg-slate-50 transition-colors flex gap-3 items-start ${!notification.is_read ? 'bg-blue-50/40' : ''}`}
                >
                  {/* Unread indicator */}
                  <div className="flex-shrink-0 mt-0.5 relative">
                    {getNotificationIcon(notification.notification_type)}
                    {!notification.is_read && (
                      <span className="absolute -top-0.5 -left-0.5 w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-white" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-tight ${!notification.is_read ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'}`}>
                      {notification.title}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                      {notification.message}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {getRelativeTime(notification.created_at)}
                    </p>
                  </div>
                </button>
              ))}

              {hasMore && (
                <div className="px-5 py-3">
                  <button
                    onClick={loadMore}
                    disabled={loading}
                    className="w-full py-2 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Loading...' : 'Load more'}
                  </button>
                </div>
              )}
            </div>
          )}

          {loading && notifications.length === 0 && (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-300 border-t-blue-600" />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
