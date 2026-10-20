import { describe, expect, it } from "vitest";
import { decryptVault, encryptFile, keyFromFragment } from "../src/crypto/vault";

const api = process.env.VAULTDROP_API ?? "http://127.0.0.1:8000";

describe("live encrypted transfer", () => {
  it("uploads ciphertext and recovers the exact original file", async () => {
    const original = new TextEncoder().encode("VaultDrop live E2E: encrypted round trip 2026");
    const filename = "report-\u2603-2026.txt";
    const encrypted = await encryptFile(new File([original], filename, { type: "text/plain" }));
    const form = new FormData();
    form.append("encrypted_file", encrypted.ciphertext, "vaultdrop.bin");
    form.append("expires_in_seconds", "600");
    form.append("max_downloads", "1");
    form.append("one_time", "false");
    form.append("password_protected", "false");

    const createdResponse = await fetch(`${api}/api/shares`, { method: "POST", body: form });
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json() as { share_id: string; management_token: string };
    expect(created.share_id.length).toBeGreaterThan(40);
    expect(created.management_token).not.toBe("");

    const downloadResponse = await fetch(`${api}/api/shares/${created.share_id}/download`);
    expect(downloadResponse.status).toBe(200);
    const key = await keyFromFragment(encrypted.fragment);
    const decrypted = await decryptVault(await downloadResponse.arrayBuffer(), key);

    expect(decrypted.metadata.name).toBe(filename);
    expect(decrypted.metadata.type).toBe("text/plain");
    expect(decrypted.bytes).toEqual(original);

    const secondDownload = await fetch(`${api}/api/shares/${created.share_id}/download`);
    expect(secondDownload.status).toBe(410);

    const deleted = await fetch(`${api}/api/shares/${created.share_id}`, {
      method: "DELETE",
      headers: { "X-Management-Token": created.management_token },
    });
    expect(deleted.status).toBe(200);
  });
});

