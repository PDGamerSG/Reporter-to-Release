#!/usr/bin/env bash
# Run as root on a fresh Amazon Linux 2023 x86_64 host through SSM.
# The EC2 security group must expose only HTTP/HTTPS; no SSH or database ports.
set -euo pipefail
umask 077

if [[ ${EUID} -ne 0 || $(uname -m) != x86_64 ]]; then
  echo 'Run as root on an x86_64 Amazon Linux 2023 host.' >&2
  exit 1
fi

export R2R_SWITCH_HOST=${R2R_SWITCH_HOST:-r2r-switch.pallabdas.me}
export R2R_ADMIN_EMAIL=${R2R_ADMIN_EMAIL:-team@vulcan.local}
if [[ ! $R2R_SWITCH_HOST =~ ^[a-zA-Z0-9.-]+$ ]]; then
  echo 'R2R_SWITCH_HOST must be a DNS hostname.' >&2
  exit 1
fi

dnf install -y docker python3.12
systemctl enable --now docker
mkdir -p /opt/r2r /usr/local/lib/docker/cli-plugins

download_checked() {
  local url=$1 destination=$2 checksum=$3
  local temporary
  temporary=$(mktemp)
  curl --fail --silent --show-error --location "$url" -o "$temporary"
  printf '%s  %s\n' "$checksum" "$temporary" | sha256sum -c -
  install -m 755 "$temporary" "$destination"
  rm "$temporary"
}

download_checked \
  'https://github.com/docker/compose/releases/download/v2.40.3/docker-compose-linux-x86_64' \
  /usr/local/lib/docker/cli-plugins/docker-compose \
  dba9d98e1ba5bfe11d88c99b9bd32fc4a0624a30fafe68eea34d61a3e42fd372
download_checked \
  'https://github.com/docker/buildx/releases/download/v0.29.1/buildx-v0.29.1.linux-amd64' \
  /usr/local/lib/docker/cli-plugins/docker-buildx \
  7d2d7d6d4680aa349614965aaa33ccec43f1a9a21e908a5ce4cb6adfa5ad5141

cd /opt/r2r
download_checked \
  'https://raw.githubusercontent.com/sandbox-quantum/switch/f3f38eb54c6be0cec6f235d805e971efd15d9564/deploy/local/standalone-docker-compose.yml' \
  compose.yml \
  e645d53b2d2df9fe7b1be183bc2801ec32e07fe1c79b44bf1f4386ce8b6e815e

python3 - <<'PY'
import os
import secrets
from pathlib import Path

path = Path('.env')
if not path.exists():
    values = {
        key: secrets.token_hex(24)
        for key in ['DB_OWNER_PASSWORD', 'DB_PASSWORD',
                    'AGENT_REGISTRATION_TOKEN', 'GATEWAY_ADMIN_PASSWORD']
    }
    values.update({
        'SECRET_KEYS': 'r2r:' + secrets.token_hex(32),
        'SWITCH_VERSION': '0.31.1-dev.382.gf3f38eb',
        'SWITCH_IMAGE_NAMESPACE': 'sandbox-quantum/dev',
        'SWITCH_BIND_ADDR': '127.0.0.1',
        'DB_OWNER_USER': 'switch_owner', 'DB_USER': 'switch_app',
        'DB_NAME': 'switch', 'API_HOST_PORT': '8100',
        'GATEWAY_ADMIN_EMAIL': os.environ['R2R_ADMIN_EMAIL'],
        'GATEWAY_COOKIE_SECURE': 'true',
        'FRONTEND_BASE_URL': 'https://' + os.environ['R2R_SWITCH_HOST'],
        'GATEWAY_PUBLIC_URL': 'https://' + os.environ['R2R_SWITCH_HOST'],
        'TELEMETRY_ENABLED': 'false', 'THIRD_PARTY_AVATARS_ENABLED': 'false',
    })
    with path.open('x') as private:
        private.write(''.join(f'{key}={value}\n' for key, value in values.items()))
    path.chmod(0o600)
else:
    print('Existing Switch credentials preserved.')
PY

cat > Caddyfile <<EOF
$R2R_SWITCH_HOST {
    reverse_proxy switch:8000
}
EOF
cat > override.yml <<'YAML'
services:
  postgres:
    restart: unless-stopped
  switch:
    restart: unless-stopped
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on: [switch]
volumes:
  caddy_data:
  caddy_config:
YAML

docker compose -f compose.yml -f override.yml up -d
echo 'Switch host started. Admin credentials remain in /opt/r2r/.env.'
echo 'Point the hostname A record at this host, then run scripts/deploy-worker.py locally.'
