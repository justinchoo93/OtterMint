# OtterFin Information Security Policy

**Version:** 1.0
**Effective Date:** March 6, 2026
**Last Reviewed:** March 6, 2026
**Owner:** Justin Choo, Founder (justin.k.choo@gmail.com)

---

## 1. Purpose

This policy establishes the information security practices for OtterFin, a personal finance dashboard application that integrates with financial institutions via Plaid. It defines how we protect consumer financial data throughout its lifecycle.

## 2. Scope

This policy applies to all systems, data, and processes involved in the operation of OtterFin, including:
- The web application and its infrastructure
- All consumer data collected, processed, and stored
- Third-party integrations (Plaid, Supabase)
- Development and deployment processes

## 3. Information Security Program

### 3.1 Governance
- Justin Choo (Founder) is responsible for maintaining and enforcing this policy
- This policy is reviewed and updated at minimum annually, or when significant changes occur
- Security incidents are tracked, investigated, and remediated with documented post-mortems

### 3.2 Risk Management
- Security risks are identified and assessed on an ongoing basis
- Vulnerability scanning is performed automatically on every code change and weekly via CI/CD
- Dependencies are monitored for known vulnerabilities using `npm audit`
- End-of-life software is tracked and upgraded proactively

---

## 4. Access Control Policy

### 4.1 Consumer Authentication
- All consumer accounts require email and password authentication
- Passwords must be a minimum of 8 characters
- Passwords are hashed using bcrypt with a cost factor of 12 (never stored in plaintext)
- Repeated failed password attempts trigger a temporary account lockout
- TOTP-based multi-factor authentication (MFA) is available and can be enabled by users
- MFA uses industry-standard TOTP (RFC 6238) with authenticator app support
- Eight single-use recovery codes are generated during MFA setup for account recovery
- Repeated failed MFA verification attempts trigger a temporary lockout on the pending MFA session

### 4.2 Session Management
- Sessions are identified by cryptographically random UUIDs
- Session cookies are set with `HttpOnly`, `Secure` (production), and `SameSite=Lax` flags
- Sessions expire after 30 days of inactivity (sliding expiration)
- MFA-pending sessions expire after 10 minutes
- Sessions are invalidated on logout and account deletion

### 4.3 Role-Based Access Control (RBAC)
- All financial data is scoped to the authenticated user via `userId` foreign keys
- Group/household features use role-based access (owner, member)
- Share links provide scoped, read-only access with configurable data visibility (net worth, balances, transactions)
- Share links can be revoked at any time and support optional expiration dates
- Supabase-exposed tables in the `public` schema have PostgreSQL row-level security (RLS) enabled
- Supabase `anon` and `authenticated` roles do not have direct privileges on application tables or sequences

### 4.4 Infrastructure Access
- Database access requires SSL/TLS connections (`sslmode=require`)
- API keys and secrets are stored as environment variables, never in source code
- Plaid access tokens are encrypted at rest before storage (see Section 5)

### 4.5 Non-Human Authentication
- Plaid API integration uses OAuth access tokens for financial institution access
- Database connections authenticate via TLS certificates
- All API communication uses HTTPS (TLS 1.2+)

---

## 5. Encryption Policy

### 5.1 Data in Transit
- All client-server communication is encrypted via TLS 1.2 or higher
- HTTP Strict Transport Security (HSTS) is enforced with a 2-year max-age, including subdomains
- Database connections require TLS encryption

### 5.2 Data at Rest

#### Sensitive Consumer Data (Application-Level Encryption)
The following data is classified as sensitive and encrypted at the application level using AES-256-GCM authenticated encryption:
- **Plaid access tokens** - These provide direct access to consumer financial institutions and are the highest-sensitivity credential we store. Each token is encrypted with a unique random 12-byte IV and authenticated with a 16-byte GCM auth tag.
- **TOTP secrets** - MFA secrets are encrypted using the same AES-256-GCM scheme before storage.

#### Consumer Passwords
- Passwords are one-way hashed using bcrypt with a cost factor of 12 (not reversible)

#### Recovery Codes
- MFA recovery codes are one-way hashed using bcrypt (not reversible)

#### Other Consumer Data (Infrastructure-Level Encryption)
The following data is protected by infrastructure-level encryption provided by Supabase (our database provider):
- Account names, types, balances, and masks
- Transaction amounts, dates, merchant names, and categories
- Investment holdings (security names, quantities, values)
- User profile information (email, display name)
- Net worth snapshots

Supabase encrypts all data at rest using AES-256 on the underlying storage volumes. All data in the database is covered by this disk-level encryption.

