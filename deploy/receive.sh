#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[[ $# == 1 && $1 == deploy ]] || { echo 'Only deployment is allowed' >&2; exit 1; }
site=/var/www/robin-prause
[[ $(id -un) == prause ]] || { echo 'Run as prause' >&2; exit 1; }
exec 9>"$site/.deploy.lock"
flock -w 600 9
work=$(mktemp -d /tmp/robin-deploy.XXXXXXXX)
trap 'rm -rf -- "$work"' EXIT
mkdir "$work/new" "$work/old"
cat > "$work/site.tar"

# Only regular website files and directories may enter the staging area.
# Reject links and path traversal, even with a compromised deployment key.
python3 - "$work/site.tar" "$work/new" <<'PY'
import sys, tarfile
from pathlib import PurePosixPath
roots = {'server.js', 'mail.js', 'mcp.js', 'package.json', 'package-lock.json',
         'public', 'templates', 'i18n', 'scripts', '.deploy-revision'}
with tarfile.open(sys.argv[1]) as archive:
    for member in archive.getmembers():
        path = PurePosixPath(member.name)
        if path.is_absolute() or '..' in path.parts or not path.parts:
            raise SystemExit('Unsafe archive path')
        if path.parts[0] not in roots or not (member.isfile() or member.isdir()):
            raise SystemExit('Unexpected archive member')
    archive.extractall(sys.argv[2], filter='data')
PY

cd "$work/new"
[[ $(node -p 'Number(process.versions.node.split(".")[0])') -ge 22 ]]
grep -Eq '^[0-9a-f]{40}$' .deploy-revision
npm ci --omit=dev --ignore-scripts
node scripts/check-site.mjs

directories=(public templates i18n node_modules)
files=(server.js mail.js mcp.js package.json package-lock.json .deploy-revision)
for entry in "${directories[@]}" "${files[@]}"; do
  if [[ -e "$site/$entry" ]]; then
    cp -a "$site/$entry" "$work/old/"
  fi
done

restore() {
  echo 'Deployment failed; restoring previous website' >&2
  for dir in "${directories[@]}"; do
    if [[ -d "$work/old/$dir" ]]; then
      rsync -a --delete "$work/old/$dir/" "$site/$dir/"
    fi
  done
  for file in "${files[@]}"; do
    if [[ -f "$work/old/$file" ]]; then cp -a "$work/old/$file" "$site/$file"; fi
  done
  sudo -n /usr/bin/systemctl restart robin-prause.service
}
trap 'trap - ERR; restore; exit 1' ERR
for dir in "${directories[@]}"; do
  mkdir -p "$site/$dir"
  rsync -a --delete "$work/new/$dir/" "$site/$dir/"
done
for file in "${files[@]}"; do cp -a "$work/new/$file" "$site/$file"; done
sudo -n /usr/bin/systemctl restart robin-prause.service

healthy=false
for attempt in {1..20}; do
  if curl --fail --silent --output /dev/null http://127.0.0.1:4321/; then
    healthy=true; break
  fi
  sleep 1
done
[[ $healthy == true ]]
trap - ERR
printf 'Deployed %s\n' "$(cat "$site/.deploy-revision")"
