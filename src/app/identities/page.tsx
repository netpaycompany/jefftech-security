import { VaultCategoryManager, type VaultFieldDefinition } from "@/components/vault/vault-category-manager";

const fields: VaultFieldDefinition[] = [
  { name: "fullName", label: "Full name", required: true },
  { name: "recordType", label: "Identity type", type: "select", options: [
    { value: "personal", label: "Personal" },
    { value: "address", label: "Address" },
    { value: "identification", label: "Identification" },
    { value: "other", label: "Other" },
  ] },
  { name: "email", label: "Email", type: "email" },
  { name: "phone", label: "Phone" },
  { name: "address", label: "Address", multiline: true, sensitive: true },
  { name: "dateOfBirth", label: "Date of birth", type: "date", sensitive: true },
  { name: "identificationNumber", label: "Identification number", sensitive: true },
  { name: "passportNumber", label: "Passport number", sensitive: true },
  { name: "otherDetails", label: "Other personal details", multiline: true, sensitive: true },
];

export default function IdentitiesPage() {
  return (
    <VaultCategoryManager
      itemType="identity"
      title="Identities"
      activePath="/identities"
      description="Store personal and passport information as encrypted vault records."
      fields={fields}
      facet={{ field: "recordType", options: [
        { value: "personal", label: "Personal" },
        { value: "address", label: "Address" },
        { value: "identification", label: "ID" },
        { value: "other", label: "Other" },
      ] }}
    />
  );
}
