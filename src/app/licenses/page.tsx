import { VaultCategoryManager, type VaultFieldDefinition } from "@/components/vault/vault-category-manager";

const fields: VaultFieldDefinition[] = [
  { name: "softwareName", label: "Software name", required: true },
  { name: "licenseKey", label: "License key", sensitive: true, required: true },
  { name: "purchaseInformation", label: "Purchase information", multiline: true },
  { name: "expirationDate", label: "Expiration date", type: "date" },
];

export default function LicensesPage() {
  return (
    <VaultCategoryManager
      itemType="license"
      title="Software Licenses"
      activePath="/licenses"
      description="Keep license keys and purchase details encrypted in your vault."
      fields={fields}
    />
  );
}
