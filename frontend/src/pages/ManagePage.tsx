import { useState } from "react";
import { managementAction, managementStatus, type ShareInfo } from "../api/client";
import { ShareStats } from "../components/ShareStats";

export function ManagePage({ shareId }: { shareId: string }) {
  const [token, setToken] = useState(() => sessionStorage.getItem(`vaultdrop-management-${shareId}`) ?? "");
  const [share, setShare] = useState<ShareInfo | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    try {
      setError("");
      setShare(await managementStatus(shareId, token.trim()));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Access denied"); }
  };

  const act = async (action: "revoke" | "delete") => {
    const prompt = action === "revoke" ? "Revoke this share immediately?" : "Permanently delete this encrypted file and its record?";
    if (!window.confirm(prompt)) return;
    try {
      setError("");
      const response = await managementAction(shareId, token.trim(), action);
      setMessage(`Share ${response.status}.`);
      if (action === "revoke") setShare((current) => current ? { ...current, revoked: true } : current);
      else setShare(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Action failed"); }
  };

  return (
    <section className="page narrow">
      <div className="eyebrow">SENDER CONTROL</div>
      <h1>Manage share.</h1>
      <p className="lead">No account is required. Your one-time management token proves control.</p>
      <div className="card result-card">
        <label className="field"><span>Management token</span><input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Paste the token saved after upload" /></label>
        <button className="wide" disabled={!token.trim()} onClick={load}>View status</button>
        {share && <><ShareStats share={share} /><div className="status-row"><span>Status</span><strong className={share.revoked ? "danger" : "success"}>{share.revoked ? "REVOKED" : "ACTIVE"}</strong></div>
          <div className="button-row"><button className="danger-button" disabled={share.revoked} onClick={() => act("revoke")}>Revoke</button><button className="ghost" onClick={() => act("delete")}>Delete encrypted file</button></div></>}
        {message && <div className="alert success-box">{message}</div>}
        {error && <div className="alert error">{error}</div>}
      </div>
    </section>
  );
}

