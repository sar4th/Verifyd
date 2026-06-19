"use client";

import { Inbox, Paperclip } from "lucide-react";
import {
  type FilterKey,
  type QueueMessage,
  FILTERS,
  formatRelativeTime,
  getAvatarColor,
  getInitials,
} from "./inbox-helpers";

// ── Filter pills ──────────────────────────────────────────────────────────────

function FilterPills({
  active,
  counts,
  onSelect,
}: {
  active: FilterKey;
  counts: Record<FilterKey, number>;
  onSelect: (key: FilterKey) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto border-b px-3 py-2.5">
      {FILTERS.map((f) => {
        const isActive = active === f.key;
        return (
          <button
            key={f.key}
            type="button"
            onClick={() => onSelect(f.key)}
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              isActive
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
            }`}
          >
            {f.label}
            <span className="ml-1 tabular-nums opacity-70">{counts[f.key]}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Individual message card ───────────────────────────────────────────────────

function MessageCard({
  msg,
  selected,
  onClick,
}: {
  msg: QueueMessage;
  selected: boolean;
  onClick: () => void;
}) {
  const isUnread = !msg.isRead;
  const avatarColor = getAvatarColor(msg.fromName);
  const initials = getInitials(msg.fromName, msg.fromAddress);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? "true" : undefined}
      className={`group flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0 ${
        selected ? "bg-muted" : "hover:bg-muted/50"
      }`}
    >
      {/* Avatar with unread indicator */}
      <div className="relative shrink-0 pt-0.5">
        <div
          className={`flex size-9 items-center justify-center rounded-full text-xs font-semibold text-white ${avatarColor}`}
          aria-hidden
        >
          {initials}
        </div>
        {isUnread && (
          <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-brand ring-2 ring-background" />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 space-y-0.5">
        {/* Row 1: sender + time */}
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={`truncate text-sm ${isUnread ? "font-semibold" : "font-medium"}`}
            title={msg.fromName}
          >
            {msg.fromName}
          </span>
          <span
            suppressHydrationWarning
            className="shrink-0 text-xs tabular-nums text-muted-foreground"
          >
            {formatRelativeTime(msg.receivedDateTime)}
          </span>
        </div>

        {/* Row 2: subject */}
        <p
          className={`truncate text-sm ${
            isUnread ? "font-medium text-foreground" : "text-foreground/80"
          }`}
        >
          {msg.subject || "(no subject)"}
        </p>

        {/* Row 3: preview + indicators */}
        <div className="flex items-center gap-1.5">
          {msg.bodyPreview && (
            <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {msg.bodyPreview}
            </p>
          )}
          {msg.hasAttachments && (
            <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-brand">
              <Paperclip className="size-3" aria-hidden />
              Ready
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Message list ──────────────────────────────────────────────────────────────

interface MessageListProps {
  messages: QueueMessage[];
  filteredMessages: QueueMessage[];
  selectedId: string | null;
  activeFilter: FilterKey;
  counts: Record<FilterKey, number>;
  onSelect: (msg: QueueMessage) => void;
  onFilterChange: (key: FilterKey) => void;
}

export function MessageList({
  messages: _messages,
  filteredMessages,
  selectedId,
  activeFilter,
  counts,
  onSelect,
  onFilterChange,
}: MessageListProps) {
  return (
    <section className="flex min-h-0 flex-1 flex-col border-r bg-background">
      {/* Filter pills */}
      <FilterPills active={activeFilter} counts={counts} onSelect={onFilterChange} />

      {/* Message cards */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {filteredMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <div className="flex size-10 items-center justify-center rounded-lg border bg-muted/40">
              <Inbox className="size-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">No messages</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Nothing matches this filter.
              </p>
            </div>
          </div>
        ) : (
          filteredMessages.map((msg) => (
            <MessageCard
              key={msg.id}
              msg={msg}
              selected={msg.id === selectedId}
              onClick={() => onSelect(msg)}
            />
          ))
        )}
      </div>
    </section>
  );
}
