"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, FileText, ArrowRight, Inbox } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";

// ── Types ────────────────────────────────────────────────────────────────────

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

type Tab = "all" | "pdf" | "unread";

// ── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const mins = Math.round((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  if (d.toDateString() === new Date(now.getTime() - 86400000).toDateString())
    return "yesterday";
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function exactTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// ── Status (extraction-readiness, the operational state) ──────────────────────

function StatusCell({ hasAttachments }: { hasAttachments: boolean }) {
  if (hasAttachments) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        Ready to extract
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="size-1.5 rounded-full bg-muted-foreground/40" />
      No document
    </span>
  );
}

// ── Tab segmented control (navigates via existing ?tab= routes) ───────────────

function TabNav({ active, counts }: { active: Tab; counts: Record<Tab, number> }) {
  const tabs: { key: Tab; label: string; href: string }[] = [
    { key: "all", label: "All", href: "/mail" },
    { key: "pdf", label: "Ready", href: "/mail?tab=pdf" },
    { key: "unread", label: "New", href: "/mail?tab=unread" },
  ];
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5">
      {tabs.map((t) => {
        const isActive = active === t.key;
        return (
          <Link
            key={t.key}
            href={t.href}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              isActive
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            <span
              className={`tabular-nums ${
                isActive ? "text-muted-foreground" : "text-muted-foreground/70"
              }`}
            >
              {counts[t.key]}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

// ── Document queue ────────────────────────────────────────────────────────────

export function DocumentQueue({
  messages,
  activeTab,
  counts,
}: {
  messages: QueueMessage[];
  activeTab: Tab;
  counts: Record<Tab, number>;
}) {
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter(
      (m) =>
        m.fromName.toLowerCase().includes(q) ||
        (m.fromAddress ?? "").toLowerCase().includes(q) ||
        (m.subject ?? "").toLowerCase().includes(q)
    );
  }, [messages, query]);

  const readyCount = counts.pdf;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Top bar */}
      <div className="flex shrink-0 flex-col gap-3 border-b px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-base font-semibold tracking-tight">Applications</h1>
            <span className="text-xs text-muted-foreground tabular-nums">
              {readyCount} ready to process
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Outlook connected
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <TabNav active={activeTab} counts={counts} />
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search documents…"
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <div className="flex size-10 items-center justify-center rounded-lg border bg-muted/40">
              <Inbox className="size-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">No documents</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {query
                  ? "No documents match your search."
                  : "Nothing in this view yet."}
              </p>
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-6 text-xs font-medium text-muted-foreground">
                  Document
                </TableHead>
                <TableHead className="w-[170px] text-xs font-medium text-muted-foreground">
                  Status
                </TableHead>
                <TableHead className="w-[110px] text-xs font-medium text-muted-foreground">
                  Received
                </TableHead>
                <TableHead className="w-[150px] pr-6 text-right text-xs font-medium text-muted-foreground">
                  Action
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => (
                <TableRow key={m.id} className="group">
                  {/* Document — primary entity */}
                  <TableCell className="py-2.5 pl-6">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex size-9 shrink-0 items-center justify-center rounded-lg border ${
                          m.hasAttachments
                            ? "border-border bg-muted/50 text-foreground"
                            : "border-dashed border-border bg-transparent text-muted-foreground/50"
                        }`}
                      >
                        <FileText className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {m.subject || "Untitled document"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {m.hasAttachments ? "PDF · " : ""}
                          from {m.fromName}
                        </p>
                      </div>
                    </div>
                  </TableCell>

                  {/* Status — operational state */}
                  <TableCell>
                    <StatusCell hasAttachments={m.hasAttachments} />
                  </TableCell>

                  {/* Received — de-emphasized */}
                  <TableCell>
                    <span
                      className="text-xs text-muted-foreground tabular-nums"
                      title={exactTime(m.receivedDateTime)}
                    >
                      {relativeTime(m.receivedDateTime)}
                    </span>
                  </TableCell>

                  {/* Action — review/extraction entry point */}
                  <TableCell className="pr-6 text-right">
                    {m.hasAttachments ? (
                      <form action="/api/ingest" method="post" className="inline">
                        <input type="hidden" name="messageId" value={m.id} />
                        <input
                          type="hidden"
                          name="emailSubject"
                          value={m.subject ?? ""}
                        />
                        <button
                          type="submit"
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                        >
                          Process
                          <ArrowRight className="size-3.5" />
                        </button>
                      </form>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
