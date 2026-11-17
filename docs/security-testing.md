# Jefftech Password Vault security testing plan

## Goals

- Validate zero-knowledge encryption behavior and ensure plaintext secrets never reach the backend.
- Verify session handling, device trust, and MFA flows.
- Confirm admin interfaces expose only metadata and never vault contents.

## Vault encryption design

- The browser creates a fresh 32-byte vault key with `crypto.getRandomValues`.
- `hash-wasm` Argon2id derives a 32-byte key-encryption key from the master password with a random 16-byte salt (64 MiB, 3 iterations, one lane). The master password and derived key are never sent to Supabase.
- Web Crypto AES-256-GCM encrypts the vault key and each record independently, with a fresh 12-byte nonce and 128-bit authentication tag. Authenticated additional data binds wrapped keys to the account, vault, version and purpose; record data is bound to the account, vault, record ID/type, version and monotonic record revision.
- The database stores ciphertext envelopes, salts, nonces, algorithm/KDF parameters, key versions and opaque record metadata. Vault write RPCs use owner checks and revision compare-and-swap; direct client writes are blocked by RLS. Keep migrations current before using the vault.
- Migration `003_client_side_vault_encryption.sql` intentionally refuses to run when any pre-existing vault tables contain rows; migrate such data with a trusted, authorized client before deploying rather than silently treating old plaintext as encrypted.
- A randomly generated 32-byte recovery key wraps the vault key separately. Only its ciphertext is stored. The user must save the recovery key outside the service; administrators cannot recover a forgotten master password without this user-held key.
- Key rotation decrypts and re-encrypts all records under a new random vault key and next version in one database transaction. It also generates a fresh recovery key, requires the user to save it before commit, and revokes the previous recovery wrapper. Local photos are re-encrypted with that new key when they have been migrated to vault encryption. Stale writes, cross-account substitution, ciphertext tampering and unsupported/downgraded versions fail closed.
- The app migrates recognizable legacy browser-stored credentials only after explicit account confirmation, and removes that plaintext copy only after encrypted import succeeds.
- Password favorites and bounded password history are part of the encrypted password-record payload. Secure notes, identities, cards, bank accounts, recovery codes, licenses, and document records use the same per-item authenticated encryption.
- Secure documents are currently limited to 2 MiB and stored as encrypted vault-item payloads in the database; file bytes, name, and media type are encrypted before upload. The app does not preview uploaded documents.
- Private photos remain local to the browser and are encrypted with the unlocked vault key. Existing photo libraries encrypted with a prior passphrase or device key are migrated locally; passphrase-based libraries require their old passphrase once for migration.
- The user dashboard reads real encrypted-item counts, trusted-device totals, recovery-key configuration and security events from owner-scoped tables. Vault activity stores only item IDs, item types, action names and timestamps; it never stores decrypted titles or credentials.
- Weak/reused-password analysis runs locally after unlock. Breach checks are opt-in and send only a five-character SHA-1 prefix to the Have I Been Pwned range API; the service still observes the user's IP address and requested prefixes.
- The password generator uses `crypto.getRandomValues` with rejection sampling. Passphrases are selected from a local 64-by-64 word-pair space (12 bits per pair).
- The Chrome extension uses a first-party Jefftech website consent handoff with S256 PKCE, one-time authorization codes, and rotating opaque extension tokens. These are not Supabase JWTs and are accepted only by extension-specific RPCs. Authorization codes and tokens are stored hashed in the database; the extension stores tokens in `chrome.storage.session`, not sync storage. Website Settings can revoke sessions. This flow, token rotation, and revocation still require live staging verification.
- Extension vault operations reuse the website's encrypted key envelope and encrypted password-item format. The master password is entered only into the extension UI and passed to the service worker for Argon2id key derivation; it is not sent to Supabase or persisted. The unwrapped vault key and decrypted records remain in service-worker memory and are cleared on lock or worker termination.
- Extension host access is optional, requested for HTTPS origins per site, and fill messaging is restricted to the top-level page. Credentials are only filled after explicit selection and are never submitted automatically. Successful-login detection is heuristic and save/update always requires confirmation.

These controls prevent stale application writes and record substitution while the database maintains its revision state. A privileged database operator restoring an entire older database snapshot can also restore valid old ciphertext and revisions; clients cannot detect a full database rollback without an independent trusted monotonic checkpoint.

