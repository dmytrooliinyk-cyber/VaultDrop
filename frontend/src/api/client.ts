export type ShareInfo = {
  share_id: string;
  encrypted_size: number;
  created_at: string;
  expires_at: string;
  max_downloads: number | null;
  download_count: number;
  downloads_remaining: number | null;
  one_time: boolean;
  consumed: boolean;
  revoked: boolean;
  password_protected: boolean;
};

export type CreatedShare = ShareInfo & { management_token: string };

function xhrErrorMessage(request: XMLHttpRequest, fallback: string): string {
  const response = request.response;
  if (response && typeof response === "object" && typeof response.detail === "string") {
    return response.detail;
  }
  return fallback;
}

async function parse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      // Keep the safe generic message.
    }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

export function uploadShare(
  ciphertext: Blob,
  fields: {
    expiresInSeconds: number;
    maxDownloads: number | null;
    oneTime: boolean;
    passwordProtected: boolean;
  },
  onProgress: (percent: number) => void,
): Promise<CreatedShare> {
  const form = new FormData();
  form.append("encrypted_file", ciphertext, "vaultdrop.bin");
  form.append("expires_in_seconds", String(fields.expiresInSeconds));
  if (fields.maxDownloads !== null) form.append("max_downloads", String(fields.maxDownloads));
  form.append("one_time", String(fields.oneTime));
  form.append("password_protected", String(fields.passwordProtected));

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/shares");
    request.responseType = "json";
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve(request.response as CreatedShare);
      else reject(new Error(xhrErrorMessage(request, `Upload failed (${request.status})`)));
    };
    request.onerror = () => reject(new Error("Network error while uploading encrypted data"));
    request.onabort = () => reject(new Error("Upload was cancelled"));
    request.ontimeout = () => reject(new Error("Upload timed out"));
    request.send(form);
  });
}

export async function getShare(shareId: string): Promise<ShareInfo> {
  return parse(await fetch(`/api/shares/${encodeURIComponent(shareId)}`, { cache: "no-store" }));
}

export async function downloadCiphertext(shareId: string): Promise<ArrayBuffer> {
  const response = await fetch(`/api/shares/${encodeURIComponent(shareId)}/download`, { cache: "no-store" });
  if (!response.ok) {
    let detail = "File unavailable";
    try { detail = (await response.json()).detail ?? detail; } catch { /* no-op */ }
    throw new Error(detail);
  }
  return response.arrayBuffer();
}

export async function managementStatus(shareId: string, token: string): Promise<ShareInfo> {
  return parse(await fetch(`/api/shares/${encodeURIComponent(shareId)}/manage`, {
    cache: "no-store",
    headers: { "X-Management-Token": token },
  }));
}

export async function managementAction(shareId: string, token: string, action: "revoke" | "delete") {
  const path = action === "revoke" ? `/revoke` : "";
  return parse<{ status: string }>(await fetch(`/api/shares/${encodeURIComponent(shareId)}${path}`, {
    method: action === "revoke" ? "POST" : "DELETE",
    headers: { "X-Management-Token": token },
  }));
}

