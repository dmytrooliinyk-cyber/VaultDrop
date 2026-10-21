# VaultDrop

VaultDrop is a small, self-hosted file-sharing application built around one simple rule: the server should never receive the key that decrypts a file.

When a sender chooses a file, the browser encrypts the file contents and its metadata with AES-256-GCM. The API stores only the encrypted bytes. The decryption key is placed after `#` in the final share URL, so it stays in the browser and is not included in HTTP requests to VaultDrop.

> VaultDrop is an educational cybersecurity portfolio project. It demonstrates a defensible design, but it has not received an independent security audit and should not be treated as a production-grade replacement for an audited file-transfer service.

## What it can do

- Encrypt and decrypt files entirely in the browser with the Web Crypto API.
- Hide the original filename, MIME type, and file contents from the backend.
- Create expiring links, download limits, and one-time transfers.
- Protect the random file key with an optional password.
- Revoke a link or permanently delete its encrypted object with a separate management token.
- Run locally with Python and Node.js, or as two Docker containers.
- Create a temporary public HTTPS address with Cloudflare Tunnel so a recipient on another network can download the file.
- Test the API, cryptographic container, URL handling, and a live encrypted transfer.

## The short version

If Docker Desktop is already installed, this is the quickest way to run VaultDrop:

```bash
git clone https://github.com/GGtascher/VaultDrop.git
cd VaultDrop
docker compose up --build
```

Open <http://localhost:5173>. This address is local to your computer. To send a file to someone outside your network, follow [Public sharing from another network](docs/PUBLIC_SHARING.md).

If you prefer to run the backend and frontend directly, see [Installation and local development](docs/INSTALLATION.md). The Windows guide deliberately uses `npm.cmd`, which also works when PowerShell blocks `npm.ps1` through its execution policy.

## Sending a file

1. Start VaultDrop and open it in a browser.
2. If the recipient is on another device or network, start the public tunnel first and open the generated `https://...trycloudflare.com` address.
3. Choose a file.
4. Select an expiration time and a download limit. Enable one-time download or password protection if needed.
5. Click **Encrypt & Upload**.
6. Save the management token somewhere private. It is needed to check status, revoke the share, or delete it.
7. Copy the complete public share link. A valid link looks like this:

   ```text
   https://example.trycloudflare.com/share/SHARE_ID#k.DECRYPTION_KEY
   ```

8. Send that complete link to the recipient. The part after `#` is essential. Sending only the `trycloudflare.com` home address will not identify or decrypt the file.

The recipient opens the link in a modern browser and clicks **Download & Decrypt**. Nothing needs to be installed on the recipient's computer.

## How the encryption flow works

1. The frontend creates a small JSON record containing the filename, MIME type, original size, and format version.
2. It packs that metadata and the file bytes into one binary container.
3. Web Crypto creates a new random 256-bit AES key and 96-bit IV for this upload.
4. AES-GCM encrypts and authenticates the complete container.
5. The frontend uploads only `IV || ciphertext || authentication tag`.
6. The backend assigns random identifiers and stores the encrypted object.
7. The frontend builds `/share/<share-id>#<key-material>`.
8. On the recipient's device, the browser downloads the ciphertext, reads the key from the URL fragment, verifies the authentication tag, and restores the original file.

There is intentionally no server-side decryption endpoint.

```text
Sender's browser                              VaultDrop backend
┌──────────────────────────────┐              ┌──────────────────────────┐
│ file + filename + MIME type  │              │ random share identifier  │
│ pack into binary container   │              │ expiration and counters  │
│ AES-256-GCM encryption       │── HTTPS ───▶ │ ciphertext bytes only    │
│ key stays in URL #fragment   │              │ no decryption key        │
└──────────────────────────────┘              └──────────────────────────┘
             │
             │ complete share URL
             ▼
┌──────────────────────────────┐
│ Recipient's browser          │
│ download, verify, decrypt,   │
│ and save the original file   │
└──────────────────────────────┘
```

## Repository layout

```text
VaultDrop/
├── backend/                 FastAPI API, SQLite model, storage, and API tests
├── frontend/                React interface, browser crypto, and frontend tests
├── scripts/                 Windows and Unix tunnel helpers
├── docs/                    Detailed installation, sharing, and testing guides
├── docker-compose.yml       Local container setup
├── SECURITY.md              Security model and responsible disclosure notes
└── .github/workflows/ci.yml GitHub Actions test workflow
```

## API at a glance

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Basic service health check |
| `POST` | `/api/shares` | Upload ciphertext and create a share |
| `GET` | `/api/shares/{share_id}` | Read public transfer status |
| `GET` | `/api/shares/{share_id}/download` | Claim a download and receive ciphertext |
| `GET` | `/api/shares/{share_id}/manage` | Read sender-only status with a management token |
| `POST` | `/api/shares/{share_id}/revoke` | Revoke a share immediately |
| `DELETE` | `/api/shares/{share_id}` | Delete the database record and encrypted object |

The API intentionally does not accept an original filename, a MIME type, a password, or a decryption key.

## Security boundaries

The backend can see ciphertext size, share policy, timestamps, download counters, IP/network metadata, and random identifiers. It does not receive the plaintext, original filename, MIME type, password, raw management token, or key stored in the URL fragment.

Anyone who obtains the complete share link can decrypt the file unless password mode is enabled. Password mode does not prevent offline guessing, so a long, unique password matters. A compromised frontend server could also deliver modified JavaScript and steal data before encryption; this is a fundamental limitation of browser-delivered cryptography.

Read [SECURITY.md](SECURITY.md) before adapting the project for sensitive use.

## Configuration

The backend reads these environment variables when the application starts:

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | `sqlite:///./vaultdrop.db` | SQLAlchemy database URL |
| `STORAGE_DIR` | `../storage` | Directory for encrypted objects |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | Allowed browser origin for direct API development |
| `MAX_UPLOAD_MB` | `100` | Maximum encrypted upload size |
| `CLEANUP_INTERVAL_SECONDS` | `300` | How often expired shares are removed |
| `ACCESS_RATE_LIMIT` | `120` | Public requests allowed per key/window |
| `MANAGEMENT_RATE_LIMIT` | `12` | Management attempts allowed per key/window |
| `RATE_WINDOW_SECONDS` | `60` | Rate-limit window length |

All numeric settings must be positive integers. For Docker Compose, copy `.env.example` to `.env` and change only the values you need. `.env` is ignored by Git.

The encrypted container is slightly larger than the original file. Leave some headroom when setting `MAX_UPLOAD_MB`.

## Documentation

- [Installation and local development](docs/INSTALLATION.md)
- [Public sharing from another network](docs/PUBLIC_SHARING.md)
- [Testing and verification](docs/TESTING.md)
- [Architecture notes](docs/ARCHITECTURE.md)
- [Security policy and limitations](SECURITY.md)
- [Contributing](CONTRIBUTING.md)

## License

VaultDrop is released under the [MIT License](LICENSE).
