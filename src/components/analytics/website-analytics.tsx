"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const SESSION_STORAGE_KEY = "jefftech-analytics-session";
const HEARTBEAT_INTERVAL_MS = 15_000;

function getSessionId() {
  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (stored && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored)) {
      return stored;
    }
    const sessionId = crypto.randomUUID();
    sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    return sessionId;
  } catch {
    return crypto.randomUUID();
  }
}

export function WebsiteAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin") || pathname.startsWith("/api/")) return;

    const sessionId = getSessionId();
    const visitId = crypto.randomUUID();
    let activeSince: number | null = document.visibilityState === "visible" ? Date.now() : null;
    let accumulatedSeconds = 0;

    const record = (useBeacon = false) => {
      if (activeSince !== null) {
        accumulatedSeconds += Math.floor((Date.now() - activeSince) / 1_000);
        activeSince = Date.now();
      }
      const payload = JSON.stringify({
        visitId,
        sessionId,
        pagePath: pathname,
        durationSeconds: Math.min(accumulatedSeconds, 7_200),
      });
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon("/api/analytics/visit", new Blob([payload], { type: "application/json" }));
        return;
      }
      void fetch("/api/analytics/visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {
        console.warn("Website analytics event could not be recorded.");
      });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        record();
        activeSince = null;
      } else if (activeSince === null) {
        activeSince = Date.now();
      }
    };
    const onPageHide = () => record(true);
    const heartbeat = window.setInterval(record, HEARTBEAT_INTERVAL_MS);

    record();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      record();
    };
  }, [pathname]);

  return null;
}
