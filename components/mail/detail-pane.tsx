"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  MailOpen,
  Paperclip,
  TriangleAlert,
} from "lucide-react";
import { EmailHtmlView } from "@/components/email/email-html-view";
import { type QueueMessage, formatFullDate, formatSize, getAvatarColor, getInitials } from "./inbox-helpers";

// ─── API response types ───────────────────────────────────────────────────────

type DocStatus = "ingested" | "extracted" | "failed";

type AttachmentMeta = {
  id: string;
  name: string;
  size: number;
  contentType: string;
  isPdf: boolean;
};

type EmailDoc = {
  id: string;
  fileName: string;
  status: DocStatus;
};

type EmailDetailData = {
  email: {
    id: string;
    subject: string | null;
    receivedDateTime: string;
    hasAttachments: boolean;
    fromName: string | null;
    fromAddress: string | null;
    to: string[];
    bodyHtml: string | null;
    bodyText: string | null;
    bodyPreview: string | null;
  };
  documents: EmailDoc[];
  attachments: AttachmentMeta[];
};

// ─── Status colours ───────────────────────────────────────────────────────────

const STATUS_META: Record<DocStatus, { label: string; dot: string; text: string }> = {
  ingested:  { label: "Pending",   dot: "bg-amber-500",   text: "text-amber-700" },
  extracted: { label: "Extracted", dot: "bg-emerald-500", text: "text-emerald-700" },
  failed:    { label: "Failed",    dot: "bg-red-500",     text: "text-red-700" },
};

// ─── Empty pane (nothing selected) ───────────────────────────────────────────

function EmptyPane() {
  return (
    <section className="hidden min-w-0 flex-1 flex-col items-center justify-center gap-4 bg-muted/20 lg:flex">
      <div className="flex size-14 items-center justify-center rounded-full border bg-background shadow-sm">
        <MailOpen className="size-6 text-muted-foreground" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium">Select a message to read it</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Emails with attachments can be processed into structured documents.
        </p>
      </div>
    </section>
  );
}

// ─── Attachment chip (pre-ingestion) ─────────────────────────────────────────

function AttachmentChip({ att }: { att: AttachmentMeta }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs transition-colors ${
        att.isPdf ? "text-foreground" : "text-muted-foreground"
      }`}
    >
      <Paperclip className="size-3 shrink-0" aria-hidden />
      <span className="max-w-[180px] truncate font-medium">{att.name}</span>
      {att.size > 0 && (
        <span className="shrink-0 text-muted-foreground">{formatSize(att.size)}</span>
      )}
    </span>
  );
}

// ─── Ingested document chip ───────────────────────────────────────────────────

function DocStatusChip({ doc }: { doc: EmailDoc }) {
  const meta = STATUS_META[doc.status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${meta.text}`}
    >
      {doc.status === "extracted" ? (
        <CheckCircle2 className="size-3 shrink-0" />
      ) : doc.status === "failed" ? (
        <TriangleAlert className="size-3 shrink-0" />
      ) : (
        <span className={`size-1.5 shrink-0 rounded-full ${meta.dot}`} />
      )}
      <span className="max-w-[180px] truncate">{doc.fileName}</span>
      <span className="shrink-0 opacity-60">{meta.label}</span>
    </span>
  );
}

// ─── Detail header ─────────────────────────────────────────────────────────

