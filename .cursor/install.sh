#!/usr/bin/env bash
# Idempotent dependency + local-database setup for the Delight Cafe dev environment.
# Safe to run repeatedly: it installs MongoDB only if missing, refreshes npm
# dependencies, writes a local .env only when absent, and rebuilds the React app.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# 1. Local MongoDB (the API requires MONGODB_URI). Install MongoDB Community 8.0
#    from the official apt repo only when it is not already present.
if ! command -v mongod >/dev/null 2>&1; then
  echo "Installing MongoDB Community 8.0..."
  sudo apt-get update -qq
  sudo apt-get install -y -qq curl gnupg ca-certificates
  curl -fsSL https://pgp.mongodb.com/server-8.0.asc \
    | sudo gpg --dearmor -o /usr/share/keyrings/mongodb-server-8.0.gpg
  echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse" \
    | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list >/dev/null
  sudo apt-get update -qq
  sudo apt-get install -y mongodb-org
fi

# Ensure MongoDB data/log directories exist and are owned by the mongodb user.
sudo mkdir -p /var/lib/mongodb /var/log/mongodb
sudo chown -R mongodb:mongodb /var/lib/mongodb /var/log/mongodb

# 2. Local environment file pointing the API at the local MongoDB instance.
#    Only create it when missing so developer edits are preserved.
if [ ! -f .env ]; then
  echo "Writing local .env ..."
  cat > .env <<'EOF'
MONGODB_URI=mongodb://127.0.0.1:27017/delight_cafe
MONGODB_DB=delight_cafe
SESSION_SECRET=local-dev-delight-cafe-secret
PORT=8080
EOF
fi

# 3. Install Node dependencies for the Express backend and the React client.
npm install
npm --prefix client install

# 4. Build the React app so the Express server can serve it at /app in
#    production mode (the Vite dev server is also available for HMR).
npm --prefix client run build

echo "Delight Cafe install complete."
