"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, LoaderCircle, RefreshCw, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type SecurityNotification = {
  id: string;
  event_type: string;
  severity: string;
  created_at: string;
};

const eventDetails: Record<string, { title: string; href: string }> = {
  device_registered: { title: "A browser was registered", href: "/profile/my-devices" },
  device_verified: { title: "A browser was verified", href: "/profile/my-devices" },
  device_revoked: { title: "A device registration was removed", href: "/profile/my-devices" },
  mfa_enabled: { title: "Two-factor authentication was enabled", href: "/profile/security-settings" },
  mfa_disabled: { title: "Two-factor authentication was disabled", href: "/profile/security-settings" },
  vault_item_conflict: { title: "A vault item conflict was detected", href: "/security" },
  encrypted_backup_created: { title: "An encrypted backup was created", href: "/profile/my-devices" },
  extension_revoked: { title: "A browser extension was disconnected", href: "/profile/security-settings" },
};

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Time unavailable";
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<SecurityNotification[]>([]);
  const [lastReadAt, setLastReadAt] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isMarkingRead, setIsMarkingRead] = useState(false);
  const [hasAccount, setHasAccount] = useState(false);
  const [error, setError] = useState("");

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !lastReadAt || notification.created_at > lastReadAt).length,
    [lastReadAt, notifications],
  );

  const loadNotifications = useCallback(async () => {
    setError("");
    const client = createClient();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError) throw new Error(`Unable to verify your account for notifications: ${authError.message}`);
    if (!user) {
      setHasAccount(false);
      setNotifications([]);
      setLastReadAt("");
      return;
    }

    setHasAccount(true);
    const [eventsResult, readResult] = await Promise.all([
      client.from("security_events").select("id,event_type,severity,created_at")
        .eq("profile_id", user.id).order("created_at", { ascending: false }).limit(25),
      client.from("notification_reads").select("last_read_at")
        .eq("profile_id", user.id).maybeSingle(),
    ]);
    if (eventsResult.error) throw new Error(`Unable to load security notifications: ${eventsResult.error.message}`);
    if (readResult.error) throw new Error(`Unable to load notification status: ${readResult.error.message}`);
    setNotifications(eventsResult.data ?? []);
    setLastReadAt(readResult.data?.last_read_at ?? "");
  }, []);

  useEffect(() => {
    let active = true;
    const client = createClient();
    const refresh = () => {
      void loadNotifications().catch((caughtError: unknown) => {
        if (active) setError(caughtError instanceof Error ? caughtError.message : "Unable to load notifications.");
      }).finally(() => {
        if (active) setIsLoading(false);
      });
    };
    refresh();
    const { data: { subscription } } = client.auth.onAuthStateChange(() => window.setTimeout(() => {
      if (active) refresh();
    }, 0));
    const intervalId = window.setInterval(refresh, 60_000);
    return () => {
      active = false;
      subscription.unsubscribe();
      window.clearInterval(intervalId);
    };
  }, [loadNotifications]);

  const markAllRead = async () => {
    setIsMarkingRead(true);
    setError("");
    try {
      const { data: { user }, error: authError } = await createClient().auth.getUser();
      if (authError) throw new Error(`Unable to verify your account: ${authError.message}`);
      if (!user) throw new Error("Sign in to update notification status.");
      const { data: readAt, error: saveError } = await createClient().rpc("mark_security_notifications_read");
      if (saveError) throw new Error(`Unable to mark notifications as read: ${saveError.message}`);
      if (typeof readAt !== "string") throw new Error("The notification read state returned an invalid timestamp.");
      setLastReadAt(readAt);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to update notifications.");
    } finally {
      setIsMarkingRead(false);
    }
  };

  if (!hasAccount && !isLoading) return null;

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : error ? "Notifications unavailable" : "Notifications"}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-200 hover:bg-slate-900"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-400 px-1 text-[10px] font-bold text-slate-950">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
        {error && !unreadCount && <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-red-400" aria-hidden="true" />}
      </button>
      {isOpen && (
        <section aria-label="Security notifications" className="absolute right-0 top-full z-[60] mt-3 max-h-[min(34rem,75vh)] w-[min(23rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-4 shadow-2xl shadow-black/60">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-blue-200">Account activity</p>
              <h2 className="mt-1 text-base font-semibold text-white">Notifications</h2>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" aria-label="Refresh notifications" onClick={() => {
                setIsLoading(true);
                void loadNotifications().catch((caughtError: unknown) => setError(caughtError instanceof Error ? caughtError.message : "Unable to load notifications.")).finally(() => setIsLoading(false));
              }} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800">
                <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              </button>
              <button type="button" aria-label="Mark all notifications as read" disabled={!unreadCount || isMarkingRead} onClick={() => void markAllRead()} className="flex h-9 w-9 items-center justify-center rounded-lg text-cyan-200 hover:bg-slate-800 disabled:opacity-40">
                {isMarkingRead ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {error && <p role="alert" className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">{error}</p>}
          {isLoading ? (
            <p role="status" className="mt-5 text-sm text-slate-400">Loading account activity…</p>
          ) : notifications.length ? (
            <ul className="mt-3 space-y-2">
              {notifications.map((notification) => {
                const detail = eventDetails[notification.event_type] ?? { title: "A security event was recorded", href: "/security" };
                const unread = !lastReadAt || notification.created_at > lastReadAt;
                return (
                  <li key={notification.id}>
                    <Link href={detail.href} onClick={() => setIsOpen(false)} className={`block rounded-xl border p-3 hover:bg-slate-900 ${unread ? "border-blue-400/30 bg-blue-500/5" : "border-slate-800 bg-slate-950"}`}>
                      <span className="flex items-start gap-2">
                        <ShieldAlert className={`mt-0.5 h-4 w-4 shrink-0 ${notification.severity === "warning" ? "text-amber-300" : "text-cyan-300"}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-slate-100">{detail.title}</span>
                          <time className="mt-1 block text-xs text-slate-400">{formatTime(notification.created_at)}</time>
                        </span>
                        {unread && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-cyan-300" aria-label="Unread" />}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-5 rounded-xl border border-dashed border-slate-700 p-5 text-center text-sm text-slate-400">No security notifications yet.</p>
          )}
          <p className="mt-3 text-[11px] leading-5 text-slate-500">The latest 25 security events are shown. Notification read status is saved to your account.</p>
        </section>
      )}
    </div>
  );
}
