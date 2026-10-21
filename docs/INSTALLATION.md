# Installation and local development

This guide starts from a clean computer. Use either Docker or the manual setup; you do not need both.

## Option A: Docker Desktop

This is the easiest route if you only want to run the application.

### Requirements

- Git
- Docker Desktop on Windows or macOS, or Docker Engine with the Compose plugin on Linux

### Steps

1. Clone the repository and enter the project directory:

   ```bash
   git clone https://github.com/GGtascher/VaultDrop.git
   cd VaultDrop
   ```

2. Build and start both services:

   ```bash
   docker compose up --build
   ```

3. Wait until the frontend and backend are healthy, then open:

   <http://localhost:5173>

4. Check the API through the frontend proxy:

   <http://localhost:5173/api/health>

   The expected response is:

   ```json
   {"status":"ok"}
   ```

5. Stop VaultDrop with `Ctrl+C`. To remove the containers while keeping encrypted files and database records, run:

   ```bash
   docker compose down
   ```

Docker stores the database and encrypted objects in named volumes. Do not add `-v` unless you deliberately want to erase those volumes.

### Changing Docker defaults

Copy the example environment file:

```bash
cp .env.example .env
```

On Windows Command Prompt, use:

```bat
copy .env.example .env
```

Edit `.env`, then recreate the containers:

```bash
docker compose up --build --force-recreate
```

The `.env` file is ignored by Git. Keep it that way if you later add secrets or private deployment values.

## Option B: Windows without Docker

### Requirements

- Git
- Python 3.12 or newer
- Node.js 22 or newer, including npm

Check that the required tools are available:

```powershell
git --version
py -3.12 --version
node --version
npm.cmd --version
```

### 1. Clone the project

Open PowerShell in any folder where you want to keep the project and run:

```powershell
git clone https://github.com/GGtascher/VaultDrop.git
cd VaultDrop
```

All commands below assume that the current PowerShell directory is the cloned `VaultDrop` repository.

### 2. Prepare the backend

Move into the backend directory:

```powershell
cd backend
```

Create the virtual environment:

```powershell
py -3.12 -m venv .venv
```

Install the Python dependencies:

```powershell
& ".\.venv\Scripts\python.exe" -m pip install --upgrade pip
& ".\.venv\Scripts\python.exe" -m pip install -r requirements.txt
```

Start the backend:

```powershell
& ".\.venv\Scripts\python.exe" -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Keep this PowerShell window open.

Check the backend in your browser:

```text
http://127.0.0.1:8000/api/health
```

Expected response:

```json
{"status":"ok"}
```

### 3. Start the frontend

Open a second PowerShell window.

Navigate to the same cloned repository, then enter the frontend directory:

```powershell
cd path\to\VaultDrop
cd frontend
```

Replace:

```text
path\to\VaultDrop
```

with the actual location where you cloned the repository.

Then install the frontend dependencies:

```powershell
npm.cmd ci
```

Start the frontend:

```powershell
npm.cmd run dev
```

Open:

```text
http://localhost:5173
```

Check:

```text
http://localhost:5173/api/health
```

You should again receive:

```json
{"status":"ok"}
```

VaultDrop is now running locally.

Keep both PowerShell windows open while using the application.

## Option C: macOS or Linux without Docker

### Requirements

- Git
- Python 3.12 or newer
- Node.js 22 or newer, including npm

Clone the project:

```bash
mkdir -p ~/projects
cd ~/projects
git clone https://github.com/YOUR_USERNAME/VaultDrop.git
cd VaultDrop
```

Prepare and start the backend:

```bash
cd backend
python3 -m venv .venv
./.venv/bin/python -m pip install --upgrade pip
./.venv/bin/python -m pip install -r requirements.txt
./.venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Leave that terminal open. In a second terminal, start the frontend:

```bash
cd ~/projects/VaultDrop/frontend
npm ci
npm run dev
```

Open <http://localhost:5173> and check <http://localhost:5173/api/health>.

## What gets created locally

- `backend/.venv/` contains the local Python environment.
- `frontend/node_modules/` contains JavaScript dependencies.
- `backend/vaultdrop.db` contains transfer metadata in manual mode.
- `storage/` contains encrypted objects.
- `frontend/dist/` is created by a production frontend build.

These paths are ignored by Git. The repository should contain source code and lock files, not local databases, uploaded files, virtual environments, or compiled output.

## Common problems

### PowerShell says running scripts is disabled

Do not change the machine-wide execution policy just to run this project. Use `npm.cmd`, as shown above, and call the virtual environment's `python.exe` directly instead of activating `Activate.ps1`.

### Port 5173 or 8000 is already in use

Close the older VaultDrop terminal, or find the process using the port:

```powershell
Get-NetTCPConnection -LocalPort 5173,8000 -ErrorAction SilentlyContinue
```

On macOS or Linux:

```bash
lsof -i :5173
lsof -i :8000
```

### The page opens, but uploads fail

Check the backend terminal first. Then open <http://localhost:5173/api/health>. If the health request fails, confirm that FastAPI is running on port 8000 and restart the Vite server.

### `npm ci` reports a lock-file mismatch

For a clean clone, `npm ci` should work. If you intentionally changed `package.json`, run `npm install` once to update `package-lock.json`, review the diff, and commit both files together.

### Docker starts the frontend before the API is ready

The Compose file includes a backend health check and delays the frontend until it passes. If Docker still reports an unhealthy backend, inspect its log:

```bash
docker compose logs backend
```

## Next step

`localhost` works only on the same computer. To send a link to somebody on another network, continue with [Public sharing from another network](PUBLIC_SHARING.md).
