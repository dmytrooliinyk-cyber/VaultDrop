import { ManagePage } from "./pages/ManagePage";
import { SharePage } from "./pages/SharePage";
import { UploadPage } from "./pages/UploadPage";

export default function App() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const share = path.match(/^\/share\/([^/]+)$/);
  const manage = path.match(/^\/manage\/([^/]+)$/);

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="VaultDrop home">
          <span className="brand-mark" aria-hidden="true">V</span>
          <span>VAULTDROP</span>
        </a>
        <span className="zero-badge"><i /> ZERO-KNOWLEDGE</span>
      </header>
      <main>
        {share ? <SharePage shareId={share[1]} /> :
          manage ? <ManagePage shareId={manage[1]} /> :
            <UploadPage />}
      </main>
      <footer>Encrypted in your browser · Server stores ciphertext only</footer>
    </div>
  );
}

