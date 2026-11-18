import { ProfileSectionPage } from "@/components/profile/profile-section-page";
import { SecuritySettings } from "@/components/profile/security-settings";

export default function ProfileSecuritySettingsPage() {
  return (
    <ProfileSectionPage title="Security Settings" activeHref="/profile/security-settings">
      <SecuritySettings />
    </ProfileSectionPage>
  );
}
