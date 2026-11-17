import { VaultCategoryManager, type VaultFieldDefinition } from "@/components/vault/vault-category-manager";

const fields: VaultFieldDefinition[] = [
  { name: "title", label: "Note title", required: true },
  { name: "text", label: "Private note", multiline: true, sensitive: true, required: true },
];

export default function NotesPage() {
  return (
    <VaultCategoryManager
      itemType="note"
      title="Secure Notes"
      activePath="/notes"
      description="Private text is encrypted in your browser and revealed only while the vault is unlocked."
      fields={fields}
    />
  );
}
