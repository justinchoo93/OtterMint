# Security Audit Log

**Date:** March 11, 2026  
**Scope:** Supabase exposure findings, authentication/session handling, invite/share token handling, sensitive logging

## Findings Remediated

### 1. Supabase public-schema exposure
- Enabled PostgreSQL row-level security on all application tables in `public`
- Revoked direct table and sequence privileges from Supabase `anon` and `authenticated` roles
- Impact: resolves the Supabase `rls_disabled_in_public` and `sensitive_columns_exposed` findings for application tables

### 2. Missing password login lockout
- Added `users.failed_login_attempts` and `users.locked_until`
- Added a temporary lockout after repeated failed password attempts
- Impact: reduces credential-stuffing and online password guessing risk

### 3. Missing MFA verification lockout
- Added `sessions.mfa_failed_attempts` and `sessions.mfa_locked_until`
- Added a temporary lockout after repeated failed MFA verification attempts
- Impact: reduces online guessing of TOTP and recovery codes

### 4. MFA pending session identifier exposed to the client
- Removed the pending session ID from login JSON responses
- Removed the pending session ID from the MFA verification URL
- MFA verification now uses the server-set `mfa_pending` HttpOnly cookie instead of trusting a request-body session ID
- Impact: reduces leakage through browser history, client-side logs, and screenshots

### 5. MFA pending sessions lived longer than intended
- MFA-pending sessions now use a 10-minute database expiry at creation time
- Successful MFA verification extends the session to the standard 30-day authenticated session window
- Impact: aligns the server-side session lifetime with the intended MFA verification window

### 6. Logout did not fully clear MFA-pending state
- Logout now deletes both `session_id` and `mfa_pending` sessions when present
- Logout and account deletion now clear both cookies
- Impact: prevents stale MFA redirect state and removes lingering pending sessions

### 7. Invitation tokens overexposed within groups
- Restricted invitation listing and creation to group owners
- Updated the group settings UI so only owners can view or generate invite links
- Impact: reduces unnecessary disclosure of invite bearer tokens

### 8. Sensitive server logging
- Replaced raw error-object logging on high-sensitivity auth and Plaid routes with sanitized server logging
- Impact: reduces accidental credential/session/token exposure in logs

## Additional Notes

### Residual low-risk behavior
- Public invite validation still returns minimal group metadata to holders of a valid invite token. This remains acceptable because invite tokens are high-entropy bearer secrets and the route is required for the invite UX.

### Recommended future hardening
- Add IP-based or edge-level rate limiting in front of login, MFA verification, invite validation, and share-link lookup routes. The new account/session lockouts materially reduce online guessing risk, but they do not replace network-level abuse controls.

### Verification
- Run `npm test`
- Apply `drizzle/0002_tranquil_morlocks.sql`
- Re-run Supabase database linter after the migration is applied
