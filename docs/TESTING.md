# Testing and verification

Run tests from a clean clone before publishing a change. VaultDrop has three useful levels of verification: isolated backend tests, isolated frontend tests, and a live encrypted round trip.

## Backend API tests

### Windows

Open PowerShell in the `VaultDrop` repository root, then run:

```powershell
cd backend
& ".\.venv\Scripts\python.exe" -m pytest -q
```

### macOS or Linux

```bash
./.venv/bin/python -m pytest -q
```

The API suite checks upload limits, empty uploads, random storage names, expiration, missing shares, malformed identifiers, download limits, one-time deletion, revocation, deletion authorization, rate limiting, path traversal, security headers, and CORS behavior.

## Frontend unit tests

### Windows

```powershell
Set-Location -LiteralPath "C:\Projects\VaultDrop\frontend"
npm.cmd test
```

### macOS or Linux

```bash
cd ~/projects/VaultDrop/frontend
npm test
```

These tests exercise AES-GCM round trips, Unicode filenames, wrong keys, modified ciphertext, password-wrapped keys, safe download names, public URL validation, and final share-link construction.

## Production frontend build

Always run the build as a separate check because TypeScript and Vite can detect issues that a unit test does not execute.

Windows:

```powershell
npm.cmd run build
```

macOS or Linux:

```bash
npm run build
```

The generated `frontend/dist/` directory is local build output and is not committed.

## Live encrypted transfer test

Start the backend on port 8000. The frontend development server is not required for this test.

In another terminal:

### Windows

```powershell
Set-Location -LiteralPath "C:\Projects\VaultDrop\frontend"
npm.cmd run test:e2e
```

### macOS or Linux

```bash
cd ~/projects/VaultDrop/frontend
npm run test:e2e
```

The live test creates a file with Unicode text and filename, encrypts it in the frontend code, uploads the ciphertext to the real API, downloads it, decrypts it, compares every byte and metadata field, verifies the download limit, and finally deletes the share with its management token.

To test a backend on another address:

```bash
VAULTDROP_API=http://127.0.0.1:9000 npm run test:e2e
```

In PowerShell:

```powershell
$env:VAULTDROP_API = "http://127.0.0.1:9000"
npm.cmd run test:e2e
Remove-Item Env:VAULTDROP_API
```

## Manual browser check

After automated tests pass:

1. Upload a small text file without a password and download it from the generated link.
2. Repeat with password protection and confirm that a wrong password fails locally.
3. Create a one-time share and confirm that the second attempt is refused.
4. Create a limited share, open its management page, revoke it, and confirm that download is refused.
5. Start a Quick Tunnel and open the final link from a different network, such as a phone using mobile data.
6. Confirm that the original filename and bytes are restored exactly.

## GitHub Actions

`.github/workflows/ci.yml` runs the backend suite, frontend suite, and production build on every pull request and every push to `main`. A green workflow means those automated checks passed in a clean Linux environment; it is not a security audit.