### 5.3 Definition of Sensitive Consumer Data
We define **sensitive consumer data** as any credential or secret that, if compromised, would grant direct access to a consumer's financial institutions or authentication mechanisms. This includes:
1. **Plaid access tokens** - Provide API access to bank accounts, transactions, and holdings
2. **TOTP authentication secrets** - Would allow bypassing MFA if exposed

These are encrypted at the application level (AES-256-GCM) because they require a higher level of protection than infrastructure encryption alone provides. Compromise of these values would enable direct unauthorized access to financial accounts or authentication bypass.

Other consumer data (balances, transactions, holdings) is financial information that is sensitive in nature but does not provide access credentials. This data is protected by:
- Infrastructure-level disk encryption (AES-256 via Supabase)
- TLS encryption in transit
- Application-level access controls (user-scoped queries, session authentication)
- MFA for authenticated access

### 5.4 Key Management
- Encryption keys are stored as environment variables, separate from application code and database
- Keys are 256-bit (32 bytes) generated using cryptographically secure random number generation

---

## 6. Data Retention and Disposal Policy

### 6.1 Data Retention

| Data Category | Retention Period | Justification |
|--------------|-----------------|---------------|
| User account (email, name) | Duration of account | Required for authentication and service delivery |
| Financial accounts & balances | Duration of account | Core application functionality |
| Transaction history | Duration of account | Core application functionality |
| Investment holdings | Duration of account | Core application functionality |
| Net worth snapshots | Duration of account | Trend tracking feature |
| Manual accounts | Duration of account | User-entered data for dashboard |
| Session data | 30 days from last activity | Automatic expiration for security |
| Plaid access tokens | Duration of account | Required for financial data sync |
| Group memberships | Duration of account or until user leaves group | Household feature |
| Share links | Until revoked or expired | User-controlled sharing |

### 6.2 Data Disposal

#### Account Deletion
Users can delete their account at any time via the application settings. Account deletion:
1. **Revokes Plaid access tokens** via the Plaid API, terminating access to financial institutions
2. **Permanently deletes all user data** via database cascade deletion:
   - User profile (email, name, password hash, MFA secrets)
   - All sessions
   - All Plaid items and encrypted access tokens
   - All financial accounts and balances
   - All transactions
   - All investment holdings
   - All manual accounts
   - All net worth snapshots
   - All share links
   - All group memberships
3. **Clears session cookies** in the browser
4. **Clears MFA-pending cookies and sessions** if a sign-in was in progress

This deletion is immediate and irreversible. No data is retained after account deletion.

#### Automatic Disposal
- Expired sessions are eligible for cleanup after their 30-day expiration
- Revoked share links are soft-deleted (marked with `revokedAt` timestamp)
- Expired group invitations are no longer valid after their expiration date

### 6.3 Data Portability
Users can view all of their data through the application dashboard at any time, including accounts, transactions, holdings, and net worth history.

---

## 7. Vulnerability Management

### 7.1 Dependency Scanning
- `npm audit` is run automatically on every pull request and weekly via GitHub Actions
- Production dependencies are audited at `high` severity level
- Identified vulnerabilities are patched within the following SLAs:
  - **Critical:** 24 hours
  - **High:** 7 days
  - **Medium:** 30 days

### 7.2 Code Security
- Application code is linted on every PR via ESLint
- TypeScript provides compile-time type safety
- SQL injection is prevented by the Drizzle ORM (parameterized queries)
- XSS is mitigated by React's default output encoding and HTTP response hardening headers
- Sensitive bearer tokens stored in Postgres are protected from Supabase API exposure via RLS and privilege revocation

### 7.3 Security Headers
The application enforces the following HTTP security headers:
- `Strict-Transport-Security`: max-age=63072000; includeSubDomains; preload
- `X-Frame-Options`: DENY
- `X-Content-Type-Options`: nosniff
- `Referrer-Policy`: strict-origin-when-cross-origin
- `Permissions-Policy`: camera=(), microphone=(), geolocation=()

---

## 8. Incident Response

### 8.1 Response Procedure
1. **Identify** - Detect and confirm the security incident
2. **Contain** - Revoke compromised credentials (Plaid tokens, encryption keys, sessions)
3. **Notify** - Inform affected users of the breach and its scope
4. **Remediate** - Patch the vulnerability and deploy the fix
5. **Review** - Conduct a post-incident review and update policies as needed

### 8.2 Contact
- Security inquiries: justin.k.choo@gmail.com

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | March 6, 2026 | Initial policy |
| 1.1 | March 11, 2026 | Added Supabase RLS controls, auth/MFA lockout controls, and MFA session cleanup requirements |
