import { describe, expect, it } from "vitest";
import { decryptVault, encryptFile, keyFromFragment, safeDownloadName } from "./vault";

async function roundTrip(name: string, text = "top secret", type = "text/plain") {
  const file = new File([text], name, { type });
  const encrypted = await encryptFile(file);
  const key = await keyFromFragment(`#${encrypted.fragment}`);
  const result = await decryptVault(await encrypted.ciphertext.arrayBuffer(), key);
  return { encrypted, result };
}

describe("VaultDrop crypto container", () => {
  it("encrypts and decrypts AES-GCM bytes and metadata", async () => {
    const { result } = await roundTrip("secret.pdf", "%PDF", "application/pdf");
    expect(result.metadata).toMatchObject({ name: "secret.pdf", type: "application/pdf", size: 4 });
    expect(new TextDecoder().decode(result.bytes)).toBe("%PDF");
  });

  it.each(["photo-\u2603.png", "resume-\u00e9.txt", "report_2026.docx"])("preserves Unicode filename %s", async (name) => {
    const { result } = await roundTrip(name);
    expect(result.metadata.name).toBe(name);
  });

  it("rejects a wrong key", async () => {
    const first = await encryptFile(new File(["secret"], "secret.txt"));
    const second = await encryptFile(new File(["other"], "other.txt"));
    const wrongKey = await keyFromFragment(second.fragment);
    await expect(decryptVault(await first.ciphertext.arrayBuffer(), wrongKey)).rejects.toThrow("Integrity verification failed");
  });

  it("rejects modified ciphertext", async () => {
    const encrypted = await encryptFile(new File(["secret"], "secret.txt"));
    const bytes = new Uint8Array(await encrypted.ciphertext.arrayBuffer());
    bytes[bytes.length - 1] ^= 1;
    const key = await keyFromFragment(encrypted.fragment);
    await expect(decryptVault(bytes.buffer, key)).rejects.toThrow("Integrity verification failed");
  });

  it("wraps the random key with a password-derived key", async () => {
    const encrypted = await encryptFile(new File(["secret"], "protected.txt"), "correct horse battery staple");
    await expect(keyFromFragment(encrypted.fragment, "wrong password")).rejects.toThrow("Incorrect password");
    const key = await keyFromFragment(encrypted.fragment, "correct horse battery staple");
    const result = await decryptVault(await encrypted.ciphertext.arrayBuffer(), key);
    expect(result.metadata.name).toBe("protected.txt");
  });

  it("neutralizes path-like and overly long download names", () => {
    expect(safeDownloadName("../secret.txt")).toBe("_secret.txt");
    expect(safeDownloadName("a".repeat(500))).toHaveLength(240);
  });
});

