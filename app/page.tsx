import Link from "next/link";
import { ShieldCheck, FileText, ScanLine, ArrowRight, Check } from "lucide-react";

export default function Home() {
  return (
    <main className="grid min-h-screen grid-cols-1 bg-background lg:grid-cols-[1.05fr_0.95fr]">
      {/* ── Left — brand showcase ─────────────────────────────────────────── */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex xl:p-14">
        {/* soft brand glow + grid texture */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -right-24 size-[28rem] rounded-full bg-brand/30 blur-[120px]"
        />

        {/* brand mark */}
        <div className="relative flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-brand text-brand-foreground">
            <ShieldCheck className="size-[18px]" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight">Verifyd</span>
        </div>

        {/* headline */}
        <div className="relative max-w-md">
          <p className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-primary-foreground/15 bg-primary-foreground/5 px-2.5 py-1 text-[11px] font-medium tracking-wide text-primary-foreground/70">
            <span className="size-1.5 rounded-full bg-brand" />
            Document intelligence for lending
          </p>
          <h1 className="font-display text-[2.9rem] font-normal leading-[1.05] tracking-tight">
            Every application,
            <br />
            <span className="italic text-brand">read, structured</span>
            <br />
            and verified.
          </h1>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-primary-foreground/65">
            Verifyd pulls PDFs straight from Outlook, extracts every field with
            confidence scoring, and hands your team a side-by-side review desk —
            no manual data entry.
          </p>
        </div>

        {/* mini extracted-field motif */}
        <div className="relative w-full max-w-sm rounded-xl border border-primary-foreground/12 bg-primary-foreground/[0.04] p-4 backdrop-blur-sm">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-primary-foreground/50">
              loan-application.pdf
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-brand/15 px-1.5 py-0.5 text-[10px] font-medium text-brand">
              <Check className="size-2.5" />
              98%
            </span>
          </div>
          <ExtractRow label="Applicant" value="Marcus J. Holloway" />
          <ExtractRow label="Loan amount" value="$420,000" />
          <ExtractRow label="Property" value="118 Cedar St, Austin TX" />
        </div>

        <p className="relative text-xs text-primary-foreground/40">
          © {new Date().getFullYear()} Verifyd. Read-only access — we never send or modify your mail.
        </p>
      </section>

      {/* ── Right — sign in ───────────────────────────────────────────────── */}
      <section className="flex flex-col px-6 py-10 sm:px-10">
        {/* mobile brand */}
        <div className="mb-12 flex items-center gap-2.5 lg:hidden">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="size-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight">Verifyd</span>
        </div>

        <div className="flex flex-1 flex-col justify-center">
          <div className="w-full max-w-sm">
            <h2 className="font-display text-3xl font-normal tracking-tight">
              Sign in to Verifyd
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Connect your Microsoft work account to start processing documents
              from Outlook. New here? Signing in creates your workspace
              automatically.
            </p>

            <Link
              href="/api/auth/login"
              className="group mt-8 flex h-11 w-full items-center justify-center gap-2.5 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:opacity-95 hover:shadow"
            >
              <svg viewBox="0 0 21 21" className="size-4" aria-hidden="true">
                <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
              </svg>
              Continue with Microsoft
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>

            <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 text-brand" />
              Read-only Mail.Read scope · OAuth 2.0 via Microsoft Entra
            </p>

            {/* capability list */}
            <div className="mt-10 space-y-px border-t pt-8">
              <Feature
                icon={<FileText className="size-4" />}
                title="Multi-PDF intake from Outlook"
                body="Every attachment on an email is ingested and queued — not just the first."
              />
              <Feature
                icon={<ScanLine className="size-4" />}
                title="Frontier vision extraction"
                body="Gemini 2.5 Flash and Qwen3-VL 235B read printed, handwritten, and scanned forms."
              />
              <Feature
                icon={<ShieldCheck className="size-4" />}
                title="Side-by-side review desk"
                body="Confidence scores, section grouping, and the source document in one split view."
              />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function ExtractRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-t border-primary-foreground/10 py-2 first:border-t-0">
      <span className="text-xs text-primary-foreground/50">{label}</span>
      <span className="text-xs font-medium text-primary-foreground/90">{value}</span>
    </div>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-3 py-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border bg-muted/40 text-foreground">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
