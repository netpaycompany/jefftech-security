import { VaultCategoryManager, type VaultFieldDefinition } from "@/components/vault/vault-category-manager";

const fields: VaultFieldDefinition[] = [
  { name: "softwareName", label: "Software name", required: true },
  { name: "licenseType", label: "License type", type: "select", options: [
    { value: "application", label: "Application" },
    { value: "tool", label: "Tool" },
    { value: "other", label: "Other" },
  ] },
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
      facet={{ field: "licenseType", options: [
        { value: "application", label: "Applications" },
        { value: "tool", label: "Tools" },
        { value: "other", label: "Other" },
      ] }}
    />
  );
}
