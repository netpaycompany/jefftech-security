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
  Home,
  LockKeyhole,
  Menu,
  Plus,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/brand-logo";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { PhotoAccessPrompt } from "@/components/photos/photo-access-prompt";
import { VaultLockButton } from "@/components/vault/vault-lock-button";
import { DeviceRegistration } from "@/components/devices/device-registration";
import { NotificationBell } from "@/components/notifications/notification-bell";

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

const mobileNavItems = [
  { name: "Overview", href: "/dashboard", icon: Home, isActive: (path: string) => path === "/dashboard" },
  {
    name: "Vault Items",
    href: "/vault",
    icon: LockKeyhole,
    isActive: (path: string) => ["/vault", "/passwords", "/notes", "/identities", "/cards", "/bank-accounts", "/recovery-codes", "/licenses", "/documents"].includes(path),
  },
  { name: "Security", href: "/security", icon: Shield, isActive: (path: string) => path === "/security" },
  { name: "Profile", href: "/profile", icon: UserRound, isActive: (path: string) => path === "/profile" },
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
  const dashboardMode = !adminMode && activePath === "/dashboard";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {!adminMode && <PhotoAccessPrompt />}
      {!adminMode && <DeviceRegistration />}
      <div className="mx-auto flex max-w-[1600px]">
        {adminMode && (
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
        )}

        <main className={cn("flex-1", dashboardMode && "mx-auto w-full max-w-5xl")}>
          <header className="border-b border-slate-800 bg-slate-950/85 px-4 py-4 backdrop-blur-sm sm:px-6 lg:px-8">
            <div className={cn("flex items-center justify-between gap-3", adminMode && !dashboardMode && "lg:hidden")}>
              <details className="relative">
                <summary
                  aria-label="Open navigation menu"
                  className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-xl border border-slate-800 text-slate-200 [&::-webkit-details-marker]:hidden"
                >
                  <Menu className="h-5 w-5" />
                </summary>
                <div className="absolute left-0 top-full z-50 mt-3 max-h-[72dvh] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-3 shadow-2xl shadow-black/50">
                  <nav aria-label="Mobile navigation" className="space-y-1">
                    {visibleNavItems.map(({ name, href, icon: Icon }) => {
                      const isActive = activePath === href;
                      return (
                        <Link
                          key={href}
                          href={href}
                          aria-current={isActive ? "page" : undefined}
                          className={cn(
                            "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium",
                            isActive ? "bg-blue-600/15 text-blue-200" : "text-slate-300 hover:bg-slate-900 hover:text-white",
                          )}
                        >
                          <Icon className="h-4 w-4" />
                          {name}
                        </Link>
                      );
                    })}
                  </nav>
                  {!adminMode && (
                    <div className="mt-3 border-t border-slate-800 pt-3">
                      <SignOutButton />
                    </div>
                  )}
                </div>
              </details>

              <Link href={adminMode ? "/admin" : "/dashboard"} className="flex min-w-0 items-center gap-2">
                <BrandLogo size={40} />
                <span className="min-w-0">
                  <span className="block truncate text-[9px] uppercase tracking-[0.18em] text-slate-400">Jefftech Security</span>
                  <span className="block truncate text-sm font-semibold text-white">Password Vault</span>
                </span>
              </Link>

              {!adminMode ? (
                <NotificationBell />
              ) : <span className="h-10 w-10" aria-hidden="true" />}
            </div>

            <div className="mt-5 flex items-center justify-between gap-4 lg:mt-0">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Security dashboard</p>
                <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">{title}</h1>
              </div>
              <div className="flex items-center gap-3">
                {!adminMode && !dashboardMode && (
                  <div className="hidden lg:block">
                    <NotificationBell />
                  </div>
                )}
                {!adminMode && <VaultLockButton />}
                {!adminMode && (
                  <div className="hidden lg:block">
                    <SignOutButton />
                  </div>
                )}
              </div>
            </div>
          </header>

          <div className={cn("p-4 pb-28 sm:p-6 sm:pb-28 lg:p-8", !adminMode && "lg:pb-32")}>{children}</div>
        </main>
      </div>
      {!adminMode && (
        <nav
          aria-label="Main navigation"
          className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 items-end border-t border-blue-900/70 bg-slate-950/95 px-2 pt-2 shadow-[0_-12px_40px_rgba(2,8,23,0.65)] backdrop-blur-xl lg:bottom-5 lg:left-1/2 lg:right-auto lg:w-[min(48rem,calc(100vw-2rem))] lg:-translate-x-1/2 lg:rounded-2xl lg:border lg:px-5 lg:pt-2"
        >
          {mobileNavItems.slice(0, 2).map(({ name, href, icon: Icon, isActive }) => {
            const active = isActive(activePath);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-medium",
                  dashboardMode && "lg:min-h-16 lg:text-xs",
                  active ? "text-cyan-300" : "text-slate-400",
                )}
              >
                <Icon className={cn("h-5 w-5", active && "fill-current/10")} />
                <span>{name}</span>
              </Link>
            );
          })}

          <details className="relative flex min-h-14 items-center justify-center">
            <summary
              aria-label="Add a vault item"
              className="flex h-14 w-14 -translate-y-3 cursor-pointer list-none items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 text-white shadow-lg shadow-blue-600/30 [&::-webkit-details-marker]:hidden lg:h-16 lg:w-16"
            >
              <Plus className="h-8 w-8" />
            </summary>
            <div className="absolute bottom-full left-1/2 mb-1 w-52 -translate-x-1/2 rounded-2xl border border-slate-700 bg-slate-950 p-2 shadow-2xl shadow-black/50">
              {[
                { label: "Add password", href: "/passwords", icon: KeyRound },
                { label: "New secure note", href: "/notes", icon: NotebookPen },
                { label: "Add identity", href: "/identities", icon: IdCard },
                { label: "Add record", href: "/cards", icon: CreditCard },
              ].map(({ label, href, icon: Icon }) => (
                <Link key={href} href={href} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-200 hover:bg-slate-900">
                  <Icon className="h-4 w-4 text-blue-300" />
                  {label}
                </Link>
              ))}
            </div>
          </details>

          {mobileNavItems.slice(2).map(({ name, href, icon: Icon, isActive }) => {
            const active = isActive(activePath);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-medium",
                  dashboardMode && "lg:min-h-16 lg:text-xs",
                  active ? "text-cyan-300" : "text-slate-400",
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{name}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
