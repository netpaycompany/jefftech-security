import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { ProfileForm } from "@/components/auth/profile-form";
import { createClient } from "@/lib/supabase/server";

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <AppShell title="Your profile" activePath="/profile">
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
    .select("full_name,phone_number,address,country")
    .eq("id", user.id)
    .single();

  if (profileError) {
    throw new Error(`Unable to load account profile: ${profileError.message}`);
  }

  return (
    <AppShell title="Your profile" activePath="/profile">
      <section className="max-w-2xl rounded-3xl border border-slate-800 bg-slate-900 p-6 sm:p-8">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Account details</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Personal information</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Manage the name, phone number, and address associated with your account. Your email address is managed by your sign-in provider.
          </p>
        </div>
        <ProfileForm
          userId={user.id}
          email={user.email ?? ""}
          fullName={profile.full_name ?? ""}
          phoneNumber={profile.phone_number ?? ""}
          address={profile.address ?? ""}
          country={profile.country ?? ""}
        />
        <div className="mt-8 border-t border-slate-800 pt-5 text-xs text-slate-500">
          User ID: <span className="font-mono">{user.id}</span>
        </div>
      </section>
    </AppShell>
  );
}
