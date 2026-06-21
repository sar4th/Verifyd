import Link from "next/link";
import {
  Inbox,
  FileText,
  Sparkles,
  ClipboardCheck,
  CheckCircle2,
  Settings,
  ShieldCheck,
  Plug,
} from "lucide-react";

export type SidebarKey = "all" | "ready" | "new" | "review" | "completed";

export type SidebarCounts = Partial<Record<SidebarKey, number>>;

const WORKSPACE: { key: SidebarKey; href: string; label: string; icon: React.ReactNode }[] = [
  { key: "all",   href: "/mail",            label: "All Applications", icon: <Inbox className="size-4" /> },
  { key: "ready", href: "/mail?view=ready", label: "Ready to Process", icon: <FileText className="size-4" /> },
  { key: "new",   href: "/mail?view=new",   label: "New Arrivals",     icon: <Sparkles className="size-4" /> },
];

const PIPELINE: { key: SidebarKey; href: string; label: string; icon: React.ReactNode }[] = [
  { key: "review",    href: "/documents?status=review",    label: "Review Queue", icon: <ClipboardCheck className="size-4" /> },
  { key: "completed", href: "/documents?status=completed", label: "Completed",    icon: <CheckCircle2 className="size-4" /> },
];

export function Sidebar({
  active,
  counts = {},
}: {
  active: SidebarKey;
  counts?: SidebarCounts;
}) {
  return (
    <aside className="hidden w-[224px] shrink-0 flex-col border-r bg-sidebar lg:flex">
      {/* Brand */}
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <ShieldCheck className="size-3.5" />
        </div>
        <span className="text-sm font-semibold tracking-tight">Verifyd</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <p className="px-2 pb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground">
          Workspace
        </p>
        {WORKSPACE.map((item) => (
          <NavItem
            key={item.key}
            href={item.href}
            active={active === item.key}
            icon={item.icon}
            count={counts[item.key]}
          >
            {item.label}
          </NavItem>
        ))}

        <p className="px-2 pt-5 pb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground">
          Pipeline
        </p>
        {PIPELINE.map((item) => (
          <NavItem
            key={item.key}
            href={item.href}
            active={active === item.key}
            icon={item.icon}
            count={counts[item.key]}
          >
            {item.label}
          </NavItem>
        ))}
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
          Sign out
        </NavItem>
      </div>
    </aside>
  );
}

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
