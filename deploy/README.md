# Website deployment to the VPS

The production website runs as `prause` from `/var/www/robin-prause`, using
`robin-prause.service`, behind nginx on port 4321.

## One-time VPS setup

The repository contains only the **public** deployment key. Its private key is
stored as the GitHub Actions secret `VPS_DEPLOY_KEY`; `VPS_KNOWN_HOSTS` contains
the already verified SSH host keys. Never commit a private key or `.env`.

On the VPS, logged in as `robin`, download the setup and review it:

```sh
git clone --depth 1 https://github.com/robinprause1/robin-prause.git /tmp/robin-site-deploy-setup
sudo bash /tmp/robin-site-deploy-setup/deploy/install-vps.sh /tmp/robin-site-deploy-setup/deploy/github-actions.pub
```

Use a fresh destination directory if this one already exists. The installer:

- Checks the existing service's user and directory before making changes.
- Creates `site-deploy` for SSH access without changing the service user's shell.
- Installs a root-owned receiver script and a forced-command, restricted SSH key.
- Allows `site-deploy` to run only that receiver as `prause`; permits `prause`
  to restart only `robin-prause.service` without a password.
- Grants `prause` ownership of the managed website files, preserving `.env`
  ownership and contents and any unrelated application data.

Once setup succeeds, enable and test deployment from an authenticated local CLI:

```sh
gh variable set VPS_DEPLOY_ENABLED --body true --repo robinprause1/robin-prause
gh workflow run deploy-vps.yml --ref main --repo robinprause1/robin-prause
```

Until `VPS_DEPLOY_ENABLED` equals `true`, pushes run checks but skip deployment.
The first real deployment still needs verification on the VPS; the installer
does not restart the website itself.

## Each push to main

1. GitHub installs the lockfile dependencies and checks the German and English
   home and CV pages, including their referenced images.
2. GitHub archives only tracked runtime files plus their commit SHA, then sends
   the archive to the restricted SSH receiver.
3. The receiver locks deployment, rejects unsafe archive paths and links,
   installs dependencies in a temporary directory, and runs the same checks.
4. It snapshots the previous managed files, updates the runtime files and
   dependencies, restarts the service and checks the local HTTP endpoint.
5. On an update/start/health-check failure, it restores the snapshot and restarts
   the previous version. GitHub additionally checks the public HTTPS endpoint.

`.env`, `.git`, `data`, `originals` and other unlisted files are not uploaded or
deleted. `public`, `templates`, `i18n`, and `node_modules` are **managed exactly**:
files absent from the deployed version are removed from these directories.
Keep independently uploaded dance-course files outside these directories.
Only one deployment runs at a time. Do not manually stop a running deployment.
The service restarts briefly; this is not a zero-downtime deployment.

## Monitoring and disabling

View the repository's Actions tab for deployment status, or use:

```sh
gh run list --workflow deploy-vps.yml --repo robinprause1/robin-prause
```

On the VPS, `.deploy-revision` in the website directory identifies the installed
commit. Inspect the service with `systemctl status robin-prause.service --no-pager`.

To pause automatic deployments, set `VPS_DEPLOY_ENABLED` to `false`. To revoke
access, also remove the matching public key from the `site-deploy` account's
`authorized_keys`. Rotating the key requires updating both that file and the
GitHub secret; editing the public key in this repository alone is insufficient.

An unhealthy local restart triggers automatic restoration. A public HTTPS
failure after a healthy local restart marks the action failed, but does not
automatically restore files: nginx, DNS or TLS may be the cause. To undo a
successfully deployed code change, revert its Git commit and push to `main`.

## Local verification

```sh
npm ci --omit=dev --ignore-scripts
node scripts/check-site.mjs
bash -n deploy/receive.sh deploy/install-vps.sh
```

No credentials or contact-form messages are sent by the smoke check.
