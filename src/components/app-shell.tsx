import Link from "next/link";
import {
  CreditCard,
  FileText,
  FileLock2,
  FolderKanban,
  Images,
  Landmark,
  KeyRound,
  LayoutDashboard,
  RefreshCw,
  ShieldCheck,
  UserCog,
  UserRound,
  Users,
  Wrench,
  IdCard,
  NotebookPen,
  BadgeCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/brand-logo";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { PhotoAccessPrompt } from "@/components/photos/photo-access-prompt";
import { VaultLockButton } from "@/components/vault/vault-lock-button";

const navItems = [
  { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { name: "Profile", href: "/profile", icon: UserRound },
  { name: "Passwords", href: "/passwords", icon: KeyRound },
  { name: "Secure Notes", href: "/notes", icon: NotebookPen },
  { name: "Identities", href: "/identities", icon: IdCard },
  { name: "Payment Cards", href: "/cards", icon: CreditCard },
  { name: "Bank Accounts", href: "/bank-accounts", icon: Landmark },
  { name: "Recovery Codes", href: "/recovery-codes", icon: FileLock2 },
  { name: "Software Licenses", href: "/licenses", icon: BadgeCheck },
  { name: "Secure Documents", href: "/documents", icon: FileText },
  { name: "Security Center", href: "/security", icon: ShieldCheck },
  { name: "Vault Items", href: "/vault", icon: FolderKanban },
  { name: "Photos", href: "/photos", icon: Images },
  { name: "Devices & Sync", href: "/devices", icon: RefreshCw },
  { name: "Settings", href: "/settings", icon: UserCog },
  { name: "Recovery", href: "/recovery", icon: FileLock2 },
  { name: "Tools", href: "/generator", icon: Wrench },
];

const adminNavItems = [
  { name: "Overview", href: "/admin", icon: LayoutDashboard },
  { name: "User Management", href: "/admin/users", icon: Users },
];

export function AppShell({
  title,
  activePath,
  adminMode = false,
  children,
}: {
  title: string;
  activePath: string;
  adminMode?: boolean;
  children: React.ReactNode;
}) {
  const visibleNavItems = adminMode ? adminNavItems : navItems;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {!adminMode && <PhotoAccessPrompt />}
      <div className="mx-auto flex max-w-[1600px]">
        <aside className="hidden w-72 shrink-0 border-r border-slate-800 bg-slate-950/80 p-6 lg:block">
          <div className="mb-8 flex items-center gap-3">
            <BrandLogo size={48} />
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">Jefftech Security</p>
              <p className="text-lg font-semibold text-white">PASSWORD VAULT</p>
            </div>
          </div>

          <nav className="space-y-2">
            {visibleNavItems.map(({ name, href, icon: Icon }) => {
              const isActive = activePath === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-blue-600/15 text-blue-200 ring-1 ring-inset ring-blue-500/40"
                      : "text-slate-300 hover:bg-slate-900 hover:text-white",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {name}
                </Link>
              );
            })}
          </nav>

          <div className="mt-10 rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-blue-300">Zero-knowledge</p>
            <p className="mt-2 text-sm text-slate-300">
              Vault encryption stays on-device before data reaches the server.
            </p>
          </div>
        </aside>

        <main className="flex-1">
          <header className="border-b border-slate-800 bg-slate-950/85 px-4 py-4 backdrop-blur-sm sm:px-6 lg:px-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Security dashboard</p>
                <h1 className="mt-1 text-2xl font-semibold text-white">{title}</h1>
              </div>
              <div className="flex items-center gap-3">
                {!adminMode && <VaultLockButton />}
                {!adminMode && (
                  <SignOutButton />
                )}
              </div>
            </div>
          </header>

          <div className="p-4 sm:p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
