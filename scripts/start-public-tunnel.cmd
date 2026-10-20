@echo off
setlocal

where cloudflared >nul 2>nul
if errorlevel 1 (
  echo Cloudflared is not installed.
  echo Install it once with:
  echo   winget install --id Cloudflare.cloudflared
  echo Then close and reopen the terminal and run this file again.
  exit /b 1
)

echo.
echo Starting a temporary public address for VaultDrop...
echo.
echo Keep this window open. Closing it will disable the public link.
echo When Cloudflare prints an address ending in trycloudflare.com:
echo   1. Copy the complete https:// address.
echo   2. Open it in your browser.
echo   3. Create the share from that page.
echo.
echo Send the recipient the final /share/... link created by VaultDrop,
echo not the short trycloudflare.com address on its own.
echo.

cloudflared tunnel --url http://localhost:5173

