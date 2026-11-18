import Link from "next/link";
import { ArrowLeft, ChevronRight, KeyRound, Laptop, ShieldCheck, UserRound } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { cn } from "@/lib/utils";

export const profileSections = [
  { title: "Account Information", href: "/profile/account-information", icon: UserRound },
  { title: "Security Settings", href: "/profile/security-settings", icon: ShieldCheck },
  { title: "My Devices", href: "/profile/my-devices", icon: Laptop },
  { title: "Recovery Options", href: "/profile/recovery-options", icon: KeyRound },
  { title: "Password Alerts", href: "/profile/password-alerts", icon: ShieldCheck },
] as const;

export function ProfileSectionPage({
  title,
  activeHref,
  children,
}: {
  title: string;
  activeHref: string;
  children: React.ReactNode;
}) {
  return (
    <AppShell title={title} activePath="/profile">
      <Link
        href="/profile"
        className="mb-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-blue-500/30 px-3 py-2 text-sm font-medium text-blue-100 hover:bg-blue-500/10"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to profile
      </Link>

      <nav aria-label="Profile sections" className="mb-5 flex gap-2 overflow-x-auto pb-2">
        {profileSections.map(({ title: sectionTitle, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={activeHref === href ? "page" : undefined}
            className={cn(
              "flex min-h-10 shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium sm:text-sm",
              activeHref === href
                ? "border-blue-400/60 bg-blue-500/15 text-blue-100"
                : "border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-600",
            )}
          >
            <Icon className="h-4 w-4" />
            {sectionTitle}
          </Link>
        ))}
        <Link
          href="/profile"
          className="ml-auto hidden shrink-0 items-center gap-1 self-center text-xs text-slate-400 hover:text-white sm:inline-flex"
        >
          All profile options <ChevronRight className="h-4 w-4" />
        </Link>
      </nav>

      {children}
    </AppShell>
  );
}
