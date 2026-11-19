import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Check,
  ChevronRight,
  CreditCard,
  FileLock2,
  Fingerprint,
  Image,
  KeyRound,
  LockKeyhole,
  NotebookPen,
  RefreshCw,
  Shield,
  ShieldCheck,
  Smartphone,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";

const features = [
  {
    icon: LockKeyhole,
    title: "Your vault stays yours",
    description: "Passwords are encrypted on your device before they sync. Your master password is never sent to the server.",
    href: "/passwords",
    link: "Explore passwords",
  },
  {
    icon: Activity,
    title: "Know where you stand",
    description: "Review weak, reused, and aging passwords with security checks that analyze your vault locally.",
    href: "/security",
    link: "Visit security center",
  },
  {
    icon: WandSparkles,
    title: "Create stronger logins",
    description: "Generate secure passwords and passphrases to use when you update or create an account.",
    href: "/generator",
    link: "Open the generator",
  },
  {
    icon: FileLock2,
    title: "Keep private files close",
    description: "Store sensitive documents as encrypted vault items, with file contents protected before upload.",
    href: "/documents",
    link: "Explore documents",
  },
  {
    icon: Image,
    title: "A private photo space",
    description: "Keep selected personal photos encrypted locally in your browser and under your control.",
    href: "/photos",
    link: "Explore private photos",
  },
  {
    icon: Smartphone,
    title: "Stay in control of devices",
    description: "Review trusted devices and manage the devices you use to access your account.",
    href: "/devices",
    link: "Manage devices",
  },
];

const vaultItems = [
  { icon: KeyRound, label: "Passwords", href: "/passwords" },
  { icon: NotebookPen, label: "Secure notes", href: "/notes" },
  { icon: CreditCard, label: "Cards & accounts", href: "/cards" },
  { icon: FileLock2, label: "Documents", href: "/documents" },
  { icon: Image, label: "Private photos", href: "/photos" },
  { icon: Fingerprint, label: "Recovery codes", href: "/recovery-codes" },
];

