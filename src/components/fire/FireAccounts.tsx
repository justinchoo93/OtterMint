"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Card, CardHeader, cx } from "@/components/ui";
import { formatWholeCurrency } from "@/lib/format";
import {
  FIRE_KINDS,
  KIND_LABELS,
  KIND_OPENS,
  type FireAccountKind,
  type FireAppAccount,
  type FireAppAccountChoice,
  type FireOwner,
  type FirePlan,
  type FireTypedAccount,
} from "@/lib/fire-model";
import { NumberField } from "./NumberField";

const ROW = "grid grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1.6fr)_140px_140px_44px] items-center gap-3";
const SELECT =
  "h-11 w-full min-w-0 rounded-control border border-line bg-surface-raised px-2 text-caption text-ink outline-none focus:border-chart-muted sm:h-10";
const MAX_MONEY = 100_000_000;

function opensText(kind: FireAccountKind, owner: FireOwner): string {
  if (kind === "excluded") return "—";
  if (kind === "k457") return owner === "you" ? "When you leave the job" : "When your partner leaves the job";
  return KIND_OPENS[kind];
}

function OwnerSelect({ value, onChange, label }: { value: FireOwner; onChange: (owner: FireOwner) => void; label: string }) {
  return (
    <select aria-label={label} className={SELECT} value={value} onChange={(e) => onChange(e.target.value as FireOwner)}>
      <option value="you">You</option>
      <option value="partner">Partner</option>
    </select>
  );
}

function KindSelect({
  value,
  onChange,
  label,
  allowExcluded,
}: {
  value: FireAccountKind;
  onChange: (kind: FireAccountKind) => void;
  label: string;
  allowExcluded: boolean;
}) {
  const kinds: FireAccountKind[] = allowExcluded ? [...FIRE_KINDS, "excluded"] : [...FIRE_KINDS];
  return (
    <select aria-label={label} className={SELECT} value={value} onChange={(e) => onChange(e.target.value as FireAccountKind)}>
      {kinds.map((kind) => (
        <option key={kind} value={kind}>
          {KIND_LABELS[kind]}
        </option>
      ))}
    </select>
  );
}