function DetailHeader({
  data,
  onClose,
}: {
  data: EmailDetailData;
  onClose: () => void;
}) {
  const { email } = data;
  const senderName = email.fromName || email.fromAddress || "Unknown";
  const avatarColor = getAvatarColor(email.fromName);
  const initials = getInitials(email.fromName, email.fromAddress);

  return (
    <div className="shrink-0 space-y-3 border-b px-5 py-4">
      {/* Subject + back button */}
      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 flex-1 text-base font-semibold leading-snug">
          {email.subject || "(no subject)"}
        </h2>
        {/* Back button — mobile only */}
        <button
          type="button"
          onClick={onClose}
          className="flex size-7 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition hover:bg-muted hover:text-foreground lg:hidden"
          aria-label="Back to inbox"
        >
          <ArrowLeft className="size-4" />
        </button>
      </div>

      {/* Sender row */}
      <div className="flex items-center gap-3">
        <div
          className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${avatarColor}`}
          aria-hidden
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">
            <span className="font-medium">{senderName}</span>
            {email.fromAddress && (
              <span className="ml-1.5 text-muted-foreground">
                &lt;{email.fromAddress}&gt;
              </span>
            )}
          </p>
          <p suppressHydrationWarning className="text-xs text-muted-foreground">
            {formatFullDate(email.receivedDateTime)}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Detail actions ───────────────────────────────────────────────────────────

function DetailActions({
  messageId,
  subject,
  pdfs,
  documents,
}: {
  messageId: string;
  subject: string | null;
  pdfs: AttachmentMeta[];
  documents: EmailDoc[];
}) {
  const hasPdfs = pdfs.length > 0;
  const hasIngested = documents.length > 0;
  const pdfCount = pdfs.length;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-t px-5 py-3">
      {/* Primary: process documents */}
      <form action="/api/ingest" method="post">
        <input type="hidden" name="messageId" value={messageId} />
        <input type="hidden" name="emailSubject" value={subject ?? ""} />
        <button
          type="submit"
          disabled={!hasPdfs}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FileText className="size-4" />
          {pdfCount > 1
            ? `Process ${pdfCount} PDFs`
            : hasPdfs
            ? "Process document"
            : "No PDFs to process"}
          {hasPdfs && <ArrowRight className="size-3.5" />}
        </button>
      </form>

      {/* Secondary: open workspace if already ingested */}
      {hasIngested && (
        <Link
          href={`/email/${messageId}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <ExternalLink className="size-3.5" />
          Open workspace
        </Link>
      )}

      {!hasPdfs && (
        <p className="text-xs text-muted-foreground">
          This email has no PDF attachments.
        </p>
      )}
    </div>
  );
}

// ─── Detail body ──────────────────────────────────────────────────────────────

function DetailBody({ data }: { data: EmailDetailData }) {
  const { email, attachments, documents } = data;
  const pdfs = attachments.filter((a) => a.isPdf);
  const hasIngested = documents.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Scrollable body */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4 px-5 py-5">
          {/* Attachment chips: show ingested docs if available, else raw attachments */}
          {hasIngested ? (
            <div className="flex flex-wrap gap-2">
              {documents.map((doc) => (
                <DocStatusChip key={doc.id} doc={doc} />
              ))}
            </div>
          ) : attachments.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {attachments.map((att) => (
                <AttachmentChip key={att.id} att={att} />
              ))}
            </div>
          ) : null}

          {/* Email body */}
          <div className="overflow-hidden rounded-xl border bg-white">
            {email.bodyHtml ? (
              <EmailHtmlView
                html={email.bodyHtml}
                title={email.subject ?? "Email message"}
              />
            ) : (
              <div className="whitespace-pre-line p-5 text-sm leading-relaxed text-[#1c1b1a]">
                {email.bodyText || email.bodyPreview || "No message content."}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action bar */}
      <DetailActions
        messageId={email.id}
        subject={email.subject}
        pdfs={pdfs}
        documents={documents}
      />
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col animate-pulse">
      <div className="shrink-0 space-y-3 border-b px-5 py-4">
        <div className="h-5 w-2/3 rounded-md bg-muted" />
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-full bg-muted" />
          <div className="space-y-1.5">
            <div className="h-3.5 w-32 rounded bg-muted" />
            <div className="h-3 w-24 rounded bg-muted" />
          </div>
        </div>
      </div>
      <div className="flex-1 space-y-3 px-5 py-5">
        <div className="flex gap-2">
          <div className="h-7 w-28 rounded-full bg-muted" />
          <div className="h-7 w-28 rounded-full bg-muted" />
        </div>
        <div className="h-64 rounded-xl border bg-muted" />
      </div>
    </div>
  );
}

// ─── Detail pane (root export) ────────────────────────────────────────────────

interface DetailPaneProps {
  message: QueueMessage | null;
  onClose: () => void;
}

export function DetailPane({ message, onClose }: DetailPaneProps) {
  const [data, setData] = useState<EmailDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(`/api/email/${id}`);
      if (!res.ok) {
        setError(
          res.status === 401
            ? "Your session expired. Reconnect Outlook."
            : "Failed to load email."
        );
        return;
      }
      const d = (await res.json()) as EmailDetailData;
      setData(d);
    } catch {
      setError("Network error — check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!message) {
      setData(null);
      setError(null);
      return;
    }
    void loadDetail(message.id);
  }, [message, loadDetail]);

  // Empty state
  if (!message) return <EmptyPane />;

  const sectionClass =
    "flex min-h-0 min-w-0 flex-1 flex-col bg-background fixed inset-0 z-50 lg:static lg:z-auto lg:border-l";

  if (loading) {
    return (
      <section className={sectionClass}>
        <DetailSkeleton />
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className={sectionClass}>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
          {error && (
            <p className="text-sm text-muted-foreground">{error}</p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className={sectionClass}>
      <DetailHeader data={data} onClose={onClose} />
      <DetailBody data={data} />
    </section>
  );
}
