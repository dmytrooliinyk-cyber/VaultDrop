import type { ShareInfo } from "../api/client";

export function bytes(value: number): string {
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB"];
  let size = value / 1024;
  let unit = units[0];
  for (let index = 1; size >= 1024 && index < units.length; index += 1) {
    size /= 1024;
    unit = units[index];
  }
  return `${size.toFixed(size >= 10 ? 1 : 2)} ${unit}`;
}

export function ShareStats({ share }: { share: ShareInfo }) {
  return (
    <div className="stats-grid">
      <div><span>Encrypted size</span><strong>{bytes(share.encrypted_size)}</strong></div>
      <div><span>Expires</span><strong>{new Date(share.expires_at).toLocaleString()}</strong></div>
      <div><span>Downloads</span><strong>{share.download_count}{share.max_downloads ? ` / ${share.max_downloads}` : " / ∞"}</strong></div>
      <div><span>One-time</span><strong>{share.one_time ? "Enabled" : "Disabled"}</strong></div>
    </div>
  );
}

