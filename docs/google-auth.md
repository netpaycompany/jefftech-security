# Google sign-in and signup

The login and signup pages use Supabase Auth's Google provider. OAuth returns to the website's `/auth/callback` route; new accounts can provide an optional referral code and must accept the terms before continuing to vault setup. Phone numbers are not collected during signup and remain editable in profile settings.

## Configure Supabase and Google

1. In Google Cloud Console, create or select an OAuth 2.0 Web application client. Add the Supabase project's callback URL to **Authorized redirect URIs**:

   ```text
   https://<project-ref>.supabase.co/auth/v1/callback
   ```

2. In Supabase Dashboard, open **Authentication → Providers → Google**, enable the provider, and enter the Google client ID and client secret there. Do not put the client secret in website or extension environment variables.
3. In Supabase **Authentication → URL Configuration**, set the production **Site URL** and add the website callback URLs to **Redirect URLs**:

   ```text
   http://localhost:3000/auth/callback
   https://<your-domain>/auth/callback
   ```

   For preview deployments, add only the exact origins and callback paths you use. Avoid broad wildcards where possible.
4. Confirm email/password signup and Google user creation are enabled in Supabase Auth if both methods should be available.
5. Test signup and sign-in on localhost and the deployed HTTPS site. A newly created Google account completes signup and then sets up a vault master password; existing accounts continue to their dashboard or requested in-app destination.

No Supabase database migration is required. Profile details are written through the existing authenticated `profiles` self-update policy. The signup terms checkbox follows the site's current UX; this flow does not persist a legal-consent record.
