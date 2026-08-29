interface UnreadCountBadgeProps {
  unreadCount: number;
  maxVisibleCount?: number;
}

export default function UnreadCountBadge({
  unreadCount,
  maxVisibleCount = 9,
}: UnreadCountBadgeProps) {
  const visibleLabel = unreadCount > maxVisibleCount ? `${maxVisibleCount}+` : String(unreadCount);
  const announcement =
    unreadCount === 0
      ? "No unread notifications"
      : `${unreadCount} unread notifications`;

  return (
    <>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
      {unreadCount > 0 && (
        <span
          className="absolute top-1.5 right-1.5 block h-4 min-w-4 px-1 rounded-full bg-red-500 text-[10px] font-bold text-white border-2 border-stellar-card leading-none flex items-center justify-center"
          aria-hidden="true"
        >
          {visibleLabel}
        </span>
      )}
    </>
  );
}
