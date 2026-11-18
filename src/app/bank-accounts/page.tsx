import { VaultCategoryManager, type VaultFieldDefinition } from "@/components/vault/vault-category-manager";

const fields: VaultFieldDefinition[] = [
  { name: "bankName", label: "Bank name", required: true },
  { name: "accountHolder", label: "Account holder", required: true },
  { name: "accountType", label: "Account type", type: "select", options: [
    { value: "checking", label: "Checking" },
    { value: "savings", label: "Savings" },
    { value: "other", label: "Other" },
  ] },
  { name: "accountNumber", label: "Account number", sensitive: true, required: true },
  { name: "routingCode", label: "Routing or bank code", sensitive: true },
  { name: "notes", label: "Private notes", multiline: true, sensitive: true },
];

export default function BankAccountsPage() {
  return (
    <VaultCategoryManager
      itemType="bank_account"
      title="Bank Accounts"
      activePath="/bank-accounts"
      description="Account and routing information stays inside individually authenticated ciphertext."
      fields={fields}
      facet={{ field: "accountType", options: [
        { value: "checking", label: "Checking" },
        { value: "savings", label: "Savings" },
        { value: "other", label: "Other" },
      ] }}
    />
  );
}