Browser memory cannot be guaranteed to be securely erased. Locking zeros key byte arrays, drops references to decrypted records, and auto-locks after inactivity, but JavaScript strings, garbage-collected copies, browser extensions, injected scripts and operating-system memory remain outside the app's control.

## Test checklist

The extension's current automated unit tests cover website-format AES-GCM/Argon2id compatibility, ciphertext tampering, website-origin matching, password generation and local health calculations, and strict message validation. Run them with:

```powershell
npm --prefix browser-extension test
npm --prefix browser-extension run typecheck
npm --prefix browser-extension run build -- --mode development
```

Authentication against a real Jefftech session, browser autofill behavior, permission revocation, and Supabase RPC policies still require the staging/manual checks below; a passing unit suite does not validate those integrations.

1. Encryption checks
   - Verify key and nonce lengths, AES-GCM authentication failures, and unique random nonces for independent encryption operations.
   - Confirm the database receives no record plaintext, master password, derived key or recovery key.
   - Tamper with ciphertext, nonce, AAD fields, revision, owner/vault IDs, algorithm, KDF parameters and key version; unlocking must fail closed.
   - Replay an older record write or delete request; revision compare-and-swap must reject it.
   - Rotate a vault with zero, one and multiple records; verify atomicity, revision increments, local photo re-encryption and rejection of the old key version.

2. Authentication checks
   - Validate account password and master password are separated.
   - Test sign-in, sign-up, password reset, and device verification flows.
   - Confirm failed auth attempts display generic error states.

3. Vault access checks
   - Ensure records are decrypted only after explicit unlock.
   - Verify manual, inactivity, sign-out and account-change locks clear key buffers and decrypted UI state.
   - Validate RLS policies allow only user-owned records.
   - Exercise recovery with a valid/invalid recovery key and confirm recovery never sends the key to the backend.
   - Verify dashboard counts and activity are account-scoped, item changes are recorded atomically, and activity contains no decrypted item content.

4. Document, breach-check, and extension checks
   - Inspect database writes and confirm document payload metadata and bytes are ciphertext only.
   - Verify the 2 MiB document limit, authenticated decryption, and lock-time loss of decrypted document state.
   - Verify Photos is unavailable while the vault is locked, is encrypted with the current vault key, and migrates legacy photo libraries without losing their metadata or image contents.
   - Verify backup export requires an unlocked vault, uses the vault key without prompting for another password, and contains neither decrypted records nor a plaintext vault key.
   - Confirm breach requests contain only the first five hash characters and that suffix matching is local; verify no check runs until the user explicitly starts it.
   - Verify the extension requires explicit autofill approval, displays only exact-origin HTTPS matches, and refuses subdomains, unrelated origins, HTTP, invalid URLs, and malformed envelopes.
   - Verify the website consent flow using the exact allowlisted Chrome Identity redirect URI; reject unlisted redirects, incorrect state, malformed challenges, expired/replayed codes, and invalid PKCE verifiers.
   - Verify access-token expiry, refresh-token rotation and replay rejection, session revocation from website Settings, and that extension tokens cannot invoke unrelated Supabase APIs.
   - Confirm tokens exist only in `chrome.storage.session`, the PKCE verifier is transient, and the extension manifest contains no service-role key or unnecessary default site access.
   - Confirm the master password is not persisted or sent to the backend; lock/worker termination drops the key and decrypted records, and unlock reloads only password records.
   - Confirm content-script messages are accepted only from the extension's top frame on the same HTTPS origin; reject page-origin messages, frames, malformed payloads, ungranted origins, and credentials for another origin.
   - Verify dynamically inserted forms, multiple credentials for one origin, explicit fill selection, no automatic form submission, and user-confirmed save/update behavior.
   - Verify extension capture is user initiated and the user approves the values before the encrypted save RPC.

5. Admin checks
   - Confirm admin dashboards show operational metadata only.
   - Verify no plaintext or decrypted vault content is accessible to administrators.

6. Security review items
   - Run dependency vulnerability checks.
   - Confirm CSP and security headers are configured.
   - Audit logs should capture critical events without exposing secret values. Extension authorization and revocation events contain no vault item contents or token values.

## Production readiness

Before production launch, deploy to a staging environment and run the above checks with a security reviewer signed off on the zero-knowledge architecture, recovery flow, and key rotation scheme.
