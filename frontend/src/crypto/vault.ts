const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const PBKDF2_ITERATIONS = 310_000;

export type VaultMetadata = { name: string; type: string; size: number; version: 1 };
export type DecryptedVault = { metadata: VaultMetadata; bytes: Uint8Array };

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function unbase64url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("The secure link is incomplete or invalid");
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "===".slice((normalized.length + 3) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function deriveWrappingKey(password: string, salt: Uint8Array<ArrayBuffer>) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptFile(file: File, password = ""): Promise<{ ciphertext: Blob; fragment: string }> {
  if (file.size === 0) throw new Error("Empty files are not supported");
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const metadata: VaultMetadata = { name: file.name, type: file.type || "application/octet-stream", size: file.size, version: 1 };
  const metadataBytes = encoder.encode(JSON.stringify(metadata));
  const fileBytes = new Uint8Array(await file.arrayBuffer());
  const plaintext = new Uint8Array(4 + metadataBytes.length + fileBytes.length);
  new DataView(plaintext.buffer).setUint32(0, metadataBytes.length, false);
  plaintext.set(metadataBytes, 4);
  plaintext.set(fileBytes, 4 + metadataBytes.length);

  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));
  const payload = new Blob([iv, encrypted], { type: "application/octet-stream" });
  const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", key));

  if (!password) return { ciphertext: payload, fragment: `k.${base64url(rawKey)}` };

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const wrapIv = crypto.getRandomValues(new Uint8Array(12));
  const wrappingKey = await deriveWrappingKey(password, salt);
  const wrapped = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: wrapIv }, wrappingKey, rawKey));
  return {
    ciphertext: payload,
    fragment: `p.${base64url(salt)}.${base64url(wrapIv)}.${base64url(wrapped)}`,
  };
}

export function fragmentNeedsPassword(fragment: string): boolean {
  return fragment.replace(/^#/, "").startsWith("p.");
}

export async function keyFromFragment(fragment: string, password = ""): Promise<CryptoKey> {
  const parts = fragment.replace(/^#/, "").split(".");
  let raw: Uint8Array<ArrayBuffer>;
  if (parts[0] === "k" && parts.length === 2) {
    raw = unbase64url(parts[1]);
  } else if (parts[0] === "p" && parts.length === 4) {
    if (!password) throw new Error("Enter the password to unlock this share");
    try {
      const wrappingKey = await deriveWrappingKey(password, unbase64url(parts[1]));
      raw = new Uint8Array(await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: unbase64url(parts[2]) },
        wrappingKey,
        unbase64url(parts[3]),
      ));
    } catch {
      throw new Error("Incorrect password or damaged secure link");
    }
  } else {
    throw new Error("The secure link is incomplete or invalid");
  }
  if (raw.byteLength !== 32) throw new Error("The secure link is incomplete or invalid");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["decrypt"]);
}

export async function decryptVault(ciphertext: ArrayBuffer, key: CryptoKey): Promise<DecryptedVault> {
  const payload = new Uint8Array(ciphertext);
  if (payload.byteLength < 29) throw new Error("Integrity verification failed");
  try {
    const plaintext = new Uint8Array(await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: payload.slice(0, 12) },
      key,
      payload.slice(12),
    ));
    if (plaintext.byteLength < 5) throw new Error();
    const metadataLength = new DataView(plaintext.buffer).getUint32(0, false);
    if (metadataLength < 2 || metadataLength > plaintext.byteLength - 4) throw new Error();
    const metadata = JSON.parse(decoder.decode(plaintext.slice(4, 4 + metadataLength))) as VaultMetadata;
    if (metadata.version !== 1 || typeof metadata.name !== "string" || typeof metadata.type !== "string") throw new Error();
    const bytes = plaintext.slice(4 + metadataLength);
    if (bytes.byteLength !== metadata.size) throw new Error();
    return { metadata, bytes };
  } catch {
    throw new Error("Integrity verification failed. The key may be incorrect or the encrypted file was modified.");
  }
}

export function safeDownloadName(name: string): string {
  const cleaned = name.replace(/[\\/\0-\x1f\x7f]/g, "_").replace(/^\.+/, "").trim();
  return (cleaned || "vaultdrop-file").slice(0, 240);
}

export function saveDecryptedFile(vault: DecryptedVault): void {
  const blob = new Blob([vault.bytes], { type: vault.metadata.type || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeDownloadName(vault.metadata.name);
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

