import Link from "next/link";

export const metadata = {
  title: "Privacy Policy - OtterFin",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] px-4 py-12">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/"
          className="mb-8 inline-block text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
        >
          &larr; Back to dashboard
        </Link>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6 sm:p-8">
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">
            Privacy Policy
          </h1>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Last updated: March 6, 2026
          </p>

          <div className="mt-6 space-y-6 text-sm leading-relaxed text-[var(--text-secondary)]">
            <section>
              <h2 className="mb-2 font-semibold text-[var(--text-primary)]">
                1. What We Collect
              </h2>
              <p>
                OtterFin collects the following data to provide you with a
                personal finance dashboard:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  <strong>Account information:</strong> Email address, display
                  name, and hashed password for authentication.
                </li>
                <li>
                  <strong>Financial account data:</strong> Bank account names,
                  types, balances, and last-four digits (mask) retrieved via
                  Plaid.
                </li>
                <li>
                  <strong>Transactions:</strong> Transaction amounts, dates,
                  merchant names, and categories retrieved via Plaid.
                </li>
                <li>
                  <strong>Investment holdings:</strong> Security names, ticker
                  symbols, quantities, prices, and values retrieved via Plaid.
                </li>
                <li>
                  <strong>Manual accounts:</strong> Any accounts you add
                  manually, including name, type, and balance.
                </li>
                <li>
                  <strong>Net worth snapshots:</strong> Daily aggregated
                  financial summaries for trend tracking.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="mb-2 font-semibold text-[var(--text-primary)]">
                2. How We Store Your Data
              </h2>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  Plaid access tokens are encrypted at rest using AES-256-GCM
                  authenticated encryption.
                </li>
                <li>
                  Passwords are hashed using bcrypt with a cost factor of 12.
                </li>
                <li>
                  All data is stored in a PostgreSQL database with TLS-encrypted
                  connections.
                </li>
                <li>
                  All data in transit between your browser and our servers is
                  encrypted via TLS 1.2 or higher.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="mb-2 font-semibold text-[var(--text-primary)]">
                3. How We Use Your Data
              </h2>
              <p>
                Your data is used solely to display your financial information
                within the OtterFin dashboard. We do not sell, rent, or share
                your personal or financial data with any third parties.
              </p>
            </section>

            <section>
              <h2 className="mb-2 font-semibold text-[var(--text-primary)]">
                4. Third-Party Services
              </h2>
              <p>
                We use{" "}
                <strong>Plaid</strong> to securely connect to your financial
                institutions. Plaid accesses your financial data on your behalf
                under their own{" "}
                <a
                  href="https://plaid.com/legal/#end-user-privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--accent-blue)] hover:underline"
                >
                  privacy policy
                </a>
                . We store only the data necessary to display your dashboard.
              </p>
            </section>

            <section>
              <h2 className="mb-2 font-semibold text-[var(--text-primary)]">
                5. Data Sharing
              </h2>
              <p>
                If you use household/group features, your financial data may be
                visible to other members of your group. You control group
                membership and can leave at any time. Share links you create
                allow read-only access to selected data; you can revoke them at
                any time.
              </p>
            </section>

            <section>
              <h2 className="mb-2 font-semibold text-[var(--text-primary)]">
                6. Your Rights
              </h2>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  <strong>Access:</strong> You can view all your data through the
                  dashboard at any time.
                </li>
                <li>
                  <strong>Deletion:</strong> You can delete your account and all
                  associated data from the Profile &amp; Settings page. This
                  action is permanent and irreversible.
                </li>
                <li>
                  <strong>Revocation:</strong> You can disconnect financial
                  institutions and revoke share links at any time.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="mb-2 font-semibold text-[var(--text-primary)]">
                7. Data Retention
              </h2>
              <p>
                We retain your data for as long as your account is active. When
                you delete your account, all associated data — including
                financial accounts, transactions, holdings, snapshots, and
                manual accounts — is permanently deleted. Session data expires
                automatically after 30 days of inactivity.
              </p>
            </section>

            <section>
              <h2 className="mb-2 font-semibold text-[var(--text-primary)]">
                8. Security
              </h2>
              <p>
                We implement industry-standard security measures including
                encrypted data storage, secure session management, multi-factor
                authentication, and security headers (HSTS, CSP). For questions
                or concerns about our security practices, contact us at the
                email below.
              </p>
            </section>

            <section>
              <h2 className="mb-2 font-semibold text-[var(--text-primary)]">
                9. Contact
              </h2>
              <p>
                For privacy-related inquiries, contact us at{" "}
                <strong>justin.k.choo@gmail.com</strong>.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
