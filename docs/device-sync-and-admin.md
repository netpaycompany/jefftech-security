# Device synchronization, backups, and administrator access

## Database migration

Apply migrations in order, including `003_client_side_vault_encryption.sql` and `004_device_sync_and_architecture.sql`. Migration 004 tightens profile/device/session/security-event permissions, adds verified/revoked device metadata, account subscriptions, indexes, update timestamps, and owner-checked RPCs. The Supabase project previously returned HTTP 403 to migration commands; do not assume these local migrations are deployed.

The existing profile, vault, item, folder, key, device, session, event, attachment, recovery, and account-settings tables use UUIDs, foreign keys, timestamps, RLS, and owner policies. Vault write functions check ownership and monotonically increasing item revisions. The account subscription table is a schema foundation only; payment processing and plan enforcement are not implemented.

## Multi-device behavior

The ciphertext already stored in the account vault is synchronized by loading the same authenticated ciphertext records on each signed-in device. Each device derives its own key-encryption key from the user-entered master password and locally unwraps the vault key. The server receives neither the master password nor the plaintext vault key.

Device registration IDs are non-secret browser identifiers. A user can register, mark the current device verified after unlocking, and revoke a device registration. Revocation uses the server-only Supabase service-role key to revoke all refresh sessions for the account, not only one device. The client must sign in again afterward. Existing JWT access tokens and data already downloaded may remain usable until their expiry; no server can erase secrets a device previously decrypted.

The current verified status is an account-level trust label, not a cryptographic hardware/device binding. Do not treat it as phishing-resistant device attestation. Supabase authenticated reads are still scoped to the user's account; there is no device-bound data-plane token yet.

Record edits use database revision compare-and-swap. A stale write fails instead of overwriting newer ciphertext. The UI provides manual synchronization, but not a three-way merge or automatic conflict resolver.

## Encrypted backups

The download contains ciphertext envelopes and opaque record metadata, then encrypts the archive with the already-unlocked vault key using AES-256-GCM. The same vault password used for the rest of the app unlocks the key envelope in the backup; there is no separate backup password. It never includes decrypted records or a plaintext vault key. Restore/import is not implemented. Keep the backup file private and retain access to the vault password or recovery key.

## Administrator control plane

Admin pages and APIs require the Supabase `app_metadata.role` claim to equal `admin`. Assign this claim only through a trusted administrative process. Management APIs verify the user on the server and use `SUPABASE_SERVICE_ROLE_KEY` only in server-only code. Never prefix this key with `NEXT_PUBLIC_` or import the admin helper into a client component. The account directory exposes limited account metadata and can suspend/reactivate accounts; the overview reports counts, subscription plan status, and event type/severity/time only. It never selects vault keys, encrypted records, attachments, passwords, or event metadata.

Admin email notifications use Resend with a Jefftech-branded template. Configure server-only `RESEND_API_KEY` and verified `RESEND_FROM_EMAIL`. Outbound messages do not set a `Reply-To` header, so recipients' replies are not routed to the admin mailbox. To accept messages sent directly to the mailbox, configure `RESEND_INBOUND_ADDRESS` (the selected address is `support@replies.netppay.com`) and `RESEND_WEBHOOK_SECRET`; apply migration `012_admin_email_mailbox.sql`. In Resend, enable receiving for the dedicated reply subdomain, publish the exact MX record Resend provides, and create a signed webhook to `https://<your-production-host>/api/webhooks/resend` for `email.received`, `email.sent`, `email.delivered`, `email.opened`, `email.bounced`, `email.failed`, and `email.suppressed`. Do not replace root-domain MX records if they serve an existing mailbox. Enable open tracking in the Resend sending-domain settings to receive `email.opened` events; open tracking may be blocked or triggered by privacy proxies and is not proof that a person read a message. The mailbox stores inbound/outbound message text and delivery/open timestamps for admin access; attachments are not downloaded or stored. Messages sent before this feature/migration are not backfilled.

Configure `SUPABASE_SERVICE_ROLE_KEY` as a server environment variable before enabling administration and device revocation. Supabase Auth's built-in rate limits should be configured for the deployment; this app does not yet provide distributed per-IP/account rate limiting for all API and RPC calls. MFA policy enforcement, subscription billing, device-specific session termination, and import/export restoration are not implemented.

## HTTP and browser security

The proxy issues per-request nonces and a nonce-based CSP, plus HSTS in production, frame denial, MIME sniffing protection, a restrictive referrer policy, and a permissions policy. Production HTTP requests redirect to HTTPS. Validate the final policy in deployed browsers and configure the hosting platform to enforce HTTPS and Supabase Auth rate limits. CSP and application controls do not replace dependency updates, independent security review, or deployment-level monitoring.
