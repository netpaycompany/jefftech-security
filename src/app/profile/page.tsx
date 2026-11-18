import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import Link from "next/link";
import { ChevronRight, LogOut, ShieldCheck, UserRound } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { profileSections } from "@/components/profile/profile-section-page";
import { createClient } from "@/lib/supabase/server";

const sectionDescriptions: Record<string, string> = {
  "Account Information": "Update your name, phone, address, and country",
  "Security Settings": "Manage account password, vault lock, and extensions",
  "My Devices": "Manage devices, synchronization, and backups",
  "Recovery Options": "Review recovery key guidance and vault recovery",
  "Password Alerts": "Check for weak, reused, or breached passwords",
};

const sectionColors: Record<string, string> = {
  "Account Information": "text-violet-300 bg-violet-500/20",
  "Security Settings": "text-cyan-300 bg-cyan-500/20",
  "My Devices": "text-sky-300 bg-blue-500/20",
  "Recovery Options": "text-cyan-300 bg-cyan-500/20",
  "Password Alerts": "text-blue-200 bg-blue-500/20",
};

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <AppShell title="My Profile" activePath="/profile">
          <p role="status" className="text-sm text-slate-400">Loading your profile...</p>
        </AppShell>
      }
    >
      <ProfileContent />
    </Suspense>
  );
}

async function ProfileContent() {
  await connection();

  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) {
    throw new Error(`Unable to load account profile: ${error.message}`);
  }
  if (!user) {
    redirect("/login?next=/profile");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  if (profileError) {
    throw new Error(`Unable to load account profile: ${profileError.message}`);
  }

  return (
    <AppShell title="My Profile" activePath="/profile">
      <p className="mb-4 text-sm text-slate-300 sm:mb-5 sm:text-base">Manage your account, security, and preferences.</p>

      <section className="mb-4 flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-3xl border border-blue-400/35 bg-gradient-to-br from-blue-950 via-slate-950 to-blue-950 p-4 shadow-lg shadow-blue-950/20 sm:mb-5 sm:p-6">
        <div className="flex min-w-0 items-center gap-4">
          <div aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-blue-600 text-2xl font-bold text-white ring-4 ring-blue-400/15 sm:h-20 sm:w-20">
            {(profile.full_name || user.email || "U").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-white sm:text-2xl">{profile.full_name || "Your profile"}</h2>
            <p className="mt-1 break-all text-sm text-slate-200">{user.email}</p>
            <p className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${user.email_confirmed_at ? "bg-emerald-500/20 text-emerald-200" : "bg-amber-500/15 text-amber-200"}`}>
              <ShieldCheck className="h-4 w-4" />
              {user.email_confirmed_at ? "Email verified" : "Email not verified"}
            </p>
          </div>
        </div>
        <Link href="/profile/account-information" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-blue-300/50 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500/15">
          <UserRound className="h-4 w-4" />
          Edit Profile
        </Link>
      </section>

      <nav aria-label="Profile and account settings" className="mb-5 space-y-2 sm:mb-6 sm:space-y-3">
        {profileSections.map(({ title, href, icon: Icon }) => {
          return (
            <Link key={title} href={href} className="group flex min-h-[72px] items-center gap-3 rounded-2xl border border-blue-500/25 bg-gradient-to-r from-blue-950/65 to-slate-950 px-3 py-3 transition-colors hover:border-blue-400/60 sm:min-h-[76px] sm:gap-4 sm:px-5">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${sectionColors[title]}`}><Icon className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-white sm:text-base">{title}</span>
                <span className="mt-0.5 block text-xs text-slate-300 sm:text-sm">{sectionDescriptions[title]}</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5" />
            </Link>
          );
        })}
        <div className="flex min-h-[72px] items-center gap-3 rounded-2xl border border-blue-500/25 bg-gradient-to-r from-blue-950/65 to-slate-950 px-3 py-3 sm:min-h-[76px] sm:gap-4 sm:px-5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-500/15 text-rose-300">
            <LogOut className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white sm:text-base">Sign Out</p>
            <p className="mt-0.5 text-xs text-slate-300 sm:text-sm">Log out of your Jefftech Security account</p>
          </div>
          <SignOutButton />
        </div>
      </nav>

    </AppShell>
  );
}