/** Keeps what the user typed; commits only a non-empty name. */
function NameInput({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const [text, setText] = useState(value);
  return (
    <input
      aria-label="Account name"
      className={cx(SELECT, "px-3 text-sm font-medium")}
      value={text}
      maxLength={200}
      onChange={(e) => {
        setText(e.target.value);
        if (e.target.value.trim()) onChange(e.target.value.trim());
      }}
      onBlur={() => {
        if (!text.trim()) setText(value);
      }}
    />
  );
}

interface FireAccountsProps {
  accounts: FireAppAccount[];
  plan: FirePlan;
  cashSavedYearly: number;
  onAppChoice: (key: string, patch: FireAppAccountChoice) => void;
  onTypedChange: (id: string, patch: Partial<FireTypedAccount>) => void;
  onTypedRemove: (id: string) => void;
  onTypedAdd: () => void;
}

/** OtterMint's accounts (balances read-only) and the accounts typed here, which never touch real accounts. */
export function FireAccounts({ accounts, plan, cashSavedYearly, onAppChoice, onTypedChange, onTypedRemove, onTypedAdd }: FireAccountsProps) {
  const appRows = accounts.map((account) => {
    const choice = plan.appAccounts[account.key] ?? {};
    return {
      account,
      kind: choice.kind ?? account.suggestedKind,
      owner: choice.owner ?? ("you" as FireOwner),
      contribution: choice.contributionYearly ?? 0,
    };
  });
  const countedApp = appRows.filter((row) => row.kind !== "excluded");
  const totalBalance =
    countedApp.reduce((s, row) => s + row.account.balance, 0) + plan.typedAccounts.reduce((s, a) => s + a.balance, 0);
  const totalContribution =
    countedApp.reduce((s, row) => s + row.contribution, 0) + plan.typedAccounts.reduce((s, a) => s + a.contributionYearly, 0);

  return (
    <Card aria-label="Accounts">
      <CardHeader
        title="Accounts"
        subtitle="Balances from OtterMint update on their own. Add the ones it can't see; nothing here changes your real accounts."
        actions={
          <Button icon={<Plus aria-hidden className="h-4 w-4" />} onClick={onTypedAdd}>
            Add an account
          </Button>
        }
      />
      <div className="mt-5 overflow-x-auto">
        <div className="min-w-[920px]">
          <div className={cx(ROW, "border-b border-line px-2 pb-2 text-micro font-medium text-ink-muted")}>
            <span>Account</span>
            <span>Whose</span>
            <span>Type</span>
            <span>Can use it</span>
            <span className="text-right">Balance</span>
            <span className="text-right">Added per year</span>
            <span />
          </div>
          {appRows.map(({ account, kind, owner, contribution }) => (
            <div key={account.key} className={cx(ROW, "min-h-14 border-b border-line-subtle px-2 py-1.5")} data-testid="fire-app-account">
              <div className={cx("flex min-w-0 flex-col", kind === "excluded" && "opacity-60")}>
                <span className="truncate text-sm font-medium text-ink">{account.name}</span>
                <span className="truncate text-micro text-accent">From OtterMint · {account.detail}</span>
              </div>
              <OwnerSelect label={`${account.name} owner`} value={owner} onChange={(o) => onAppChoice(account.key, { owner: o })} />
              <KindSelect label={`${account.name} type`} value={kind} allowExcluded onChange={(k) => onAppChoice(account.key, { kind: k })} />
              <span className="text-caption text-ink-secondary">{opensText(kind, owner)}</span>
              <span className={cx("pr-3 text-right font-mono text-caption text-ink", kind === "excluded" && "opacity-60")}>
                {formatWholeCurrency(account.balance)}
              </span>
              <NumberField
                label={`${account.name} added per year`}
                hideLabel
                prefix="$"
                value={contribution}
                min={0}
                max={MAX_MONEY}
                disabled={kind === "excluded"}
                onChange={(value) => onAppChoice(account.key, { contributionYearly: value })}
              />
              <span />
            </div>
          ))}
          {plan.typedAccounts.map((typed) => (
            <div key={typed.id} className={cx(ROW, "min-h-14 border-b border-line-subtle px-2 py-1.5")} data-testid="fire-typed-account">
              <div className="flex min-w-0 flex-col gap-0.5">
                <NameInput value={typed.name} onChange={(name) => onTypedChange(typed.id, { name })} />
                <span className="text-micro text-ink-muted">Entered by you</span>
              </div>
              <OwnerSelect label={`${typed.name} owner`} value={typed.owner} onChange={(owner) => onTypedChange(typed.id, { owner })} />
              <KindSelect
                label={`${typed.name} type`}
                value={typed.kind}
                allowExcluded={false}
                onChange={(kind) => onTypedChange(typed.id, { kind: kind === "excluded" ? typed.kind : kind })}
              />
              <span className="text-caption text-ink-secondary">{opensText(typed.kind, typed.owner)}</span>
              <NumberField
                label={`${typed.name} balance`}
                hideLabel
                prefix="$"
                value={typed.balance}
                min={0}
                max={MAX_MONEY}
                onChange={(balance) => onTypedChange(typed.id, { balance })}
              />
              <NumberField
                label={`${typed.name} added per year`}
                hideLabel
                prefix="$"
                value={typed.contributionYearly}
                min={0}
                max={MAX_MONEY}
                onChange={(contributionYearly) => onTypedChange(typed.id, { contributionYearly })}
              />
              <Button variant="ghost" iconOnly aria-label={`Remove ${typed.name}`} icon={<Trash2 aria-hidden className="h-4 w-4" />} onClick={() => onTypedRemove(typed.id)} />
            </div>
          ))}
          <div className={cx(ROW, "px-2 pt-3 text-caption font-semibold text-ink")}>
            <span>Counted</span>
            <span />
            <span />
            <span />
            <span className="pr-3 text-right font-mono">{formatWholeCurrency(totalBalance)}</span>
            <span className="pr-3 text-right font-mono">{formatWholeCurrency(totalContribution)}</span>
            <span />
          </div>
        </div>
      </div>
      <p className="mt-3 text-micro text-ink-muted">
        Plus {formatWholeCurrency(cashSavedYearly)} a year of cash saved from pay while you both work, invested as &ldquo;New savings&rdquo;.
      </p>
    </Card>
  );
}
