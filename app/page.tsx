import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-background">
      {/* Top brand bar */}
      <header className="flex h-14 items-center border-b px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary">
            <span className="text-[13px] font-semibold text-primary-foreground">V</span>
          </div>
          <span className="text-sm font-semibold tracking-tight">Verifyd</span>
        </div>
      </header>

      {/* Centered sign-in */}
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight">Sign in to Verifyd</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Connect your Microsoft account to ingest documents from Outlook and
              run them through the extraction pipeline.
            </p>
          </div>

          <Link
            href="/api/auth/login"
            className="flex h-10 w-full items-center justify-center gap-2.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <svg viewBox="0 0 21 21" className="h-4 w-4" aria-hidden="true">
              <rect x="1" y="1" width="9" height="9" fill="#f25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            Continue with Microsoft
          </Link>

          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Verifyd requests read-only access to your mail. We never send or
            modify messages.
          </p>

          <div className="mt-10 border-t pt-6">
            <p className="text-xs font-medium text-muted-foreground">
              Built for loan processing & underwriting operations
            </p>
            <ul className="mt-3 space-y-1.5 text-xs text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-muted-foreground/60" />
                Automated PDF intake from Outlook
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-muted-foreground/60" />
                Multi-model extraction with confidence scoring
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-muted-foreground/60" />
                Side-by-side review workstation
              </li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
