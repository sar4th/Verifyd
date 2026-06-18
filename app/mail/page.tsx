import { cookies } from "next/headers";
import Link from "next/link";
import { TOKEN_COOKIE } from "@/lib/auth";
import {
  Inbox,
  FileText,
  Loader2,
  ClipboardCheck,
  CheckCircle2,
  Settings,
  Plug,
} from "lucide-react";
import { DocumentQueue, type QueueMessage } from "@/components/mail/document-queue";

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

export default async function MailPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
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

  const activeTab: "all" | "pdf" | "unread" =
    tab === "pdf" ? "pdf" : tab === "unread" ? "unread" : "all";

  const filtered =
    activeTab === "pdf"
      ? messages.filter((m) => m.hasAttachments)
      : activeTab === "unread"
      ? messages.filter((m) => !m.isRead)
      : messages;

  const queueRows: QueueMessage[] = filtered.map((m) => ({
    id: m.id,
    subject: m.subject,
    bodyPreview: m.bodyPreview,
    receivedDateTime: m.receivedDateTime,
    isRead: m.isRead,
    hasAttachments: m.hasAttachments,
    fromName: m.from?.emailAddress.name || "Unknown sender",
    fromAddress: m.from?.emailAddress.address ?? null,
  }));

  const counts = { all: messages.length, pdf: pdfCount, unread: unreadCount };

  // ── Layout ───────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="hidden w-[224px] shrink-0 flex-col border-r bg-sidebar lg:flex">
        {/* Brand */}
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <div className="flex size-6 items-center justify-center rounded-md bg-primary">
            <span className="text-[13px] font-semibold text-primary-foreground">V</span>
          </div>
          <span className="text-sm font-semibold tracking-tight">Verifyd</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <p className="px-2 pb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground">
            Workspace
          </p>
          <NavItem href="/mail" active={activeTab === "all"} icon={<Inbox className="size-4" />} count={messages.length}>
            All Applications
          </NavItem>
          <NavItem href="/mail?tab=pdf" active={activeTab === "pdf"} icon={<FileText className="size-4" />} count={pdfCount}>
            Ready to Process
          </NavItem>
          <NavItem href="/mail?tab=unread" active={activeTab === "unread"} icon={<Loader2 className="size-4" />} count={unreadCount}>
            New Arrivals
          </NavItem>

          <p className="px-2 pt-5 pb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground">
            Pipeline
          </p>
          <NavItem href="/mail" icon={<ClipboardCheck className="size-4" />}>
            Review Queue
          </NavItem>
          <NavItem href="/mail" icon={<CheckCircle2 className="size-4" />}>
            Completed
          </NavItem>
        </nav>

        {/* Bottom */}
        <div className="border-t p-2">
          <div className="mb-1 flex items-center gap-2.5 rounded-md px-2 py-2">
            <div className="flex size-7 items-center justify-center rounded-md border bg-background">
              <Plug className="size-3.5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">Outlook</p>
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                Connected
              </p>
            </div>
          </div>
          <NavItem href="/" icon={<Settings className="size-4" />}>
            Settings
          </NavItem>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {error ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <div className="max-w-md rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              <p className="font-medium">Failed to load messages</p>
              <p className="mt-1 text-destructive/80">{error}</p>
            </div>
          </div>
        ) : (
          <DocumentQueue messages={queueRows} activeTab={activeTab} counts={counts} />
        )}
      </div>
    </div>
  );
}

// ─── Sidebar nav item ────────────────────────────────────────────────────────

function NavItem({
  href,
  active,
  icon,
  count,
  children,
}: {
  href: string;
  active?: boolean;
  icon: React.ReactNode;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors ${
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
      }`}
    >
      <span className={active ? "text-foreground" : "text-muted-foreground"}>{icon}</span>
      <span className="flex-1 truncate">{children}</span>
      {typeof count === "number" && count > 0 && (
        <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
      )}
    </Link>
  );
}
