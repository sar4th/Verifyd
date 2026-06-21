// ─── Shared types & utilities for the split-screen inbox ────────────────────

// The shape passed from the server component to the client inbox.
export type QueueMessage = {
  id: string;
  subject: string | null;
  bodyPreview: string | null;
  receivedDateTime: string;
  isRead: boolean;
  hasAttachments: boolean;
  fromName: string;
  fromAddress: string | null;
};

export type FilterKey = "all" | "unread" | "attachments";

// ── Avatar helpers ────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-rose-500",
  "bg-blue-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-cyan-500",
  "bg-pink-500",
  "bg-indigo-500",
] as const;

export function getAvatarColor(name: string | null): string {
  const str = name ?? "";
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] ?? "bg-blue-500";
}

export function getInitials(name: string | null, address: string | null): string {
  const source = name || address || "?";
  const parts = source.split(/[\s@]+/).filter(Boolean);
  if (parts.length >= 2)
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

// ── Time formatters ───────────────────────────────────────────────────────────

export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const days = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (days === 0)
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  if (days < 7) return date.toLocaleDateString("en-US", { weekday: "short" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ── Size formatter ────────────────────────────────────────────────────────────

const BYTES_PER_KB = 1024;
const BYTES_PER_MB = 1024 * 1024;

export function formatSize(bytes: number): string {
  if (bytes >= BYTES_PER_MB) return `${(bytes / BYTES_PER_MB).toFixed(1)} MB`;
  if (bytes >= BYTES_PER_KB) return `${Math.round(bytes / BYTES_PER_KB)} KB`;
  return `${bytes} B`;
}

// ── Filter definitions ────────────────────────────────────────────────────────

export const FILTERS: Array<{
  key: FilterKey;
  label: string;
  filterFn: (msg: QueueMessage) => boolean;
}> = [
  { key: "all", label: "All", filterFn: () => true },
  { key: "unread", label: "Unread", filterFn: (m) => !m.isRead },
  { key: "attachments", label: "Attachments", filterFn: (m) => m.hasAttachments },
];
