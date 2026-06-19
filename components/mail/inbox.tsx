"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DetailPane } from "./detail-pane";
import { MessageList } from "./message-list";
import {
  type FilterKey,
  type QueueMessage,
  FILTERS,
} from "./inbox-helpers";

// ─── Keyboard navigation ───────────────────────────────────────────────────────

function stepSelection(
  messages: QueueMessage[],
  currentId: string | null,
  step: number
): string | null {
  if (messages.length === 0) return currentId;
  const idx = messages.findIndex((m) => m.id === currentId);
  if (idx === -1) return messages[0]?.id ?? currentId;
  const next = Math.min(messages.length - 1, Math.max(0, idx + step));
  return messages[next]?.id ?? currentId;
}

function shouldIgnoreKeyEvent(e: KeyboardEvent): boolean {
  const target = e.target instanceof HTMLElement ? e.target : null;
  return Boolean(
    target?.closest('input, textarea, select, [role="dialog"], [contenteditable="true"]')
  );
}

// ─── Inbox (root client component) ────────────────────────────────────────────

interface InboxProps {
  messages: QueueMessage[];
  initialFilter?: FilterKey;
}

export function Inbox({ messages, initialFilter = "all" }: InboxProps) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>(initialFilter);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Follow the sidebar: when the page navigates to a new ?view, refilter even if
  // React reuses this instance instead of remounting.
  useEffect(() => {
    setActiveFilter(initialFilter);
  }, [initialFilter]);

  // ── Derived lists ──────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const filterFn = FILTERS.find((f) => f.key === activeFilter)?.filterFn ?? (() => true);
    const q = query.trim().toLowerCase();
    return messages.filter(filterFn).filter((m) => {
      if (!q) return true;
      return (
        m.fromName.toLowerCase().includes(q) ||
        (m.fromAddress ?? "").toLowerCase().includes(q) ||
        (m.subject ?? "").toLowerCase().includes(q)
      );
    });
  }, [messages, activeFilter, query]);

  const selectedMessage = useMemo(
    () => messages.find((m) => m.id === selectedId) ?? null,
    [messages, selectedId]
  );

  const counts = useMemo(
    (): Record<FilterKey, number> => ({
      all: messages.length,
      unread: messages.filter((m) => !m.isRead).length,
      attachments: messages.filter((m) => m.hasAttachments).length,
    }),
    [messages]
  );

  // ── Keyboard nav ───────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shouldIgnoreKeyEvent(e)) return;
      if (e.key === "Escape") {
        setSelectedId(null);
        return;
      }
      if (e.key === "/" && !selectedId) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setSelectedId((prev) => stepSelection(filtered, prev, step));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, selectedId]);

  const handleSelect = useCallback((msg: QueueMessage) => {
    setSelectedId(msg.id);
  }, []);

  const handleClose = useCallback(() => {
    setSelectedId(null);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* ── Left list pane ───────────────────────────────────────────────── */}
      <div
        className={`flex min-h-0 flex-col lg:w-[400px] lg:shrink-0 ${
          selectedMessage ? "hidden lg:flex" : "flex w-full"
        }`}
      >
        {/* Search */}
        <div className="shrink-0 border-b px-3 py-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='Search messages… ("/" to focus)'
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>

        {/* Filtered list */}
        <MessageList
          messages={messages}
          filteredMessages={filtered}
          selectedId={selectedId}
          activeFilter={activeFilter}
          counts={counts}
          onSelect={handleSelect}
          onFilterChange={setActiveFilter}
        />
      </div>

      {/* ── Right detail pane ────────────────────────────────────────────── */}
      <DetailPane message={selectedMessage} onClose={handleClose} />
    </div>
  );
}
