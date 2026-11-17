"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowLeft, Ban, Check, CircleDollarSign, CreditCard, LogOut, Search, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type TransactionStatus = "Paid" | "Pending" | "Failed" | "Refunded";
type Transaction = {
  id: string;
  customer: string;
  email: string;
  plan: string;
  amount: number;
  method: string;
  date: string;
  status: TransactionStatus;
};

type StatusFilter = "All transactions" | TransactionStatus;

const seedTransactions: Transaction[] = [
  { id: "TX-84291", customer: "Lena Martinez", email: "lena.martinez@example.com", plan: "Business annual", amount: 149.00, method: "Visa •• 4242", date: "Nov 09, 2026", status: "Paid" },
  { id: "TX-84290", customer: "Noah Bennett", email: "noah.bennett@example.com", plan: "Family monthly", amount: 8.99, method: "Mastercard •• 1088", date: "Nov 09, 2026", status: "Pending" },
  { id: "TX-84289", customer: "Priya Shah", email: "priya.shah@example.com", plan: "Business annual", amount: 149.00, method: "Visa •• 9912", date: "Nov 08, 2026", status: "Paid" },
  { id: "TX-84288", customer: "Ethan Brooks", email: "ethan.brooks@example.com", plan: "Personal monthly", amount: 3.99, method: "PayPal", date: "Nov 08, 2026", status: "Failed" },
  { id: "TX-84287", customer: "Maya Chen", email: "maya.chen@example.com", plan: "Family annual", amount: 89.00, method: "Visa •• 3160", date: "Nov 07, 2026", status: "Refunded" },
  { id: "TX-84286", customer: "Oliver James", email: "oliver.james@example.com", plan: "Personal annual", amount: 39.00, method: "Mastercard •• 4531", date: "Nov 07, 2026", status: "Paid" },
  { id: "TX-84285", customer: "Amara Okafor", email: "amara.okafor@example.com", plan: "Business monthly", amount: 14.99, method: "Visa •• 8241", date: "Nov 06, 2026", status: "Paid" },
  { id: "TX-84284", customer: "Theo Martin", email: "theo.martin@example.com", plan: "Personal monthly", amount: 3.99, method: "PayPal", date: "Nov 06, 2026", status: "Pending" },
];

const statusFilters: StatusFilter[] = ["All transactions", "Paid", "Pending", "Failed", "Refunded"];

export default function AdminTransactionsPage() {
  const isAuthenticated =
    typeof window !== "undefined" && window.sessionStorage.getItem("jefftech-admin-session") === "true";

  if (!isAuthenticated) {
    return <AdminRedirect />;
  }

  return <TransactionsContent />;
}

