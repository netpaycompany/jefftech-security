import { VaultCategoryManager, type VaultFieldDefinition } from "@/components/vault/vault-category-manager";

const fields: VaultFieldDefinition[] = [
  { name: "name", label: "Card name", required: true },
  { name: "cardholderName", label: "Cardholder name", required: true },
  { name: "cardType", label: "Card type", type: "select", required: true, options: [
    { value: "credit", label: "Credit" },
    { value: "debit", label: "Debit" },
    { value: "virtual", label: "Virtual" },
  ] },
  { name: "network", label: "Network", placeholder: "Visa, Mastercard, etc." },
  { name: "cardNumber", label: "Card number", sensitive: true, required: true },
  { name: "expirationDate", label: "Expiration date", placeholder: "MM/YY", sensitive: true },
  { name: "securityCode", label: "Security code", sensitive: true },
  { name: "billingAddress", label: "Billing address", multiline: true, sensitive: true },
];

export default function CardsPage() {
  return (
    <VaultCategoryManager
      itemType="card"
      title="Payment Cards"
      activePath="/cards"
      description="Card numbers, expiration dates, security codes, and billing addresses are encrypted before storage."
      fields={fields}
      facet={{ field: "cardType", options: [
        { value: "credit", label: "Credit" },
        { value: "debit", label: "Debit" },
        { value: "virtual", label: "Virtual" },
      ] }}
    />
  );
}
