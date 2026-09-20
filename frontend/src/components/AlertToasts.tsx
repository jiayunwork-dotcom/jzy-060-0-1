import { useEffect } from 'react';
import { useDashboard } from '../store/dashboardStore';

/**
 * Popup notifications for fired alerts. Critical alerts stay until dismissed;
 * warnings auto-fade after 8s. Both levels are visually distinct.
 */
export default function AlertToasts() {
  const toasts = useDashboard((s) => s.toasts);
  const dismiss = useDashboard((s) => s.dismissToast);

  useEffect(() => {
    const timers = toasts
      .filter((t) => t.level === 'warning')
      .map((t) => setTimeout(() => dismiss(t.id), 8000));
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismiss]);

  if (!toasts.length) return null;
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.level}`} onClick={() => dismiss(t.id)}>
          <div className="toast-title">
            <span className={`toast-dot dot-${t.level}`} />
            {t.title}
            <span className="toast-time">
              {new Date(t.at).toLocaleTimeString('zh-CN', { hour12: false })}
            </span>
          </div>
          <div className="toast-body">{t.body}</div>
        </div>
      ))}
    </div>
  );
}
