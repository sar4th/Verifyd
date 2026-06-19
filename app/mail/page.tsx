import { cookies } from "next/headers";
import Link from "next/link";
import { TOKEN_COOKIE } from "@/lib/auth";
import { db } from "@/lib/db";
import { Inbox } from "lucide-react";
import { Inbox as InboxClient } from "@/components/mail/inbox";
import type { FilterKey, QueueMessage } from "@/components/mail/inbox-helpers";
import { Sidebar, type SidebarKey } from "@/components/mail/sidebar";

// ─── Types ─────────────────────────────────────────────────────────────────

type GraphMessage = {
  id: string;
  subject: string | null;
  bodyPreview: string | null;
  receivedDateTime: string;
  isRead: boolean;
  hasAttachments: boolean;
  from: {
    emailAddress: { name: string | null; address: string | null };
  } | null;
};

// ─── Data ──────────────────────────────────────────────────────────────────

const GRAPH_URL =
  "https://graph.microsoft.com/v1.0/me/messages" +
  "?$top=50" +
  "&$orderby=receivedDateTime desc" +
  "&$select=id,subject,bodyPreview,receivedDateTime,isRead,hasAttachments,from";

async function getMessages(token: string): Promise<GraphMessage[]> {
  const res = await fetch(GRAPH_URL, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Graph request failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { value: GraphMessage[] };
  return data.value;
}

// ─── Page ──────────────────────────────────────────────────────────────────

// Map the sidebar "view" query param to inbox filter + active nav key.
const VIEW_TO_FILTER: Record<string, FilterKey> = {
  ready: "attachments",
  new: "unread",
  all: "all",
};

export default async function MailPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const activeFilter: FilterKey = VIEW_TO_FILTER[view ?? "all"] ?? "all";
  const activeNav: SidebarKey =
    view === "ready" ? "ready" : view === "new" ? "new" : "all";
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;

  // ── Unauthenticated ──────────────────────────────────────────────────────
  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8">
        <div className="w-full max-w-sm rounded-xl border p-8 text-center">
          <div className="mx-auto mb-5 flex size-10 items-center justify-center rounded-lg border bg-muted/40">
            <Inbox className="size-5 text-muted-foreground" />
          </div>
          <h2 className="text-base font-semibold tracking-tight">Not connected</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Your session has expired. Reconnect your Microsoft account to continue.
          </p>
          <Link
            href="/api/auth/login"
            className="mt-6 inline-flex h-9 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Reconnect Outlook
          </Link>
        </div>
      </div>
    );
  }

  // ── Fetch ────────────────────────────────────────────────────────────────
  let messages: GraphMessage[] = [];
  let error: string | null = null;
  try {
    messages = await getMessages(token);
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  const pdfCount = messages.filter((m) => m.hasAttachments).length;
  const unreadCount = messages.filter((m) => !m.isRead).length;

  // Pipeline counts come from ingested documents, independent of the inbox.
  const allDocs = db.documents.all();
  const reviewCount = allDocs.filter((d) => !d.published).length;
  const completedCount = allDocs.filter((d) => d.published).length;

  const navCounts = {
    all: messages.length,
    ready: pdfCount,
    new: unreadCount,
    review: reviewCount,
    completed: completedCount,
  };

  const VIEW_TITLE: Record<string, { title: string; sub: string }> = {
    all:   { title: "All Applications", sub: `${messages.length} messages` },
    ready: { title: "Ready to Process", sub: `${pdfCount} with attachments` },
    new:   { title: "New Arrivals",     sub: `${unreadCount} unread` },
  };
  const heading = VIEW_TITLE[view ?? "all"] ?? VIEW_TITLE.all;

  const queueRows: QueueMessage[] = messages.map((m) => ({
    id: m.id,
    subject: m.subject,
    bodyPreview: m.bodyPreview,
    receivedDateTime: m.receivedDateTime,
    isRead: m.isRead,
    hasAttachments: m.hasAttachments,
    fromName: m.from?.emailAddress.name || "Unknown sender",
    fromAddress: m.from?.emailAddress.address ?? null,
  }));

  // ── Layout ───────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar active={activeNav} counts={navCounts} />

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b px-5">
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-base font-semibold tracking-tight">{heading.title}</h1>
            <span className="text-xs text-muted-foreground tabular-nums">{heading.sub}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Outlook connected
          </div>
        </div>

        {error ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <div className="max-w-md rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              <p className="font-medium">Failed to load messages</p>
              <p className="mt-1 text-destructive/80">{error}</p>
            </div>
          </div>
        ) : (
          <InboxClient key={view ?? "all"} messages={queueRows} initialFilter={activeFilter} />
        )}
      </div>
    </div>
  );
}
