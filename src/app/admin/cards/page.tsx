"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ban, Check, CreditCard, Eye, LogOut, Search, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type CardStatus = "Active" | "Needs review";
type CardRecord = {
  id: string;
  label: string;
  brand: string;
  maskedNumber: string;
  holder: string;
  email: string;
  vault: string;
  expiry: string;
  updated: string;
  status: CardStatus;
};

type StatusFilter = "All cards" | CardStatus;

const seedCards: CardRecord[] = [
  { id: "CARD-4821", label: "Primary Visa", brand: "Visa", maskedNumber: "•••• 1842", holder: "Lena Martinez", email: "lena.martinez@example.com", vault: "Primary Vault", expiry: "08/2028", updated: "Nov 09, 2026", status: "Active" },
  { id: "CARD-4819", label: "Travel Mastercard", brand: "Mastercard", maskedNumber: "•••• 2914", holder: "Noah Bennett", email: "noah.bennett@example.com", vault: "Work Vault", expiry: "11/2027", updated: "Nov 08, 2026", status: "Active" },
  { id: "CARD-4816", label: "Business Visa", brand: "Visa", maskedNumber: "•••• 6407", holder: "Priya Shah", email: "priya.shah@example.com", vault: "Primary Vault", expiry: "03/2027", updated: "Nov 07, 2026", status: "Needs review" },
  { id: "CARD-4811", label: "Family Amex", brand: "American Express", maskedNumber: "•••• 1005", holder: "Ethan Brooks", email: "ethan.brooks@example.com", vault: "Family Vault", expiry: "06/2029", updated: "Nov 06, 2026", status: "Active" },
  { id: "CARD-4808", label: "Backup Visa", brand: "Visa", maskedNumber: "•••• 9113", holder: "Maya Chen", email: "maya.chen@example.com", vault: "Primary Vault", expiry: "02/2028", updated: "Nov 05, 2026", status: "Active" },
  { id: "CARD-4802", label: "Personal Mastercard", brand: "Mastercard", maskedNumber: "•••• 7370", holder: "Oliver James", email: "oliver.james@example.com", vault: "Personal Vault", expiry: "09/2027", updated: "Nov 03, 2026", status: "Needs review" },
];

const statusFilters: StatusFilter[] = ["All cards", "Active", "Needs review"];

export default function AdminCardsPage() {
  const isAuthenticated =
    typeof window !== "undefined" && window.sessionStorage.getItem("jefftech-admin-session") === "true";

  if (!isAuthenticated) {
    return <AdminRedirect />;
  }

  return <CardsContent />;
}

