"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  Mail,
  Paperclip,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { EmailHtmlView } from "@/components/email/email-html-view";
import {
  ExtractionPanel,
  type ExtractionData,
} from "@/components/extraction/extraction-panel";

// ─── Types ─────────────────────────────────────────────────────────────────

type DocStatus = "ingested" | "extracted" | "failed";

type EmailDoc = {
  id: string;
  fileName: string;
  status: DocStatus;
  createdAt: string;
  extraction: ExtractionData;
};

type EmailData = {
  email: {
    id: string;
    subject: string | null;
    bodyPreview: string | null;
    receivedDateTime: string;
    fromName: string | null;
    fromAddress: string | null;
    to: string[];
    bodyHtml: string | null;
    bodyText: string | null;
  };
  documents: EmailDoc[];
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function initials(name: string | null, address: string | null): string {
  const src = (name || address || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function fullDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const STATUS_META: Record<DocStatus, { label: string; dot: string; text: string; icon: React.ReactNode }> = {
  ingested:  {
    label: "Pending",
    dot: "bg-amber-400",
    text: "text-amber-700",
    icon: <span className="size-1.5 rounded-full bg-amber-400" />,
  },
  extracted: {
    label: "Extracted",
    dot: "bg-emerald-500",
    text: "text-emerald-700",
    icon: <CheckCircle2 className="size-3 text-emerald-600" />,
  },
  failed: {
    label: "Failed",
    dot: "bg-red-500",
    text: "text-red-700",
    icon: <XCircle className="size-3 text-red-500" />,
  },
};

// ─── Page ───────────────────────────────────────────────────────────────────

export default function EmailWorkspace() {
  const { messageId } = useParams<{ messageId: string }>();

  const [data, setData] = useState<EmailData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [extractingAll, setExtractingAll] = useState(false);
  // Per-document extraction progress tracking
  const [extractProgress, setExtractProgress] = useState<{ done: number; total: number } | null>(null);

  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  // Left viewer: "email" or a document id.
  const [view, setView] = useState<string>("email");
  const [pdfPage, setPdfPage] = useState(1);

  const load = useCallback(async () => {
    const res = await fetch(`/api/email/${messageId}`);
    if (!res.ok) {
      setLoadError(res.status === 401 ? "Your session expired. Reconnect Outlook." : "Failed to load email.");
      return;
    }
    const d = (await res.json()) as EmailData;
    setData(d);
    setActiveDocId((cur) => cur ?? d.documents[0]?.id ?? null);
  }, [messageId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const docs = data?.documents ?? [];
  const activeDoc = useMemo(
    () => docs.find((d) => d.id === activeDocId) ?? null,
    [docs, activeDocId]
  );
  const pendingCount = docs.filter((d) => d.status !== "extracted").length;
  const extractedCount = docs.filter((d) => d.status === "extracted").length;
  const failedCount = docs.filter((d) => d.status === "failed").length;

  // Reset the page fragment whenever we switch which document is shown.
  const showDoc = useCallback((id: string) => {
    setActiveDocId(id);
    setView(id);
    setPdfPage(1);
  }, []);

  const onActivePage = useCallback(
    (page: number) => {
      if (!activeDocId) return;
      // Following a field jumps the source view to its document + page.
      setView((v) => (v === activeDocId ? v : activeDocId));
      setPdfPage((p) => (p === page ? p : page));
    },
    [activeDocId]
  );

  const extractAll = useCallback(async () => {
    setExtractingAll(true);
    const pending = docs.filter((d) => d.status !== "extracted");
    setExtractProgress({ done: 0, total: pending.length });
    try {
      for (let i = 0; i < pending.length; i++) {
        const d = pending[i];
        await fetch(`/api/documents/${d.id}/extract`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "gemini" }),
        }).catch(() => undefined); // error-isolated: one failure must not abort the rest
        setExtractProgress({ done: i + 1, total: pending.length });
      }
      await load();
    } finally {
      setExtractingAll(false);
      setExtractProgress(null);
    }
  }, [docs, load]);

  // ── Loading / error states ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl border bg-muted/40">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">Loading workspace…</p>
      </div>
    );
  }
  if (loadError || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl border border-destructive/20 bg-destructive/5">
          <TriangleAlert className="size-5 text-destructive" />
        </div>
        <div>
          <p className="font-medium text-foreground">Something went wrong</p>
          <p className="mt-1 text-sm text-muted-foreground">{loadError ?? "Failed to load this email."}</p>
        </div>
        <Link
          href="/mail"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <ArrowLeft className="size-3.5" />
          Back to inbox
        </Link>
      </div>
    );
  }

  const { email } = data;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* ── Header ── */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/mail"
            className="flex size-7 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Back to inbox"
          >
            <ArrowLeft className="size-4" />
          </Link>

          {/* Sender avatar */}
          <div
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground"
            aria-hidden
          >
            {initials(email.fromName, email.fromAddress)}
          </div>

          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold leading-tight">
              {email.subject || "(no subject)"}
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              {email.fromName || email.fromAddress || "Unknown sender"}
              <span className="mx-1.5 opacity-30">·</span>
              {fullDate(email.receivedDateTime)}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {/* Document status summary */}
          {docs.length > 0 && (
            <div className="hidden items-center gap-3 text-xs text-muted-foreground sm:flex">
              <span className="inline-flex items-center gap-1.5">
                <Paperclip className="size-3.5" />
                {docs.length} {docs.length === 1 ? "doc" : "docs"}
              </span>
              {extractedCount > 0 && (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <CheckCircle2 className="size-3.5" />
                  {extractedCount} extracted
                </span>
              )}
              {failedCount > 0 && (
                <span className="inline-flex items-center gap-1 text-red-600">
                  <XCircle className="size-3.5" />
                  {failedCount} failed
                </span>
              )}
            </div>
          )}

          {pendingCount > 0 && (
            <button
              onClick={extractAll}
              disabled={extractingAll}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {extractingAll ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  {extractProgress
                    ? `Extracted ${extractProgress.done}/${extractProgress.total}…`
                    : "Extracting…"}
                </>
              ) : (
                <>
                  <Sparkles className="size-3.5" />
                  Extract all ({pendingCount})
                </>
              )}
            </button>
          )}

          {pendingCount === 0 && docs.length > 0 && (
            <span className="hidden items-center gap-1.5 rounded-lg border border-emerald-600/20 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 sm:inline-flex">
              <ShieldCheck className="size-3.5" />
              All extracted
            </span>
          )}
        </div>
      </header>

      {/* ── Extract-all progress bar (multi-PDF) ── */}
      {extractingAll && extractProgress && (
        <div className="shrink-0 border-b bg-muted/30 px-4 py-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {extractProgress.done < extractProgress.total
                ? `Extracting ${extractProgress.done + 1} of ${extractProgress.total}…`
                : `Finishing up…`}
            </span>
            <span className="tabular-nums">
              {Math.round((extractProgress.done / extractProgress.total) * 100)}%
            </span>
          </div>
          <div className="mt-1.5 overflow-hidden rounded-full bg-muted" style={{ height: 3 }}>
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${(extractProgress.done / extractProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Split pane ── */}
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        {/* Left — source (email or PDF) */}
        <ResizablePanel defaultSize={56} minSize={36} className="flex min-w-0 flex-col bg-muted/10">
          {/* Source tab bar */}
          <div className="flex h-11 shrink-0 items-center gap-0.5 overflow-x-auto border-b bg-background px-2">
            <SourceTab
              active={view === "email"}
              onClick={() => setView("email")}
              icon={<Mail className="size-3.5" />}
              label="Message"
            />
            {docs.map((d, i) => (
              <SourceTab
                key={d.id}
                active={view === d.id}
                onClick={() => showDoc(d.id)}
                icon={<FileText className="size-3.5" />}
                label={d.fileName || `Attachment ${i + 1}`}
                status={d.status}
              />
            ))}
          </div>

          {/* Source body */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {view === "email" ? (
              <EmailBody email={email} docs={docs} onOpenDoc={showDoc} />
            ) : (
              <iframe
                key={`${view}-${pdfPage}`}
                src={`/api/documents/${view}/file#page=${pdfPage}`}
                className="h-full w-full"
                title="Original PDF"
              />
            )}
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right — extraction panel */}
        <ResizablePanel defaultSize={44} minSize={30} className="flex min-w-0 flex-col bg-background">
          {/* Document switcher */}
          {docs.length > 1 && (
            <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b px-2.5 py-2">
              {docs.map((d, i) => {
                const meta = STATUS_META[d.status];
                const active = d.id === activeDocId;
                return (
                  <button
                    key={d.id}
                    onClick={() => showDoc(d.id)}
                    title={`${d.fileName} — ${meta.label}`}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? "border-foreground/15 bg-muted text-foreground"
                        : "border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    }`}
                  >
                    {meta.icon}
                    <span className="max-w-[140px] truncate">
                      {d.fileName || `Attachment ${i + 1}`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {activeDoc ? (
            <ExtractionPanel
              key={activeDoc.id}
              documentId={activeDoc.id}
              initialStatus={activeDoc.status}
              initialExtraction={activeDoc.extraction}
              onActivePage={onActivePage}
              onChange={load}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center">
              <div className="flex size-12 items-center justify-center rounded-xl border bg-muted/40">
                <FileText className="size-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium text-foreground">No documents</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  This email has no PDF attachments to extract.
                </p>
              </div>
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

// ─── Source tab ──────────────────────────────────────────────────────────────

function SourceTab({
  active, onClick, icon, label, status,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  status?: DocStatus;
}) {
  const statusMeta = status ? STATUS_META[status] : null;

  return (
    <button
      onClick={onClick}
      title={label}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors ${
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      }`}
    >
      {statusMeta ? (
        <span className={`size-1.5 rounded-full ${statusMeta.dot}`} />
      ) : (
        icon
      )}
      <span className="max-w-[160px] truncate">{label}</span>
    </button>
  );
}

// ─── Email body ──────────────────────────────────────────────────────────────

function EmailBody({
  email, docs, onOpenDoc,
}: {
  email: EmailData["email"];
  docs: EmailDoc[];
  onOpenDoc: (id: string) => void;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      {/* Meta card */}
      <div className="rounded-xl border bg-background p-4">
        <h2 className="text-base font-semibold leading-snug text-foreground">
          {email.subject || "(no subject)"}
        </h2>
        <div className="mt-2.5 space-y-1 text-xs text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">
              {email.fromName || "Unknown"}
            </span>
            {email.fromAddress && (
              <span className="ml-1.5 opacity-70">&lt;{email.fromAddress}&gt;</span>
            )}
          </p>
          {email.to.length > 0 && (
            <p>To: {email.to.join(", ")}</p>
          )}
          <p>{fullDate(email.receivedDateTime)}</p>
        </div>
      </div>

      {/* Attachments */}
      {docs.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">
            {docs.length} {docs.length === 1 ? "Attachment" : "Attachments"}
          </p>
          <div className="flex flex-wrap gap-2">
            {docs.map((d, i) => {
              const meta = STATUS_META[d.status];
              return (
                <button
                  key={d.id}
                  onClick={() => onOpenDoc(d.id)}
                  className="group inline-flex items-center gap-2.5 rounded-xl border bg-background px-3 py-2.5 text-left transition-all hover:border-foreground/15 hover:bg-muted/40 hover:shadow-sm"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/40 transition-colors group-hover:bg-muted">
                    <FileText className="size-4 text-muted-foreground" />
                  </span>
                  <span className="min-w-0">
                    <span className="block max-w-[180px] truncate text-xs font-semibold text-foreground">
                      {d.fileName || `Attachment ${i + 1}`}
                    </span>
                    <span className={`mt-0.5 flex items-center gap-1 text-[11px] ${meta.text}`}>
                      {meta.icon}
                      {meta.label}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Email body */}
      <div className="overflow-hidden rounded-xl border bg-white">
        {email.bodyHtml ? (
          <EmailHtmlView html={email.bodyHtml} title={email.subject ?? "Email message"} />
        ) : (
          <div className="whitespace-pre-line p-5 text-sm leading-relaxed text-[#1c1b1a]">
            {email.bodyText || email.bodyPreview || "No message content."}
          </div>
        )}
      </div>
    </div>
  );
}
