# Public sharing from another network

A link that begins with `http://localhost` or `http://127.0.0.1` is private to the computer running VaultDrop. Sending that link through Telegram does not make it public; the recipient's browser would look for VaultDrop on the recipient's own computer.

For a temporary demo, Cloudflare Quick Tunnel gives the local frontend a public HTTPS address. It does not require opening a router port. The URL remains available only while VaultDrop, `cloudflared`, and the host computer are running.

## Before you begin

Start VaultDrop first and confirm that both of these addresses work:

- <http://localhost:5173>
- <http://localhost:5173/api/health>

If you used the manual setup, keep the backend and frontend terminals open. If you used Docker, keep `docker compose up` running.

## Install `cloudflared` once

Cloudflare maintains current downloads for Windows, macOS, and Linux in its [official download guide](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/).

### Windows

With Windows Package Manager:

```powershell
winget install --id Cloudflare.cloudflared
```

Close and reopen PowerShell after installation, then verify:

```powershell
cloudflared --version
```

If `winget` is unavailable, download the current 64-bit MSI or executable from the official Cloudflare download guide, install it, and make sure `cloudflared.exe` is available on `PATH`.

### macOS

With Homebrew:

```bash
brew install cloudflared
cloudflared --version
```

### Debian or Ubuntu

Use Cloudflare's package repository instructions from the official download guide. After installation, verify:

```bash
cloudflared --version
```

The repository also contains `scripts/start-public-tunnel.sh`; it works on other Unix-like systems once `cloudflared` is on `PATH`.

## Start the temporary public address

### Windows

Open a new PowerShell window in the project root:

```powershell
Set-Location -LiteralPath "C:\Projects\VaultDrop"
& ".\scripts\start-public-tunnel.cmd"
```

### macOS or Linux

Open a new terminal in the project root:

```bash
cd ~/projects/VaultDrop
sh ./scripts/start-public-tunnel.sh
```

You can also run the underlying command directly on any platform:

```bash
cloudflared tunnel --url http://localhost:5173
```

After a few seconds, the output will contain a URL similar to:

```text
https://quiet-river-example.trycloudflare.com
```

Warnings about a missing configuration file or origin certificate are normal for a Quick Tunnel. The important line is the public `https://...trycloudflare.com` address and a message indicating that the tunnel connection is registered.

## Create a share that another person can actually open

The least error-prone workflow is:

1. Copy the complete `https://...trycloudflare.com` address from the tunnel terminal.
2. Open that address in your own browser.
3. Confirm that the VaultDrop page loads through HTTPS.
4. Select the file and choose the expiration/download options.
5. Click **Encrypt & Upload**.
6. Copy the **public secure share link** from the result screen.

The final link is longer than the tunnel's home address. It contains both a share identifier and a fragment with key material:

```text
https://quiet-river-example.trycloudflare.com/share/W9...random-id...Q#k.2P...decryption-key...A
```

Send the entire line, including everything after `#`. Do not send only this:

```text
https://quiet-river-example.trycloudflare.com
```

The short address only opens the upload page. It does not identify the encrypted object and does not contain a decryption key.

## Sending through Telegram, Signal, or email

Paste the complete generated link as one uninterrupted line. Before sending, check three things:

- the link begins with `https://`, not `http://localhost`;
- it contains `/share/`;
- it contains `#k.` for a normal share or `#p.` for a password-protected share.

If password protection is enabled, send the password through a different channel when practical. The password itself is not part of the link.

Messaging applications may generate a link preview. The browser URL fragment is not included in the HTTP request used to fetch the page, but the complete link remains a secret because anyone who receives it can use the key locally.

## What the recipient does

The recipient does not install VaultDrop or `cloudflared`.

1. Open the complete link in a current browser.
2. Enter the password if the sender enabled password protection.
3. Click **Download & Decrypt**.
4. Wait while the encrypted bytes are downloaded and verified.
5. The browser saves the restored file with its original filename.

For a one-time share, the first authorized ciphertext download consumes the link. If the recipient closes the browser during that transfer or uses a wrong key, the share may still be consumed because the server cannot observe local decryption.

## Keep these processes running

For a manual Windows setup, there are normally three open terminals:

1. FastAPI on port 8000.
2. Vite on port 5173.
3. `cloudflared`, which provides the public HTTPS address.

With Docker, there are normally two:

1. `docker compose up --build`.
2. `cloudflared`.

If any required process stops, the recipient cannot download the file. The computer must also remain awake and connected to the internet.

## Converting a share created on localhost

VaultDrop can accept the public HTTPS origin in its **Public HTTPS address** field and rebuild the link after upload. This is useful if the encrypted object was already uploaded locally:

1. Start the tunnel.
2. Copy only its origin, for example `https://quiet-river-example.trycloudflare.com`.
3. Paste it into **Public HTTPS address**.
4. Click **Create public link**.
5. Copy the newly generated full link.

Do not add `/share/...`, a query string, or a `#fragment` to the public-address field. VaultDrop adds those parts itself.

## Important Quick Tunnel limitations

- The hostname is temporary and normally changes when `cloudflared` restarts.
- Old links stop working after the hostname changes, even if their encrypted files still exist locally.
- The service is suitable for a demo or occasional transfer, not guaranteed availability.
- Network providers can observe connection metadata and ciphertext size.
- Browser encryption still depends on trusting the JavaScript delivered to the sender and recipient.

For a stable address, use a named Cloudflare Tunnel with a domain or deploy the Docker stack behind an HTTPS reverse proxy on a server. Keep the backend on a private container network and expose only the frontend proxy. Cloudflare's [locally managed tunnel guide](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/create-local-tunnel/) covers named tunnels and DNS routing.

## Troubleshooting

### The public page shows a Cloudflare error or `502 Bad Gateway`

Check <http://localhost:5173> on the host computer. If it does not load, restart VaultDrop before restarting the tunnel.

### The home page opens, but upload requests fail

Open the public health endpoint by adding `/api/health` to the tunnel address:

```text
https://quiet-river-example.trycloudflare.com/api/health
```

If the local health endpoint works but the public one does not, inspect the Vite or Nginx logs and the `cloudflared` terminal.

### The recipient sees the upload page instead of the download page

Only the tunnel home address was sent. Return to the upload result and copy the full URL containing `/share/` and `#`.

### VaultDrop labels the link as local

Make sure the public-address field contains an HTTPS origin and nothing else:

```text
https://quiet-river-example.trycloudflare.com
```

### A previously working link stopped working

Check whether the Quick Tunnel was restarted. A new run produces a new hostname. Create a new public link with the new hostname, or use a stable deployment for long-lived shares.
