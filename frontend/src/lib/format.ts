export function currency(value: number | null | undefined, code = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: code || "USD",
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

export function compactCurrency(value: number | null | undefined, code = "USD"): string {
  const amount = Number(value ?? 0);
  if (Math.abs(amount) >= 1000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code || "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount);
  }
  return currency(amount, code);
}

export function number(value: number | null | undefined): string {
  return new Intl.NumberFormat("en-US").format(Number(value ?? 0));
}

export function percent(value: number | null | undefined, digits = 1): string {
  return `${Number(value ?? 0).toFixed(digits)}%`;
}

export function date(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function relative(value: string | null | undefined): string {
  if (!value) return "—";
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date(value);
}

export function initials(name: string | null | undefined): string {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

const tones: Record<string, string> = {
  active: "emerald",
  delivered: "emerald",
  paid: "emerald",
  completed: "emerald",
  fulfilled: "emerald",
  connected: "emerald",
  pending: "amber",
  unpaid: "amber",
  draft: "zinc",
  processing: "blue",
  confirmed: "blue",
  ordered: "blue",
  partiallyfulfilled: "blue",
  partial: "blue",
  shipped: "indigo",
  disabled: "zinc",
  notconnected: "zinc",
  archived: "zinc",
  refunded: "violet",
  cancelled: "rose",
  failed: "rose",
  deadlettered: "rose",
  revoked: "rose",
  overdue: "rose",
  low: "rose",
};

export function statusTone(status: string | null | undefined): string {
  const key = (status ?? "").replace(/\s+/g, "").toLowerCase();
  return tones[key] ?? "zinc";
}

export function statusLabel(status: string | null | undefined): string {
  if (!status) return "Unknown";
  return status
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function csvDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
