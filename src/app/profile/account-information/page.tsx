import { redirect } from "next/navigation";
import { connection } from "next/server";

import { ProfileForm } from "@/components/auth/profile-form";
import { ProfileSectionPage } from "@/components/profile/profile-section-page";
import { createClient } from "@/lib/supabase/server";

export default async function AccountInformationPage() {
  await connection();

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) {
    throw new Error(`Unable to load account information: ${userError.message}`);
  }
  if (!user) {
    redirect("/login?next=/profile/account-information");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name,phone_number,address,country")
    .eq("id", user.id)
    .single();
  if (profileError) {
    throw new Error(`Unable to load account information: ${profileError.message}`);
  }

  return (
    <ProfileSectionPage title="Account Information" activeHref="/profile/account-information">
      <section className="rounded-3xl border border-blue-500/25 bg-gradient-to-br from-blue-950/60 to-slate-950 p-4 sm:p-6">
        <div className="mb-5">
          <p className="text-xs uppercase tracking-[0.18em] text-blue-200">Account information</p>
          <h2 className="mt-1 text-lg font-semibold text-white sm:text-xl">Personal details</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
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
      </section>
    </ProfileSectionPage>
  );
}
