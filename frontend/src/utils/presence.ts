export interface PresenceStatusDisplay {
  isActiveNow: boolean;
  label: string;
  shortLabel: string;
}

export function formatLastSeenStatus(
  lastSeenAt?: string | null,
  activeLastMinute?: boolean,
  nowMs = Date.now()
): PresenceStatusDisplay {
  if (lastSeenAt) {
    const ts = new Date(lastSeenAt).getTime();
    if (!Number.isNaN(ts)) {
      const diffSec = Math.max(0, Math.floor((nowMs - ts) / 1000));
      if (diffSec <= 65) {
        return {
          isActiveNow: true,
          label: 'Active now (last minute)',
          shortLabel: 'Active last min',
        };
      }
      if (diffSec < 3600) {
        const mins = Math.max(1, Math.floor(diffSec / 60));
        return {
          isActiveNow: false,
          label: `Last seen ${mins}m ago`,
          shortLabel: `${mins}m ago`,
        };
      }
      if (diffSec < 86400) {
        const hrs = Math.floor(diffSec / 3600);
        return {
          isActiveNow: false,
          label: `Last seen ${hrs}h ago`,
          shortLabel: `${hrs}h ago`,
        };
      }
      const days = Math.floor(diffSec / 86400);
      return {
        isActiveNow: false,
        label: `Last seen ${days}d ago`,
        shortLabel: `${days}d ago`,
      };
    }
  }

  if (activeLastMinute) {
    return {
      isActiveNow: true,
      label: 'Active now (last minute)',
      shortLabel: 'Active last min',
    };
  }

  return {
    isActiveNow: false,
    label: 'Last seen recently',
    shortLabel: 'Offline',
  };
}

export function formatEtaClock(
  isoOrNull?: string | null,
  fallbackMinutes?: number | null
): string {
  if (isoOrNull) {
    const d = new Date(isoOrNull);
    if (!Number.isNaN(d.getTime())) {
      const clock = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (fallbackMinutes && fallbackMinutes > 0) {
        return `~${fallbackMinutes} min (by ${clock})`;
      }
      return `by ${clock}`;
    }
  }
  if (fallbackMinutes && fallbackMinutes > 0) {
    return `~${fallbackMinutes} min`;
  }
  return 'Confirmed upon acceptance';
}
