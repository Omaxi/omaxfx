# TradePast web platform setup

The web experience adds a public TradePast landing page and Supabase email/password authentication around the existing React backtesting engine. Electron desktop builds bypass web authentication and advertising scripts so installed desktop builds remain local/offline.

## 1. Enable free account registration

1. Create a Supabase project on its Free plan: https://supabase.com/dashboard
2. Copy the Project URL and publishable/anon key from Project Settings → API.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as deployment build environment variables (or in `.env.local` for local development).
4. In Supabase Authentication → URL Configuration, set the deployed site URL and allowed redirect URLs.
5. Configure email confirmation and the email provider before opening registration publicly.
6. Rebuild/redeploy after setting environment variables.

Only the public anon/publishable key belongs in browser builds. Never expose a Supabase service-role key. Registration and login remain unavailable until the Supabase public configuration is present; this prevents presenting a non-working sign-up form as live.

## 2. Hosting and custom domain

The existing GitHub Pages project URL is:

https://omaxi.github.io/omaxfx/

The Pages build uses the repository subpath. A custom domain such as `www.tradepast.com` must be registered/owned separately, then configured in GitHub Pages and at the domain registrar using the DNS records GitHub provides. Do not add a CNAME or claim the custom domain is live until ownership and DNS are verified. The site owner must also add the custom domain to Supabase's allowed redirect URLs.

## 3. Advertising

Google AdSense Auto ads are supported as an optional web-only integration:

1. Apply for Google AdSense and add the deployed website for review: https://www.google.com/adsense/
2. After approval, copy the publisher ID (format `ca-pub-...`).
3. Set `VITE_ADSENSE_CLIENT` in the GitHub Pages build environment and redeploy.
4. Enable Auto ads in the AdSense dashboard and complete any required site verification / ads.txt steps shown by Google.

The AdSense script is not loaded when the publisher ID is blank and is never loaded in the Electron desktop app. The bottom-left four-second “Advertising” toast is only a visual notification; it is not an ad impression and does not itself earn revenue. Real revenue begins only after AdSense approval and valid ad serving. The current web accounts are the Free experience; paid ad-free entitlements are not yet connected.

## 4. Premium subscriptions

The proposed commercial plan is Free ($0) and Premium (suggested launch price $5.99/month or $49.99/year). These are planning prices only; checkout is not active and no payment is collected in this foundation.

Before selling subscriptions, configure a payment provider that accepts the merchant's country and complete its business/payout verification. Then implement server-side checkout creation, signed webhook verification, subscription status persistence, cancellation/renewal handling, and an entitlement check backed by the database. Never grant ad-free status based only on browser storage or a client-side success redirect. Paddle is a candidate to evaluate, but account and payout approval must be confirmed before it is selected for production.

## 5. Data scope and account behavior

- Email/password sign-up, login, session restoration/refresh and logout use Supabase Auth.
- The backtesting engine remains client-side. Saved sessions and drawings remain in the current browser profile; cloud sync and cross-device backups are not included.
- The web route requires an authenticated session. Electron desktop builds bypass the website gate and remain local/offline.
- The Advertising toast fades in, remains visible for four seconds, and fades out.

## 6. Deployment checks

The web-platform pull request includes GitHub Actions validation for dependency installation, automated tests and a production build. Merge only after those checks pass. GitHub Pages deployment runs from `main`; merging the web foundation is what publishes it to the existing project URL. Supabase and AdSense environment variables must be added to the repository's Pages build environment before the corresponding services can become active.

Supabase Free is suitable for an initial pilot, but review its inactivity pause and usage limits before relying on it for production uptime.