const securityPoints = [
  "Client-side encryption before sync",
  "Argon2id key derivation",
  "AES-256-GCM authenticated encryption",
  "Recovery key controlled by you",
];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-slate-950 text-slate-50">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[680px] bg-[radial-gradient(ellipse_at_top,rgba(37,99,235,0.2),transparent_65%)]" />
      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <header className="flex items-center justify-between border-b border-white/10 py-5">
          <Link href="/" className="flex items-center gap-3" aria-label="Jefftech Security home">
            <BrandLogo size={48} priority />
            <span>
              <span className="block text-[10px] uppercase tracking-[0.28em] text-slate-400">Jefftech</span>
              <span className="block text-sm font-semibold tracking-[0.12em] text-white">SECURITY</span>
            </span>
          </Link>

          <nav aria-label="Main navigation" className="hidden items-center gap-7 text-sm text-slate-300 lg:flex">
            <Link className="transition hover:text-white" href="#features">Features</Link>
            <Link className="transition hover:text-white" href="#vault">Your vault</Link>
            <Link className="transition hover:text-white" href="#security">Security</Link>
            <Link className="transition hover:text-white" href="#getting-started">Getting started</Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="secondary" size="sm">Login</Button>
            </Link>
            <Link href="/signup">
              <Button size="sm">Create account</Button>
            </Link>
          </div>
        </header>

        <section className="grid items-center gap-14 py-20 sm:py-28 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-200">
              <Sparkles className="h-3.5 w-3.5" />
              Private by design. Simple to use.
            </div>
            <h1 className="max-w-2xl text-5xl font-semibold leading-[1.08] tracking-tight text-white sm:text-6xl">
              Keep your digital life under your control.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
              Secure passwords, notes, documents, and more in one encrypted vault. Your secrets are protected before they leave your device.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link href="/signup">
                <Button size="lg">
                  Create your vault <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="#features">
                <Button variant="secondary" size="lg">Explore features</Button>
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-300">
              <span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-emerald-300" /> Your master password stays private</span>
              <span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-emerald-300" /> Encrypted before sync</span>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-6 rounded-[40px] bg-blue-500/10 blur-3xl" />
            <div className="relative rounded-[30px] border border-slate-700/80 bg-slate-900/90 p-4 shadow-2xl shadow-blue-950/40 sm:p-6">
              <div className="rounded-[22px] border border-slate-800 bg-slate-950 p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-blue-300">Jefftech Security</p>
                    <h2 className="mt-2 text-xl font-semibold text-white">One vault. Your keys.</h2>
                    <p className="mt-1 text-sm text-slate-400">Protection starts on your device.</p>
                  </div>
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-300">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                </div>

                <div className="mt-7 space-y-3">
                  {[
                    { icon: LockKeyhole, title: "Encrypt on your device", text: "Vault contents are encrypted before syncing." },
                    { icon: KeyRound, title: "Unlock with your master password", text: "Your secret is never uploaded." },
                    { icon: RefreshCw, title: "Access across trusted devices", text: "Sync encrypted vault data securely." },
                  ].map(({ icon: Icon, title, text }) => (
                    <div key={title} className="flex items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-300">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span>
                        <span className="block text-sm font-medium text-slate-100">{title}</span>
                        <span className="mt-1 block text-xs leading-5 text-slate-400">{text}</span>
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-5 flex items-center gap-2 text-xs text-slate-500">
                  <LockKeyhole className="h-3.5 w-3.5" /> No sample accounts or security scores—just your private vault.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="scroll-mt-8 py-16 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-300">Made for everyday security</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              More than a place to save passwords
            </h2>
            <p className="mt-4 leading-7 text-slate-400">
              Practical tools help you protect, organize, and take care of the information that matters.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, description, href, link }) => (
              <article key={title} className="group rounded-3xl border border-slate-800 bg-slate-900/70 p-6 transition hover:border-blue-400/30 hover:bg-slate-900">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-400/10 bg-blue-500/10 text-blue-300">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-white">{title}</h3>
                <p className="mt-3 min-h-[4.5rem] text-sm leading-6 text-slate-400">{description}</p>
                <Link href={href} className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-blue-300 transition group-hover:text-blue-200">
                  {link}<ChevronRight className="h-4 w-4" />
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section id="vault" className="scroll-mt-8 border-y border-slate-800/80 py-16 sm:py-20">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-300">A place for what matters</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Your essentials, organized in one vault.
              </h2>
            </div>
            <p className="max-w-2xl leading-7 text-slate-400">
              Keep different kinds of sensitive information together while keeping vault contents encrypted and accessible only when you unlock your vault.
            </p>
          </div>
          <div className="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {vaultItems.map(({ icon: Icon, label, href }) => (
              <Link key={label} href={href} className="flex min-h-28 flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/70 p-4 transition hover:border-blue-400/30 hover:bg-slate-900">
                <Icon className="h-5 w-5 text-blue-300" />
                <span className="mt-5 text-sm font-medium text-slate-200">{label}</span>
              </Link>
            ))}
          </div>
        </section>

        <section id="security" className="scroll-mt-8 py-16 sm:py-20">
          <div className="overflow-hidden rounded-[30px] border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950/30 p-6 sm:p-10">
            <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
              <div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-300">
                  <Shield className="h-6 w-6" />
                </div>
                <p className="mt-6 text-xs font-semibold uppercase tracking-[0.24em] text-blue-300">Security you can understand</p>
                <h2 className="mt-3 text-3xl font-semibold leading-tight text-white sm:text-4xl">
                  Built around your privacy, not ours.
                </h2>
                <p className="mt-4 leading-7 text-slate-400">
                  Your master password is used on your device to unlock the vault. Jefftech stores encrypted vault data—not a readable copy of your secrets.
                </p>
                <Link href="/security" className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-blue-300 hover:text-blue-200">
                  Learn about your security center <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {securityPoints.map((point) => (
                  <div key={point} className="flex min-h-24 items-start gap-3 rounded-2xl border border-slate-700/80 bg-slate-950/50 p-4">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-sm leading-6 text-slate-200">{point}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="getting-started" className="scroll-mt-8 pb-20 pt-4 sm:pb-24">
          <div className="rounded-[30px] border border-blue-400/15 bg-blue-500/[0.07] px-6 py-10 text-center sm:px-12 sm:py-14">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-200">
              <Sparkles className="h-6 w-6" />
            </div>
            <h2 className="mx-auto mt-5 max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              A more private way to manage your digital life.
            </h2>
            <p className="mx-auto mt-4 max-w-xl leading-7 text-slate-300">
              Create your account, set up your vault master password, and start organizing your important information.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link href="/signup"><Button size="lg">Get started <ArrowRight className="ml-2 h-4 w-4" /></Button></Link>
              <Link href="/login"><Button size="lg" variant="secondary">Sign in</Button></Link>
            </div>
          </div>
        </section>

        <footer className="border-t border-slate-800 py-10 sm:py-12">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
            <div>
              <Link href="/" className="inline-flex items-center gap-3" aria-label="Jefftech Security home">
                <BrandLogo size={48} />
                <span>
                  <span className="block text-[10px] uppercase tracking-[0.28em] text-slate-400">Jefftech</span>
                  <span className="block text-sm font-semibold tracking-[0.12em] text-white">SECURITY</span>
                </span>
              </Link>
              <p className="mt-4 max-w-xs text-sm leading-6 text-slate-400">
                Private, encrypted tools to help you keep your important information under your control.
              </p>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Explore</h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-400">
                <li><Link className="hover:text-white" href="#features">Features</Link></li>
                <li><Link className="hover:text-white" href="#vault">Your vault</Link></li>
                <li><Link className="hover:text-white" href="#security">Security</Link></li>
                <li><Link className="hover:text-white" href="/generator">Password generator</Link></li>
              </ul>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Your account</h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-400">
                <li><Link className="hover:text-white" href="/signup">Create account</Link></li>
                <li><Link className="hover:text-white" href="/login">Sign in</Link></li>
                <li><Link className="hover:text-white" href="/devices">Trusted devices</Link></li>
                <li><Link className="hover:text-white" href="/recovery">Recovery options</Link></li>
              </ul>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Vault tools</h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-400">
                <li><Link className="hover:text-white" href="/passwords">Passwords</Link></li>
                <li><Link className="hover:text-white" href="/notes">Secure notes</Link></li>
                <li><Link className="hover:text-white" href="/documents">Documents</Link></li>
                <li><Link className="hover:text-white" href="/photos">Private photos</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-10 flex flex-col gap-3 border-t border-slate-800 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <p>© 2026 Jefftech Security. Your privacy matters.</p>
            <p className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-blue-300" /> Encrypted on your device</p>
          </div>
        </footer>
      </div>
    </main>
  );
}
