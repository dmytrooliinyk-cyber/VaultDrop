import { useEffect, useState } from "react";
import { downloadCiphertext, getShare, type ShareInfo } from "../api/client";
import { ShareStats } from "../components/ShareStats";
import { decryptVault, fragmentNeedsPassword, keyFromFragment, saveDecryptedFile } from "../crypto/vault";

export function SharePage({ shareId }: { shareId: string }) {
  const [share, setShare] = useState<ShareInfo | null>(null);
  const [password, setPassword] = useState("");
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const protectedLink = fragmentNeedsPassword(window.location.hash);

  useEffect(() => {
    getShare(shareId).then(setShare).catch((reason) => setError(reason.message));
    if (!protectedLink) keyFromFragment(window.location.hash).then(setKey).catch((reason) => setError(reason.message));
  }, [shareId, protectedLink]);

  const unlock = async () => {
    try {
      setError("");
      setKey(await keyFromFragment(window.location.hash, password));
      setPassword("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to unlock");
    }
  };

  const download = async () => {
    if (!key) return;
    try {
      setBusy(true);
      setError("");
      const encrypted = await downloadCiphertext(shareId);
      const vault = await decryptVault(encrypted, key);
      saveDecryptedFile(vault);
      setShare((current) => {
        if (!current) return current;
        const downloadCount = current.download_count + 1;
        return {
          ...current,
          download_count: downloadCount,
          downloads_remaining: current.max_downloads === null
            ? null
            : Math.max(current.max_downloads - downloadCount, 0),
          consumed: current.one_time ? true : current.consumed,
        };
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "File unavailable");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page narrow">
      <div className="download-orbit"><span>↓</span></div>
      <div className="eyebrow">ENCRYPTED FILE</div>
      <h1>Unlock in your browser.</h1>
      <p className="lead">The server does not possess the decryption key. Decryption happens locally on this device.</p>
      <div className="card result-card">
        {share && <ShareStats share={share} />}
        {protectedLink && !key && <div className="unlock-box">
          <label className="field"><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => event.key === "Enter" && unlock()} /></label>
          <button onClick={unlock}>Unlock</button>
        </div>}
        {key && <div className="alert success-box">✓ Decryption key available locally</div>}
        {error && <div className="alert error">{error}</div>}
        <button
          className="primary wide"
          disabled={!share || !key || busy || share.consumed || share.downloads_remaining === 0}
          onClick={download}
        >{busy ? "Downloading & decrypting…" : "Download & Decrypt"} <span>↓</span></button>
        <p className="microcopy">AES-GCM verifies integrity before any plaintext is saved.</p>
      </div>
    </section>
  );
}

