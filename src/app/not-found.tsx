import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <div className="text-center">
        <p className="text-sm uppercase tracking-[0.28em] text-blue-300">Jefftech</p>
        <h1 className="mt-4 text-5xl font-semibold text-white">404</h1>
        <p className="mt-4 text-slate-400">The page you requested is not available in this secure vault.</p>
        <Link href="/" className="mt-6 inline-flex rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500">
          Return home
        </Link>
      </div>
    </main>
  );
}
