# Deploying insureitwithkevin.in

The site is a **static site** (no build step): `index.html`, `css/`, `js/`, `images/`,
plus `.htaccess` (security headers + clean URLs on Hostinger's Apache).

## Hosting: Hostinger (Single Web Hosting plan)

The domain `insureitwithkevin.in` is served from Hostinger's `public_html`.

### Auto-deploy pipeline (GitHub -> Hostinger, via FTP)

Because the Single plan does not include Hostinger's native Git tool, auto-deploy is
done with **GitHub Actions + FTP** — see [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

**To turn it on (one time):**
1. Hostinger hPanel -> `insureitwithkevin.in` -> **Files -> FTP Accounts**. Note the
   FTP **hostname**, **username**, and set the **password**.
2. GitHub -> repo **Settings -> Secrets and variables -> Actions** -> add secrets:
   - `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`
3. Push to `main` (or run the workflow manually from the **Actions** tab).

After that, every push to `main` uploads the changed files to `public_html` automatically.

> If the FTPS protocol errors out, change `protocol: ftps` to `protocol: ftp` in the
> workflow (Hostinger also supports plain FTP), or verify the port/host in hPanel.

## Note on Vercel

`vercel.json` still deploys this repo to Vercel (`iwk-hazel.vercel.app`) independently —
harmless and left in place. Hostinger's Apache ignores `vercel.json` and uses `.htaccess`.
