#!/usr/bin/env bash
# Per-boot startup: bring up the local MongoDB daemon that the API depends on.
# Idempotent: it does nothing if MongoDB already responds, and it returns once
# the database is ready (it does not stay in the foreground).
set -euo pipefail

is_up() {
  mongosh --quiet --host 127.0.0.1 --port 27017 --eval 'db.runCommand({ ping: 1 })' >/dev/null 2>&1
}

if ! is_up; then
  echo "Starting MongoDB..."
  sudo mkdir -p /var/lib/mongodb /var/log/mongodb
  sudo chown -R mongodb:mongodb /var/lib/mongodb /var/log/mongodb
  sudo -u mongodb mongod \
    --dbpath /var/lib/mongodb \
    --logpath /var/log/mongodb/mongod.log \
    --bind_ip 127.0.0.1 \
    --port 27017 \
    --fork
fi

for _ in $(seq 1 30); do
  if is_up; then
    echo "MongoDB is ready on 127.0.0.1:27017"
    exit 0
  fi
  sleep 1
done

echo "MongoDB did not become ready in time" >&2
exit 1