function CardsContent() {
  const router = useRouter();
  const [cards, setCards] = useState(seedCards);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All cards");
  const [selectedCard, setSelectedCard] = useState<CardRecord | null>(null);
  const [notice, setNotice] = useState("");

  const normalizedQuery = query.trim().toLowerCase();
  const filteredCards = cards.filter((card) => {
    const matchesQuery = `${card.id} ${card.label} ${card.brand} ${card.maskedNumber} ${card.holder} ${card.email}`
      .toLowerCase()
      .includes(normalizedQuery);
    const matchesStatus = statusFilter === "All cards" || card.status === statusFilter;
    return matchesQuery && matchesStatus;
  });
  const reviewCount = cards.filter((card) => card.status === "Needs review").length;
  const brandCount = new Set(cards.map((card) => card.brand)).size;

  const handleSignOut = () => {
    window.sessionStorage.removeItem("jefftech-admin-session");
    router.push("/admin/login");
  };

  const handleReviewToggle = (card: CardRecord) => {
    const nextStatus: CardStatus = card.status === "Active" ? "Needs review" : "Active";
    setCards((currentCards) =>
      currentCards.map((currentCard) => currentCard.id === card.id ? { ...currentCard, status: nextStatus } : currentCard),
    );
    setNotice(`${card.id} marked ${nextStatus === "Active" ? "reviewed" : "for review"} in this demo.`);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/90">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/admin/cards" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/15 text-blue-300">
              <CreditCard className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-[10px] uppercase tracking-[0.24em] text-slate-400">Jefftech Security</span>
              <span className="block text-sm font-semibold text-white">ADMIN CONTROL CENTER</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/admin" className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:border-slate-500">
              Admin overview
            </Link>
            <Link href="/admin/users" className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:border-slate-500">
              User management
            </Link>
            <Link href="/admin/transactions" className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:border-slate-500">
              Transactions
            </Link>
            <Link href="/admin/vaults" className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:border-slate-500">
              Vault management
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-2 rounded-xl border border-red-500/25 px-3 py-2 text-sm text-red-200 hover:bg-red-500/10"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/admin" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
              <ArrowLeft className="h-4 w-4" />
              Admin overview
            </Link>
            <p className="mt-4 text-xs uppercase tracking-[0.2em] text-slate-500">Payment data inventory</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">Cards management</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Review masked payment-card metadata stored in vaults. Sensitive card details remain encrypted and private.
            </p>
          </div>
        </div>

        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm text-amber-100">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <p>
            Prototype mode: sample card metadata and review flags are held in browser memory. Full card numbers, security codes, and encrypted payloads are not available in this admin view.
          </p>
        </div>

        {notice && (
          <div role="status" className="mb-5 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-200">
            {notice}
          </div>
        )}

        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryMetric label="Stored cards" value={cards.length.toString()} icon={<CreditCard className="h-4 w-4" />} />
          <SummaryMetric label="Active cards" value={(cards.length - reviewCount).toString()} icon={<Check className="h-4 w-4" />} />
          <SummaryMetric label="Needs review" value={reviewCount.toString()} icon={<Ban className="h-4 w-4" />} />
          <SummaryMetric label="Card brands" value={brandCount.toString()} icon={<ShieldCheck className="h-4 w-4" />} />
        </div>

        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <div className="flex flex-col gap-3 border-b border-slate-800 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search owner, card, or ID"
                aria-label="Search cards"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-blue-500"
              />
            </div>
            <label className="flex items-center gap-3 text-sm text-slate-400">
              Review status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-blue-500"
              >
                {statusFilters.map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead className="bg-slate-950/70 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">Card</th>
                  <th scope="col" className="px-5 py-3 font-medium">Owner</th>
                  <th scope="col" className="px-5 py-3 font-medium">Vault</th>
                  <th scope="col" className="px-5 py-3 font-medium">Expires</th>
                  <th scope="col" className="px-5 py-3 font-medium">Last updated</th>
                  <th scope="col" className="px-5 py-3 font-medium">Review status</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Management</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredCards.map((card) => (
                  <tr key={card.id} className="align-middle hover:bg-slate-800/30">
                    <td className="px-5 py-4">
                      <p className="font-medium text-white">{card.label}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{card.brand} {card.maskedNumber} · {card.id}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-200">{card.holder}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{card.email}</p>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-300">{card.vault}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-400">{card.expiry}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-400">{card.updated}</td>
                    <td className="px-5 py-4">
                      <CardStatusBadge status={card.status} />
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedCard(card)}
                          aria-label={`View metadata for ${card.id}`}
                          title="View metadata"
                          className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:border-slate-500 hover:text-white"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReviewToggle(card)}
                          className={card.status === "Active"
                            ? "rounded-lg border border-amber-500/25 px-3 py-2 text-xs font-medium text-amber-200 hover:bg-amber-500/10"
                            : "rounded-lg border border-emerald-500/25 px-3 py-2 text-xs font-medium text-emerald-200 hover:bg-emerald-500/10"}
                        >
                          {card.status === "Active" ? "Flag review" : "Mark reviewed"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredCards.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-sm text-slate-400">
                      No cards match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-800 px-5 py-3 text-xs text-slate-500">
            Showing {filteredCards.length} of {cards.length} sample cards
          </div>
        </section>
      </main>

      {selectedCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="card-details-title"
            className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Masked metadata only</p>
                <h2 id="card-details-title" className="mt-2 text-xl font-semibold text-white">{selectedCard.label}</h2>
                <p className="mt-1 text-sm text-slate-400">{selectedCard.id}</p>
              </div>
              <button type="button" onClick={() => setSelectedCard(null)} className="text-sm text-slate-400 hover:text-white">
                Close
              </button>
            </div>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <Metadata label="Card brand" value={selectedCard.brand} />
              <Metadata label="Masked number" value={selectedCard.maskedNumber} />
              <Metadata label="Cardholder" value={selectedCard.holder} />
              <Metadata label="Account email" value={selectedCard.email} />
              <Metadata label="Vault" value={selectedCard.vault} />
              <Metadata label="Expiration" value={selectedCard.expiry} />
              <Metadata label="Last updated" value={selectedCard.updated} />
              <Metadata label="Review status" value={selectedCard.status} />
            </dl>
            <p className="mt-6 rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 text-sm text-blue-100">
              Full card number, security code, and encrypted payload are not available to administrators.
            </p>
            <div className="mt-6 flex justify-end">
              <Button type="button" variant="secondary" onClick={() => setSelectedCard(null)}>Close details</Button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function SummaryMetric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div>
        <p className="text-sm text-slate-400">{label}</p>
        <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      </div>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-300">{icon}</span>
    </div>
  );
}

function CardStatusBadge({ status }: { status: CardStatus }) {
  const style = status === "Active"
    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
    : "border-amber-500/25 bg-amber-500/10 text-amber-200";

  return <span className={`rounded-full border px-2.5 py-1 text-xs ${style}`}>{status}</span>;
}

function Metadata({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-slate-200">{value}</dd>
    </div>
  );
}

function AdminRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/login");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
      <div className="rounded-2xl border border-slate-800 bg-slate-900 px-6 py-4 text-sm text-slate-300">
        Redirecting to admin login...
      </div>
    </div>
  );
}
