import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowRight, ClipboardCheck, CheckCircle2, FileText } from "lucide-react";
import { TOKEN_COOKIE } from "@/lib/auth";
import { db, type Document } from "@/lib/db";
import { Sidebar } from "@/components/mail/sidebar";

// ─── Row status presentation ─────────────────────────────────────────────────

type RowStatus = "completed" | "review" | "pending" | "failed";

function rowStatus(doc: Document): RowStatus {
  if (doc.published) return "completed";
  if (doc.status === "failed") return "failed";
  if (doc.status === "extracted") return "review";
  return "pending";
}

const STATUS_META: Record<RowStatus, { label: string; dot: string; text: string }> = {
  completed: { label: "Completed",         dot: "bg-emerald-500", text: "text-emerald-700" },
  review:    { label: "Ready to review",   dot: "bg-amber-500",   text: "text-amber-700" },
  pending:   { label: "Pending extraction", dot: "bg-muted-foreground/40", text: "text-muted-foreground" },
  failed:    { label: "Failed",            dot: "bg-red-500",     text: "text-red-700" },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!token) redirect("/");

  const { status } = await searchParams;
  const view: "review" | "completed" = status === "completed" ? "completed" : "review";

  const all = db.documents.all();
  const reviewCount = all.filter((d) => !d.published).length;
  const completedCount = all.filter((d) => d.published).length;

  const docs = view === "completed" ? all.filter((d) => d.published) : all.filter((d) => !d.published);

  const navCounts = { review: reviewCount, completed: completedCount };

  const heading =
    view === "completed"
      ? { title: "Completed", sub: `${completedCount} published`, icon: <CheckCircle2 className="size-4" /> }
      : { title: "Review Queue", sub: `${reviewCount} awaiting review`, icon: <ClipboardCheck className="size-4" /> };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar active={view} counts={navCounts} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b px-5">
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-base font-semibold tracking-tight">{heading.title}</h1>
            <span className="text-xs text-muted-foreground tabular-nums">{heading.sub}</span>
          </div>
          {/* Review / Completed toggle */}
          <div className="inline-flex items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5">
            <Toggle href="/documents?status=review" active={view === "review"} count={reviewCount}>
              Review
            </Toggle>
            <Toggle href="/documents?status=completed" active={view === "completed"} count={completedCount}>
              Completed
            </Toggle>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {docs.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
              <div className="flex size-12 items-center justify-center rounded-xl border bg-muted/40 text-muted-foreground">
                {heading.icon}
              </div>
              <div>
                <p className="text-sm font-medium">
                  {view === "completed" ? "Nothing published yet" : "Review queue is empty"}
                </p>
                <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                  {view === "completed"
                    ? "Documents appear here once you publish their reviewed fields to the CRM."
                    : "Process an email's PDFs from the inbox, then extracted documents land here for review."}
                </p>
              </div>
              <Link
                href="/mail"
                className="mt-1 inline-flex h-8 items-center gap-1.5 rounded-lg border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted"
              >
                Go to inbox
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          ) : (
            <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6">
              <div className="divide-y rounded-xl border">
                {docs.map((doc) => {
                  const meta = STATUS_META[rowStatus(doc)];
                  const extraction = db.extractions.forDocument(doc.id);
                  const conf = extraction ? Math.round(extraction.confidence * 100) : null;
                  return (
                    <Link
                      key={doc.id}
                      href={`/documents/${doc.id}`}
                      className="group flex items-center gap-3 px-4 py-3 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-muted/50"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground group-hover:text-foreground">
                        <FileText className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{doc.fileName}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {doc.emailSubject || "No subject"}
                        </p>
                      </div>
                      {conf !== null && (
                        <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:inline">
                          {conf}%
                        </span>
                      )}
                      <span className={`hidden shrink-0 items-center gap-1.5 text-xs font-medium sm:inline-flex ${meta.text}`}>
                        <span className={`size-1.5 rounded-full ${meta.dot}`} />
                        {meta.label}
                      </span>
                      <span className="hidden w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground md:inline">
                        {formatDate(doc.createdAt)}
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-foreground" />
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Toggle({
  href,
  active,
  count,
  children,
}: {
  href: string;
  active: boolean;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-background text-foreground shadow-sm ring-1 ring-border"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
      <span className="tabular-nums opacity-70">{count}</span>
    </Link>
  );
}
