const privateIpv4 = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

export function isPublicShareUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return url.protocol === "https:"
      && hostname !== "localhost"
      && hostname !== "[::1]"
      && !hostname.endsWith(".local")
      && !privateIpv4.test(hostname);
  } catch {
    return false;
  }
}

export function normalizePublicBaseUrl(value: string): string {
  const url = new URL(value.trim());
  if (!isPublicShareUrl(url.origin)) {
    throw new Error("Public address must be a public HTTPS URL, for example https://name.trycloudflare.com");
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("Public address must contain only the HTTPS origin, without a path, query, credentials, or #fragment");
  }
  return url.origin;
}

export function buildShareLink(baseUrl: string, shareId: string, fragment: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/share/${encodeURIComponent(shareId)}#${fragment.replace(/^#/, "")}`;
}

