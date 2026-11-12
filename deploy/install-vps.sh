#!/usr/bin/env bash
# Run once as root on the VPS, passing the public deployment key file.
set -Eeuo pipefail
[[ $(id -u) == 0 ]] || { echo 'Run with sudo' >&2; exit 1; }
[[ $# == 1 && -f $1 ]] || { echo 'Usage: sudo bash install-vps.sh PUBLIC_KEY_FILE' >&2; exit 1; }
key=$(cat "$1")
[[ $key == ssh-ed25519\ * && $key != *$'\n'* ]] || { echo 'Expected one Ed25519 public key' >&2; exit 1; }
ssh-keygen -l -f "$1" >/dev/null
site=/var/www/robin-prause
[[ $(systemctl show robin-prause.service -p User --value) == prause ]]
[[ $(systemctl show robin-prause.service -p WorkingDirectory --value) == "$site" ]]
apt-get update
apt-get install -y rsync python3 curl
group=$(id -gn prause)
if ! id site-deploy >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash site-deploy
fi
account_home=$(getent passwd site-deploy | cut -d: -f6)
deploy_group=$(id -gn site-deploy)
[[ -n $account_home && $account_home != / ]]

install -d -m 755 /usr/local/lib/robin-prause
install -o root -g root -m 755 "$(dirname "$0")/receive.sh" /usr/local/lib/robin-prause/receive.sh
rule=$(mktemp)
trap 'rm -f "$rule"' EXIT
printf 'prause ALL=(root) NOPASSWD: /usr/bin/systemctl restart robin-prause.service\n' > "$rule"
printf 'site-deploy ALL=(prause) NOPASSWD: /usr/local/lib/robin-prause/receive.sh deploy\n' >> "$rule"
visudo -cf "$rule"
install -o root -g root -m 440 "$rule" /etc/sudoers.d/robin-prause-deploy

# Keep unrelated files, including .env, out of ownership changes and deployments.
chown prause:"$group" "$site"
for entry in public templates i18n node_modules server.js mail.js mcp.js package.json package-lock.json .deploy-revision .deploy.lock; do
  if [[ -e "$site/$entry" ]]; then chown -R prause:"$group" "$site/$entry"; fi
done
install -d -o site-deploy -g "$deploy_group" -m 700 "$account_home/.ssh"
touch "$account_home/.ssh/authorized_keys"
entry="restrict,command=\"/usr/bin/sudo -n -u prause /usr/local/lib/robin-prause/receive.sh deploy\" $key"
if ! grep -Fqx "$entry" "$account_home/.ssh/authorized_keys"; then
  printf '%s\n' "$entry" >> "$account_home/.ssh/authorized_keys"
fi
chown site-deploy:"$deploy_group" "$account_home/.ssh/authorized_keys"
chmod 600 "$account_home/.ssh/authorized_keys"
echo 'Deployment access installed; trigger the GitHub Actions workflow.'
