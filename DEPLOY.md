# Deploying insureitwithkevin.in

The site is a **static site** (no build step): `index.html`, `css/`, `js/`, `images/`,
plus `.htaccess` (security headers + clean URLs on Hostinger's Apache).

## Hosting: Hostinger (Single Web Hosting plan)

The domain `insureitwithkevin.in` is served from
`/domains/insureitwithkevin.in/public_html/` (addon-style — the domain was moved off
the Website Builder, so it is NOT the plan's primary `/public_html/`). The FTP login
lands in the account home `/home/uXXXXXXXXX/`, so the deploy `server-dir` must be the
full `/domains/insureitwithkevin.in/public_html/` path. Deploying to `/public_html/`
uploads to an un-served folder (files appear to "not update"). Confirm the served path
in hPanel File Manager -> "Access all files of Single Web Hosting".

### Auto-deploy pipeline (GitHub -> Hostinger, via FTP)

Because the Single plan does not include Hostinger's native Git tool, auto-deploy is
done with **GitHub Actions + FTP** — see [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

**To turn it on (one time):**
1. Hostinger hPanel -> `insureitwithkevin.in` -> **Files -> FTP Accounts**. Note the
   FTP **hostname**, **username**, and set the **password**.
2. GitHub -> repo **Settings -> Secrets and variables -> Actions** -> add secrets:
   - `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`
3. Push to `main` (or run the workflow manually from the **Actions** tab).

After that, every push to `main` uploads the changed files to the served `public_html`
automatically.

> If the FTPS protocol errors out, change `protocol: ftps` to `protocol: ftp` in the
> workflow (Hostinger also supports plain FTP), or verify the port/host in hPanel.

## Note on Vercel

`vercel.json` still deploys this repo to Vercel (`iwk-hazel.vercel.app`) independently —
harmless and left in place. Hostinger's Apache ignores `vercel.json` and uses `.htaccess`.
