export function safeInternalPath(path: string | null, fallback: string, origin: string) {
  if (!path?.startsWith("/") || path.startsWith("//")) return fallback;

  try {
    const destination = new URL(path, origin);
    if (destination.origin !== origin) return fallback;
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return fallback;
  }
}
