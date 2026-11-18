"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowDownUp,
  BadgeCheck,
  Building2,
  ChevronRight,
  CreditCard,
  FileLock2,
  FileText,
  IdCard,
  KeyRound,
  NotebookPen,
  Plus,
  Search,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { useVault } from "@/components/vault/vault-provider";

const categories = [
  { label: "Passwords", actionLabel: "Add password", itemType: "password", href: "/passwords", description: "Website, app, and account passwords", icon: KeyRound, color: "text-sky-300 bg-sky-500/20" },
  { label: "Secure Notes", actionLabel: "New secure note", itemType: "note", href: "/notes", description: "Private notes, codes, and important info", icon: NotebookPen, color: "text-fuchsia-300 bg-violet-500/20" },
  { label: "Identities", actionLabel: "Add identity", itemType: "identity", href: "/identities", description: "Personal details, addresses, and IDs", icon: IdCard, color: "text-teal-300 bg-teal-500/20" },
  { label: "Payment Cards", actionLabel: "Add payment card", itemType: "card", href: "/cards", description: "Credit, debit, and virtual cards", icon: CreditCard, color: "text-amber-300 bg-amber-500/20" },
  { label: "Bank Accounts", actionLabel: "Add bank account", itemType: "bank_account", href: "/bank-accounts", description: "Bank and financial account details", icon: Building2, color: "text-cyan-300 bg-cyan-500/20" },
  { label: "Recovery Codes", actionLabel: "Add recovery codes", itemType: "recovery_code", href: "/recovery-codes", description: "Two-factor (2FA) and backup codes", icon: FileLock2, color: "text-violet-300 bg-indigo-500/20" },
  { label: "Software Licenses", actionLabel: "Add software license", itemType: "license", href: "/licenses", description: "Product keys and license details", icon: BadgeCheck, color: "text-emerald-300 bg-teal-500/20" },
  { label: "Secure Documents", actionLabel: "Add secure document", itemType: "document", href: "/documents", description: "Encrypted files and important documents", icon: FileText, color: "text-sky-300 bg-blue-500/20" },
];

export default function VaultPage() {
  const { session } = useVault();
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const visibleCategories = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return categories.filter((category) => {
      if (selectedCategory !== "all" && category.itemType !== selectedCategory) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      const categoryMatches = `${category.label} ${category.description}`.toLocaleLowerCase().includes(normalizedQuery);
      const itemMatches = session?.records.some((record) =>
        record.itemType === category.itemType
        && JSON.stringify(record.content).toLocaleLowerCase().includes(normalizedQuery),
      );
      return categoryMatches || itemMatches;
    });
  }, [query, selectedCategory, session?.records]);

  return (
    <AppShell title="Vault Items" activePath="/vault">
      <section className="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-6">
        <div>
          <p className="mt-1 text-sm text-slate-300 sm:text-base">All your secure data, encrypted and organized.</p>
        </div>
        <details className="relative">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-cyan-300/50 bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 [&::-webkit-details-marker]:hidden">
            <Plus className="h-4 w-4" />
            Add Item
          </summary>
          <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-2xl border border-slate-700 bg-slate-950 p-2 shadow-2xl shadow-black/50">
            {categories.map(({ actionLabel, href, icon: Icon }) => (
              <Link key={href} href={href} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-200 hover:bg-slate-900">
                <Icon className="h-4 w-4 text-blue-300" />
                {actionLabel}
              </Link>
            ))}
          </div>
        </details>
      </section>

      <section aria-label="Search and filter vault items" className="mb-5 flex gap-2 sm:mb-6">
        <label className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-blue-400/40 bg-gradient-to-r from-blue-950/70 to-slate-950 px-3.5 py-3 focus-within:border-blue-300">
          <Search className="h-5 w-5 shrink-0 text-blue-200" />
          <span className="sr-only">Search vault items</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search vault items..."
            className="w-full min-w-0 bg-transparent text-sm text-white outline-none placeholder:text-slate-300"
          />
        </label>
        <details className="relative">
          <summary aria-label="Filter by category" className="flex h-12 w-12 cursor-pointer list-none items-center justify-center rounded-2xl border border-blue-400/40 bg-slate-950 text-blue-200 [&::-webkit-details-marker]:hidden">
            <ArrowDownUp className="h-5 w-5" />
          </summary>
          <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-2xl border border-slate-700 bg-slate-950 p-3 shadow-2xl shadow-black/50">
            <label htmlFor="vault-category-filter" className="mb-2 block text-xs font-medium text-slate-300">Filter by category</label>
            <select
              id="vault-category-filter"
              value={selectedCategory}
              onChange={(event) => setSelectedCategory(event.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white"
            >
              <option value="all">All categories</option>
              {categories.map((category) => <option key={category.itemType} value={category.itemType}>{category.label}</option>)}
            </select>
          </div>
        </details>
      </section>

      <section aria-label="Vault categories" className="space-y-2 sm:space-y-3">
        {visibleCategories.map(({ label, itemType, href, description, icon: Icon, color }) => {
          const count = session?.records.filter((record) => record.itemType === itemType).length;
          return (
            <Link
              key={itemType}
              href={href}
              className="group flex min-h-[76px] items-center gap-3 rounded-2xl border border-blue-500/25 bg-gradient-to-r from-blue-950/70 via-slate-900 to-slate-950 px-3 py-3 transition-colors hover:border-blue-400/60 sm:min-h-[80px] sm:gap-4 sm:px-5"
            >
              <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full sm:h-14 sm:w-14 ${color}`}>
                <Icon className="h-6 w-6 sm:h-7 sm:w-7" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-semibold text-white sm:text-lg">{label}</span>
                <span className="mt-0.5 block truncate text-xs text-slate-300 sm:text-sm">{description}</span>
              </span>
              <span className="flex h-9 min-w-10 shrink-0 items-center justify-center rounded-full bg-blue-400/15 px-3 text-sm font-semibold text-slate-100">
                {count === undefined ? "—" : count.toLocaleString()}
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5" />
            </Link>
          );
        })}
        {visibleCategories.length === 0 && (
          <p className="rounded-2xl border border-dashed border-blue-300/40 bg-slate-950/40 px-4 py-8 text-center text-sm text-slate-300">
            No vault categories match your search.
          </p>
        )}
      </section>

      {!session && (
        <p className="mt-4 text-center text-xs text-slate-400">
          Unlock your vault to see item counts and manage encrypted records.
        </p>
      )}
    </AppShell>
  );
}
