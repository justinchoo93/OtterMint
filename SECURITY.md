# OtterFin Security Policy

## Encryption

### Data in Transit
- All client-server communication is encrypted via TLS 1.2+
- HSTS headers enforce HTTPS with a 2-year max-age
- Database connections require SSL (`sslmode=require`)

### Data at Rest
- Plaid access tokens: AES-256-GCM authenticated encryption with per-token random IVs
- User passwords: bcrypt with cost factor 12
- Database hosted on Supabase with disk-level encryption enabled

## Authentication & Access Control

### User Authentication
- Session-based authentication with cryptographically random UUIDs
- HttpOnly, Secure, SameSite=Lax cookies
- 30-day sliding session expiry
- Login lockout after repeated failed password attempts
- MFA lockout after repeated failed verification attempts
- TOTP-based multi-factor authentication (MFA) available

### Access Control
- All data is scoped to authenticated users via `userId` foreign keys
- Public-schema tables are protected with PostgreSQL row-level security (RLS)
- Supabase `anon` and `authenticated` roles are revoked from application tables and sequences
- Role-based access for groups (owner/member)
- Plaid OAuth tokens for financial institution access
- Share links provide scoped, read-only access with optional expiration

## Vulnerability Management

### Dependency Scanning
- `npm audit` runs on every PR and weekly via GitHub Actions
- Production dependencies audited at `high` severity level
- Dependencies updated and patched on a regular basis

### End-of-Life Software
- Node.js and framework versions are monitored and updated
- EOL dependencies are flagged during audit scans

## Data Handling

### Collection
- User consent is collected at registration before any data processing
- Financial data is retrieved via Plaid's secure API
- Only data necessary for dashboard display is stored

### Retention
- Data retained while account is active
- Account deletion permanently removes all user data (cascade delete)
- Sessions expire after 30 days of inactivity

### Deletion
- Users can delete their account via Settings, which:
  - Revokes Plaid access tokens
  - Cascade-deletes all associated data (accounts, transactions, holdings, snapshots)
  - Clears all sessions

## Incident Response

If a security vulnerability is discovered:
1. Assess scope and impact
2. Revoke compromised credentials (Plaid tokens, encryption keys)
3. Notify affected users
4. Patch and deploy fix
5. Post-incident review

## Audit Log

Security audit history is tracked in [docs/security-audit-2026-03-11.md](/Users/justin/Documents/code/ai-playground/otterfin/docs/security-audit-2026-03-11.md).

## Contact

Security inquiries: justin.k.choo@gmail.com
