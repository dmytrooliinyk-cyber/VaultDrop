import { useRef, useState } from "react";
import { uploadShare, type CreatedShare } from "../api/client";
import { bytes, ShareStats } from "../components/ShareStats";
import { encryptFile } from "../crypto/vault";
import { buildShareLink, isPublicShareUrl, normalizePublicBaseUrl } from "../utils/shareUrl";

const expirations = [
  ["10 minutes", 600], ["1 hour", 3600], ["6 hours", 21600],
  ["24 hours", 86400], ["7 days", 604800],
] as const;

export function UploadPage() {
  const currentOriginIsPublic = isPublicShareUrl(window.location.origin);
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [expiration, setExpiration] = useState("86400");
  const [customDate, setCustomDate] = useState("");
  const [maxDownloads, setMaxDownloads] = useState("1");
  const [oneTime, setOneTime] = useState(false);
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [password, setPassword] = useState("");
  const [publicBaseUrl, setPublicBaseUrl] = useState(() => {
    if (currentOriginIsPublic) return window.location.origin;
    return localStorage.getItem("vaultdrop-public-base-url") ?? "";
  });
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<{
    share: CreatedShare;
    link: string;
    fragment: string;
    isPublic: boolean;
  } | null>(null);

  const publicMode = publicBaseUrl.trim()
    ? isPublicShareUrl(publicBaseUrl)
    : currentOriginIsPublic;

  const choose = (candidate?: File) => {
    if (!candidate) return;
    setFile(candidate);
    setResult(null);
    setError("");
    setNotice("");
  };

  const copyToClipboard = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setError("");
      setNotice(`${label} copied to the clipboard.`);
    } catch {
      setNotice("");
      setError("Your browser blocked clipboard access. Select the value and copy it manually.");
    }
  };

  const submit = async () => {
    if (!file) return;
    if (passwordEnabled && password.length < 8) {
      setError("Use a password with at least 8 characters.");
      return;
    }
    let expiresInSeconds = Number(expiration);
    if (expiration === "custom") {
      expiresInSeconds = Math.floor((new Date(customDate).getTime() - Date.now()) / 1000);
      if (!Number.isFinite(expiresInSeconds) || expiresInSeconds < 60 || expiresInSeconds > 2_592_000) {
        setError("Custom expiration must be between 1 minute and 30 days from now.");
        return;
      }
    }
    let shareBaseUrl = window.location.origin;
    if (publicBaseUrl.trim()) {
      try {
        shareBaseUrl = normalizePublicBaseUrl(publicBaseUrl);
        localStorage.setItem("vaultdrop-public-base-url", shareBaseUrl);
        setPublicBaseUrl(shareBaseUrl);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Invalid public address");
        return;
      }
    }
    try {
      setError("");
      setNotice("");
      setPhase("Encrypting locally…");
      setProgress(12);
      const encrypted = await encryptFile(file, passwordEnabled ? password : "");
      setProgress(45);
      setPhase("Uploading ciphertext…");
      const share = await uploadShare(encrypted.ciphertext, {
        expiresInSeconds,
        maxDownloads: oneTime || maxDownloads === "unlimited" ? null : Number(maxDownloads),
        oneTime,
        passwordProtected: passwordEnabled,
      }, (uploadPercent) => setProgress(45 + Math.round(uploadPercent * 0.55)));
      const link = buildShareLink(shareBaseUrl, share.share_id, encrypted.fragment);
      sessionStorage.setItem(`vaultdrop-management-${share.share_id}`, share.management_token);
      setResult({
        share,
        link,
        fragment: encrypted.fragment,
        isPublic: isPublicShareUrl(shareBaseUrl),
      });
      setPassword("");
      setProgress(100);
      setPhase("Complete");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Upload failed");
      setPhase("");
      setProgress(0);
    }
  };

  const convertToPublicLink = () => {
    if (!result) return;
    try {
      const shareBaseUrl = normalizePublicBaseUrl(publicBaseUrl);
      localStorage.setItem("vaultdrop-public-base-url", shareBaseUrl);
      setPublicBaseUrl(shareBaseUrl);
      setResult({
        ...result,
        link: buildShareLink(shareBaseUrl, result.share.share_id, result.fragment),
        isPublic: true,
      });
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Invalid public address");
    }
  };

  if (result) {
    return (
      <section className="page narrow">
        <div className="success-orbit"><span>✓</span></div>
        <div className="eyebrow success">UPLOAD COMPLETE</div>
        <h1>Your encrypted file is ready.</h1>
        <p className="lead">Only someone with the complete link can decrypt it. The fragment after <code>#</code> never reached the server.</p>
        <div className="card result-card">
          <div className={`share-mode ${result.isPublic ? "public" : "local"}`}>
            <strong>{result.isPublic ? "PUBLIC HTTPS LINK" : "LOCAL TEST LINK"}</strong>
            <span>{result.isPublic
              ? "You can send this link through Telegram. It works while your public VaultDrop address is online."
              : "Do not send this localhost link: it only works on this computer. Start a tunnel and convert it below."}</span>
          </div>
          <div className="status-row"><span>Encryption</span><strong>AES-256-GCM</strong></div>
          <div className="status-row"><span>Server has decryption key</span><strong className="success">NO</strong></div>
          <label className="field"><span>{result.isPublic ? "Public secure share link" : "Local test link"}</span><input readOnly value={result.link} /></label>
          {!result.isPublic && <div className="public-converter">
            <label className="field"><span>Public HTTPS address</span>
              <input
                type="url"
                value={publicBaseUrl}
                onChange={(event) => setPublicBaseUrl(event.target.value)}
                placeholder="https://random-name.trycloudflare.com"
              />
            </label>
            <button onClick={convertToPublicLink}>Create public link</button>
          </div>}
          {error && <div className="alert error">{error}</div>}
          {notice && <div className="alert success-box" role="status">{notice}</div>}
          <div className="button-row">
            <button disabled={!result.isPublic} onClick={() => copyToClipboard(result.link, "Public link")}>Copy public link</button>
            <button className="secondary" onClick={() => copyToClipboard(result.share.management_token, "Management token")}>Copy management token</button>
          </div>
          <ShareStats share={result.share} />
          <div className="button-row">
            <a className="button secondary" href={result.link}>Open share page</a>
            <a className="button ghost" href={`/manage/${result.share.share_id}`}>Manage share</a>
          </div>
        </div>
        <p className="warning-text">Save both the secure link and management token now. The token is shown only once. Public links stop working if your server or tunnel is stopped.</p>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="hero-grid">
        <div>
          <div className="eyebrow">END-TO-END ENCRYPTED</div>
          <h1>Share files.<br /><span>Keep the key.</span></h1>
          <p className="lead">VaultDrop encrypts every byte in your browser before upload. The server stores only unreadable ciphertext.</p>
        </div>
        <div className="security-card">
          <div className="security-title"><span className="shield">◇</span> SECURITY</div>
          <ul>
            <li>File encrypted before upload</li>
            <li>AES-256-GCM authenticated encryption</li>
            <li>Encryption key never sent to server</li>
            <li>Filename and MIME type encrypted</li>
            <li>Tampering causes decryption failure</li>
          </ul>
        </div>
      </div>

      <div className="card upload-card">
        <div className={`share-mode ${publicMode ? "public" : "local"}`}>
          <strong>{publicMode ? "PUBLIC SHARING MODE" : "LOCAL MODE — NOT SHAREABLE YET"}</strong>
          <span>{publicMode
            ? "Links will use this public HTTPS address and can be sent through Telegram or any messenger."
            : "A localhost link works only on your computer. Start an HTTPS tunnel, then paste its address below."}</span>
          <label className="field">
            <span>Public HTTPS address</span>
            <input
              type="url"
              value={publicBaseUrl}
              onChange={(event) => setPublicBaseUrl(event.target.value)}
              placeholder="https://random-name.trycloudflare.com"
            />
          </label>
          {!publicMode && <small>Run <code>scripts\start-public-tunnel.cmd</code> after starting the frontend and backend.</small>}
        </div>
        <div className="dropzone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); choose(event.dataTransfer.files[0]); }}>
          <div className="file-icon">↑</div>
          <h2>{file ? "File selected" : "Drop file here"}</h2>
          <p>{file ? "Ready for local encryption" : "Any file type · Up to 100 MB by default"}</p>
          <button className="secondary" onClick={() => input.current?.click()}>{file ? "Choose another" : "Select file"}</button>
          <input ref={input} hidden type="file" onChange={(event) => choose(event.target.files?.[0])} />
        </div>

        {file && <div className="file-details">
          <div><span>Name</span><strong>{file.name}</strong></div>
          <div><span>Size</span><strong>{bytes(file.size)}</strong></div>
          <div><span>Type</span><strong>{file.type || "Unknown / binary"}</strong></div>
        </div>}

        <div className="options-grid">
          <label className="field"><span>Expiration</span>
            <select value={expiration} onChange={(event) => setExpiration(event.target.value)}>
              {expirations.map(([label, value]) => <option key={value} value={value}>{label}</option>)}
              <option value="custom">Custom</option>
            </select>
          </label>
          <label className="field"><span>Maximum downloads</span>
            <select value={maxDownloads} disabled={oneTime} onChange={(event) => setMaxDownloads(event.target.value)}>
              <option value="unlimited">Unlimited</option>
              {[1, 2, 3, 5, 10].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          {expiration === "custom" && <label className="field full"><span>Custom expiration</span>
            <input type="datetime-local" value={customDate} onChange={(event) => setCustomDate(event.target.value)} />
          </label>}
        </div>

        <label className="check"><input type="checkbox" checked={oneTime} onChange={(event) => setOneTime(event.target.checked)} /><span><strong>Delete after first download</strong><small>Only one ciphertext transfer will be allowed.</small></span></label>
        <label className="check"><input type="checkbox" checked={passwordEnabled} onChange={(event) => {
          setPasswordEnabled(event.target.checked);
          if (!event.target.checked) setPassword("");
        }} /><span><strong>Protect with password</strong><small>The password wraps the random file key with PBKDF2-SHA-256.</small></span></label>
        {passwordEnabled && <label className="field"><span>Password</span><input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /></label>}

        {phase && <div className="progress-wrap"><div className="progress-label"><span>{phase}</span><strong>{progress}%</strong></div><div className="progress"><i style={{ width: `${progress}%` }} /></div></div>}
        {error && <div className="alert error">{error}</div>}
        <button className="primary wide" disabled={!file || Boolean(phase)} onClick={submit}>Encrypt &amp; Upload <span>→</span></button>
        <p className="microcopy">Your file and filename never leave this device unencrypted.</p>
      </div>
    </section>
  );
}

