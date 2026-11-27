#!/bin/bash
# Puts commerce.chithii.com on nginx with its own certificate. Run ONCE on the live server, as:
#   sudo bash ~/Commerce/deploy/install-nginx.sh
# Touches only /etc/nginx/sites-enabled/commerce.conf and the certificate "commerce.chithii.com". Chithii's own
# files are never edited. `nginx -t` runs before every reload, and a failed step removes what this script added.
set -u
NAME=commerce.chithii.com
SITE=/etc/nginx/sites-enabled/commerce.conf
FULL="$(dirname "$0")/nginx-commerce.conf"

[ "$(id -u)" = 0 ] || { echo "Run it with sudo."; exit 1; }
[ -f "$FULL" ] || { echo "Missing $FULL"; exit 1; }
undo() { echo "FAILED: $1 — removing $SITE"; rm -f "$SITE"; nginx -t -q && systemctl reload nginx; exit 1; }

# 1. Port 80 only (the certificate's web check needs it), until the certificate exists.
if [ ! -e "/etc/letsencrypt/live/$NAME/fullchain.pem" ]; then
  awk 'BEGIN{n=0} /^server \{/{n++} n==1' "$FULL" > "$SITE"
  nginx -t -q || undo "nginx test (port 80)"
  systemctl reload nginx
  certbot certonly --webroot -w /var/www/certbot -d "$NAME" --cert-name "$NAME" --non-interactive --agree-tos \
    || undo "certificate"
fi

# 2. The full site: HTTPS, /api/ to the API, the rest to the dashboard.
cp "$FULL" "$SITE"
nginx -t -q || undo "nginx test (full)"
systemctl reload nginx
echo "OK: https://$NAME is served by nginx."