function TransactionsContent() {
  const router = useRouter();
  const [transactions, setTransactions] = useState(seedTransactions);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All transactions");
  const [notice, setNotice] = useState("");

  const normalizedQuery = query.trim().toLowerCase();
  const filteredTransactions = transactions.filter((transaction) => {
    const matchesQuery = `${transaction.id} ${transaction.customer} ${transaction.email}`
      .toLowerCase()
      .includes(normalizedQuery);
    const matchesStatus = statusFilter === "All transactions" || transaction.status === statusFilter;
    return matchesQuery && matchesStatus;
  });
  const collectedAmount = transactions
    .filter((transaction) => transaction.status === "Paid")
    .reduce((total, transaction) => total + transaction.amount, 0);
  const pendingCount = transactions.filter((transaction) => transaction.status === "Pending").length;
  const refundedAmount = transactions
    .filter((transaction) => transaction.status === "Refunded")
    .reduce((total, transaction) => total + transaction.amount, 0);

  const handleSignOut = () => {
    window.sessionStorage.removeItem("jefftech-admin-session");
    router.push("/admin/login");
  };

  const handleRefund = (transaction: Transaction) => {
    setTransactions((currentTransactions) =>
      currentTransactions.map((currentTransaction) =>
        currentTransaction.id === transaction.id ? { ...currentTransaction, status: "Refunded" } : currentTransaction,
      ),
    );
    setNotice(`${transaction.id} marked refunded in this demo.`);
  };

  const handleExport = () => {
    const columns = ["Transaction ID", "Customer", "Email", "Plan", "Amount USD", "Payment method", "Date", "Status"];
    const rows = filteredTransactions.map((transaction) => [
      transaction.id,
      transaction.customer,
      transaction.email,
      transaction.plan,
      transaction.amount.toFixed(2),
      transaction.method,
      transaction.date,
      transaction.status,
    ]);
    const csv = [columns, ...rows]
      .map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(","))
      .join("\r\n");
    const fileUrl = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = fileUrl;
    anchor.download = "jefftech-transactions-demo.csv";
    anchor.click();
    URL.revokeObjectURL(fileUrl);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/90">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/admin/transactions" className="flex items-center gap-3">
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
            <p className="mt-4 text-xs uppercase tracking-[0.2em] text-slate-500">Billing operations</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">Transaction management</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Review subscription payments, monitor transaction status, and export filtered records.
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={handleExport}>
            <ArrowDownToLine className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>

        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm text-amber-100">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <p>
            Prototype mode: sample transactions are held in browser memory. Refund actions only change this demo view and do not contact a payment provider.
          </p>
        </div>

        {notice && (
          <div role="status" className="mb-5 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-200">
            {notice}
          </div>
        )}

        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryMetric label="Transactions" value={transactions.length.toString()} icon={<CreditCard className="h-4 w-4" />} />
          <SummaryMetric label="Collected" value={formatCurrency(collectedAmount)} icon={<CircleDollarSign className="h-4 w-4" />} />
          <SummaryMetric label="Pending" value={pendingCount.toString()} icon={<Check className="h-4 w-4" />} />
          <SummaryMetric label="Refunded" value={formatCurrency(refundedAmount)} icon={<Ban className="h-4 w-4" />} />
        </div>

        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <div className="flex flex-col gap-3 border-b border-slate-800 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search ID, customer, or email"
                aria-label="Search transactions"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-blue-500"
              />
            </div>
            <label className="flex items-center gap-3 text-sm text-slate-400">
              Status
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
                  <th scope="col" className="px-5 py-3 font-medium">Transaction</th>
                  <th scope="col" className="px-5 py-3 font-medium">Customer</th>
                  <th scope="col" className="px-5 py-3 font-medium">Plan</th>
                  <th scope="col" className="px-5 py-3 font-medium">Payment method</th>
                  <th scope="col" className="px-5 py-3 font-medium">Date</th>
                  <th scope="col" className="px-5 py-3 font-medium">Status</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Amount</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredTransactions.map((transaction) => (
                  <tr key={transaction.id} className="align-middle hover:bg-slate-800/30">
                    <td className="whitespace-nowrap px-5 py-4 font-medium text-blue-200">{transaction.id}</td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-white">{transaction.customer}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{transaction.email}</p>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-300">{transaction.plan}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-400">{transaction.method}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-400">{transaction.date}</td>
                    <td className="px-5 py-4">
                      <StatusBadge status={transaction.status} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-right font-medium text-white">{formatCurrency(transaction.amount)}</td>
                    <td className="px-5 py-4 text-right">
                      {transaction.status === "Paid" ? (
                        <button
                          type="button"
                          onClick={() => handleRefund(transaction)}
                          className="rounded-lg border border-red-500/25 px-3 py-2 text-xs font-medium text-red-200 hover:bg-red-500/10"
                        >
                          Mark refunded
                        </button>
                      ) : (
                        <span className="text-xs text-slate-600">No action</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredTransactions.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-sm text-slate-400">
                      No transactions match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-800 px-5 py-3 text-xs text-slate-500">
            Showing {filteredTransactions.length} of {transactions.length} sample transactions
          </div>
        </section>
      </main>
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

function StatusBadge({ status }: { status: TransactionStatus }) {
  const style = status === "Paid"
    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
    : status === "Pending"
      ? "border-amber-500/25 bg-amber-500/10 text-amber-200"
      : status === "Failed"
        ? "border-red-500/25 bg-red-500/10 text-red-200"
        : "border-slate-600 bg-slate-800 text-slate-300";

  return <span className={`rounded-full border px-2.5 py-1 text-xs ${style}`}>{status}</span>;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
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
