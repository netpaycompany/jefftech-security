import { VaultCategoryManager, type VaultFieldDefinition } from "@/components/vault/vault-category-manager";

const fields: VaultFieldDefinition[] = [
  { name: "accountName", label: "Account or service", required: true },
  { name: "codes", label: "Recovery codes", multiline: true, sensitive: true, required: true },
  { name: "notes", label: "Private notes", multiline: true, sensitive: true },
];

export default function RecoveryCodesPage() {
  return (
    <VaultCategoryManager
      itemType="recovery_code"
      title="Recovery Codes"
      activePath="/recovery-codes"
      description="Store recovery codes for other services. These are separate from the user-held key that can recover this vault."
      fields={fields}
    />
  );
}
