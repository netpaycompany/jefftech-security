# Jefftech Security browser extension

The extension is a separate Chrome Manifest V3 application in `browser-extension/`. It uses React, TypeScript, Vite, Tailwind CSS, the existing website vault envelope and encrypted password-record format, and narrowly scoped Supabase RPCs. It does not replace website authentication or introduce a second vault password.

## Integration and security boundaries

- Account authorization happens on the Jefftech website. The extension opens `/extension/authorize` in `chrome.identity.launchWebAuthFlow`; the user signs in with the website's existing methods and explicitly approves the connection.
- A one-time authorization code is bound to an S256 PKCE challenge and expires after two minutes. The extension exchanges it for custom opaque tokens, not a Supabase user JWT. Access tokens expire after 15 minutes; refresh tokens rotate and expire after 30 days.
- The database stores hashes of authorization codes and extension tokens. Extension tokens are accepted only by the extension-specific security-definer RPCs in migration `008_browser_extension_auth.sql`. The extension has no service-role key and no direct table-write access.
- The extension reuses the website's Argon2id key envelope and AES-256-GCM encrypted password records. The master password is used only in the extension service worker to unwrap the vault key. The key and decrypted records stay in service-worker memory and are discarded when the vault locks or the worker stops.
- Extension tokens are held in `chrome.storage.session`, not sync storage. The vault is not available offline. A browser restart or service-worker suspension can require the user to reconnect or unlock again.
- Autofill is limited to HTTPS origins and top-level frames. Host access is optional and requested only for a site the user chooses. Credentials are shown as suggestions and are filled only after user selection; forms are never automatically submitted.
- Save-after-login detection is heuristic. The extension asks for confirmation before saving; it cannot reliably identify every successful login.

## Backend prerequisites

1. Apply `supabase/migrations/008_browser_extension_auth.sql` to the same Supabase project used by the website, after verifying the linked project reference:

   ```powershell
   npx supabase projects list
   npx supabase db push --dry-run
   npx supabase db push
   ```

   The migration adds extension authorization/session tables, token-gated password RPCs, and account-side session revocation. It does not add a separate vault table.

2. Set `JEFFTECH_EXTENSION_REDIRECT_URIS` in the website server environment to the exact Chrome Identity redirect URI, for example:

   ```text
   JEFFTECH_EXTENSION_REDIRECT_URIS=https://<extension-id>.chromiumapp.org/
   ```

   For multiple explicitly approved extension IDs, use a comma-separated list. Do not use a wildcard. Obtain the ID after loading the unpacked extension, then restart/redeploy the website so the server-side allowlist is active.

3. Set `NEXT_PUBLIC_APP_URL` to the deployed HTTPS website origin for production. Localhost HTTP is accepted only by development-mode extension builds. `NEXT_PUBLIC_SUPABASE_URL` must be HTTPS.

The redirect URI is not a Supabase OAuth-provider callback. It is the Chrome Identity callback used by the first-party website handoff. Never add a Supabase service-role key to extension environment variables or build output.

## Install and develop

From the repository root:

```powershell
npm --prefix browser-extension install
npm --prefix browser-extension test
npm --prefix browser-extension run typecheck
npm --prefix browser-extension run build -- --mode development
```

For production, configure the website's HTTPS `NEXT_PUBLIC_APP_URL` and build with:

```powershell
npm run extension:build
```

The build writes a self-contained MV3 extension to `browser-extension/dist/`. The manifest includes the Supabase HTTPS origin and optional HTTPS site permissions; it does not request broad site access by default.

To load the development build in Chrome:

1. Open `chrome://extensions`.
2. Enable Developer mode and choose **Load unpacked**.
3. Select `browser-extension/dist/`.
4. Copy the extension ID shown by Chrome, set its exact `https://<extension-id>.chromiumapp.org/` redirect URI in the website server environment, and restart the website.
5. Open the extension, connect the account, approve the website consent screen, and unlock with the same master password used by the website vault.

The website's Settings page lists and revokes connected extension sessions. The extension checks the session before vault actions and locks the in-memory vault if that check fails; revocation cannot erase data already copied or viewed on a device.

## Implemented functionality and known limits

- Connect/disconnect account, session refresh, account-side session revocation, expired-session handling, and vault unlock/lock. The unlocked vault key is held in memory-backed `chrome.storage.session` so it can be restored after service-worker suspension; it is cleared by explicit lock, disconnect, session invalidation, browser restart, or extension reload/update. It is not written to persistent storage. This trades protection for convenience: anyone with access to the active browser profile can use the unlocked vault.
- Search and list encrypted password records; create, edit, and delete records; folders, favorites, multiple records per site, and copy username/password.
- User-approved exact-origin autofill, dynamic form observation, one-click secure password generation for detected password forms, and automatic encrypted saving for detected signup forms after submission. Likely successful sign-ins are automatically saved when the form clears or disappears; if the vault is locked, the extension offers a save prompt after the vault is unlocked.
- The extension popup can explicitly generate a cryptographically random 24-character password and save it as a new encrypted credential for the active HTTPS site. It does not replace existing entries or submit/fill the website form.
- Website access is granted per HTTPS site from the extension popup; the extension does not request access to every website by default. Saved logins are shown only for the exact matching origin, and autofill always requires the user to choose a credential and click **Fill**.
- Cryptographically secure password generation and local weak/reused/old-password analysis.
- Browser UI screens for welcome/connect, unlock, dashboard, password list/details/editor, generator, security health, and settings.
- The extension currently syncs password records only. Other website vault item types are not exposed. Folder names are fields inside encrypted password records, not separate server-side folder resources.
- Password clipboard clearing is best effort; browser clipboard permissions and platform behavior prevent a guaranteed clear in all cases.

## Tests and release

See [security-testing.md](./security-testing.md) for the automated and manual security checklist. Tests and a successful build do not replace an independent security review or live testing against a staging Supabase project.

For a Chrome Web Store release, build the production bundle, zip the contents of `browser-extension/dist/`, and submit it through the Chrome Web Store developer dashboard. Provide a privacy policy and accurate permission justifications for `identity`, `storage`, `scripting`, `activeTab`, clipboard access, the Supabase origin, and optional per-site HTTPS access. Test authorization, revocation, autofill permission prompts, and vault locking with the final published extension ID before release.

Edge and Firefox are not currently built or tested. The extension should be treated as Chrome-only until their manifest, identity APIs, storage behavior, and packaging are implemented and verified.
