import { useEffect, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { isolate, useT, type Lang, type MessageKey } from '../lib/i18n';
import { useRemoteSession } from '../lib/remoteSession';
import { ChevronIcon, CheckIcon } from '../components/icons';
import { Button } from '../components/Button';
import { LoadState } from '../components/LoadState';
import { PAYMOB_BANKS } from '../lib/paymobBanks';
import { fetchOwnPayoutAccount, saveOwnPayoutAccount, type PayoutAccountSummary } from '../lib/payoutData';
import {
  validatePayoutAccount,
  WALLET_ISSUERS,
  type PayoutAccountForm,
  type PayoutErrors,
  type PayoutField,
  type PayoutIssuer,
  type PayoutMethod,
  type WalletIssuer,
} from '../lib/payoutAccount';
import './PayoutAccount.css';

const ISSUER_LABEL: Record<WalletIssuer, MessageKey> = {
  vodafone: 'payoutIssuerVodafone',
  etisalat: 'payoutIssuerEtisalat',
  orange: 'payoutIssuerOrange',
  bank_wallet: 'payoutIssuerBankWallet',
};

const MASK = '••••';

/**
 * Where the coach's earnings are paid out to (coach_payout_accounts, 0007).
 * Real data only: signed out there is nothing to show and nowhere to save,
 * so it says so rather than falling back to mockStore like other screens.
 *
 * Once saved, the national ID and account/wallet number are only ever shown
 * as their last four digits — payoutData.ts never hands the screen more —
 * so changing either means typing it in full again.
 */
export default function PayoutAccount() {
  const remote = useRemoteSession();
  return remote ? <RemotePayoutAccount /> : <SignedOut />;
}

function Header() {
  const t = useT();
  const back = useAppStore((s) => s.back);
  return (
    <div className="payout-header">
      <button type="button" className="payout-back" aria-label={t('back')} onClick={back}>
        <ChevronIcon size={16} />
      </button>
      <h1 className="payout-title">{t('payoutAccountTitle')}</h1>
    </div>
  );
}

function SignedOut() {
  const t = useT();
  return (
    <div className="phone-frame payout-screen">
      <Header />
      <div className="payout-body">
        <div className="payout-card payout-signed-out">
          <div className="payout-card-title">{t('payoutSignedOutTitle')}</div>
          <p className="payout-note">{t('payoutSignedOutBody')}</p>
        </div>
      </div>
    </div>
  );
}

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; account: PayoutAccountSummary | null };

function RemotePayoutAccount() {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    void fetchOwnPayoutAccount().then((result) => {
      if (!live) return;
      setLoad(result.ok ? { status: 'ready', account: result.data } : { status: 'error' });
    });
    return () => {
      live = false;
    };
  }, [attempt]);

  if (load.status === 'loading') return <LoadState status="loading" />;
  if (load.status === 'error') {
    return (
      <LoadState
        status="error"
        showBack
        onRetry={() => {
          setLoad({ status: 'loading' });
          setAttempt((n) => n + 1);
        }}
      />
    );
  }
  return <PayoutAccountView initial={load.account} />;
}

function PayoutAccountView({ initial }: { initial: PayoutAccountSummary | null }) {
  const t = useT();
  const [account, setAccount] = useState(initial);
  const [editing, setEditing] = useState(initial === null);
  const [justSaved, setJustSaved] = useState(false);

  return (
    <div className="phone-frame payout-screen">
      <Header />
      <div className="payout-body">
        <p className="payout-note">{t('payoutIntro')}</p>
        {editing || !account ? (
          <PayoutForm
            saved={account}
            onCancel={account ? () => setEditing(false) : undefined}
            onSaved={(summary) => {
              setAccount(summary);
              setEditing(false);
              setJustSaved(true);
            }}
          />
        ) : (
          <SavedAccount
            account={account}
            justSaved={justSaved}
            onChange={() => {
              setJustSaved(false);
              setEditing(true);
            }}
          />
        )}
        <p className="payout-note payout-privacy">{t('payoutPrivacyNote')}</p>
      </div>
    </div>
  );
}

function methodLabel(t: ReturnType<typeof useT>, lang: Lang, issuer: PayoutIssuer, bankCode: string | null): string {
  if (issuer !== 'instant_bank') return t(ISSUER_LABEL[issuer]);
  const bank = PAYMOB_BANKS.find((b) => b.code === bankCode);
  return bank ? bank[lang] : (bankCode ?? t('payoutMethodBank'));
}

function SavedAccount({ account, justSaved, onChange }: { account: PayoutAccountSummary; justSaved: boolean; onChange: () => void }) {
  const t = useT();
  const lang = useAppStore((s) => s.lang);

  return (
    <div className="payout-card" data-testid="payout-saved">
      {justSaved && (
        <div className="payout-saved-banner" role="status">
          <CheckIcon size={13} />
          {t('payoutSaved')}
        </div>
      )}
      <dl className="payout-summary">
        <div className="payout-summary-row">
          <dt>{t('payoutSavedMethod')}</dt>
          <dd>{methodLabel(t, lang, account.issuer, account.bankCode)}</dd>
        </div>
        <div className="payout-summary-row">
          <dt>{t('payoutSavedNumber')}</dt>
          <dd>{t('payoutEndsIn', { last4: isolate(`${MASK} ${account.destinationLast4}`) })}</dd>
        </div>
        <div className="payout-summary-row">
          <dt>{t('payoutSavedName')}</dt>
          <dd>
            <bdi>{account.fullName}</bdi>
          </dd>
        </div>
        <div className="payout-summary-row">
          <dt>{t('payoutSavedNationalId')}</dt>
          <dd>{t('payoutEndsIn', { last4: isolate(`${MASK} ${account.nationalIdLast4}`) })}</dd>
        </div>
      </dl>
      <Button variant="secondary" onClick={onChange}>
        {t('payoutChange')}
      </Button>
    </div>
  );
}

function PayoutForm({
  saved,
  onCancel,
  onSaved,
}: {
  saved: PayoutAccountSummary | null;
  onCancel?: () => void;
  onSaved: (summary: PayoutAccountSummary) => void;
}) {
  const t = useT();
  const lang = useAppStore((s) => s.lang);

  // The sensitive fields always start empty: the saved values aren't here
  // to prefill them with, only their last four digits.
  const [form, setForm] = useState<PayoutAccountForm>(() => ({
    method: saved?.issuer === 'instant_bank' ? 'bank' : 'wallet',
    walletIssuer: saved && saved.issuer !== 'instant_bank' ? saved.issuer : 'vodafone',
    msisdn: '',
    bankCode: saved?.bankCode ?? '',
    accountNumber: '',
    fullName: saved?.fullName ?? '',
    nationalId: '',
  }));
  const [errors, setErrors] = useState<PayoutErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  // A saved destination of the same kind is the one this field replaces.
  const savedSameKind = saved && (saved.issuer === 'instant_bank') === (form.method === 'bank');
  const reenter = (last4: string) => t('payoutReenterHint', { last4: isolate(`${MASK} ${last4}`) });

  function set<K extends keyof PayoutAccountForm>(key: K, value: PayoutAccountForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (key in errors) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function submit() {
    if (saving) return;
    const result = validatePayoutAccount(form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    setSaveFailed(false);
    void saveOwnPayoutAccount(result.row).then((saveResult) => {
      setSaving(false);
      if (saveResult.ok) onSaved(saveResult.data);
      else setSaveFailed(true);
    });
  }

  const fieldProps = (field: PayoutField) => ({
    id: `payout-${field}`,
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': `payout-${field}-hint`,
  });

  const hint = (field: PayoutField, text: string) => (
    <div id={`payout-${field}-hint`} className={errors[field] ? 'payout-field-error' : 'payout-field-hint'} role={errors[field] ? 'alert' : undefined}>
      {errors[field] ? t(errors[field]) : text}
    </div>
  );

  const methods: { key: PayoutMethod; label: MessageKey }[] = [
    { key: 'wallet', label: 'payoutMethodWallet' },
    { key: 'bank', label: 'payoutMethodBank' },
  ];

  return (
    <form
      className="payout-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {saveFailed && (
        <div className="payout-save-error" role="alert">
          {t('payoutSaveFailed')}
        </div>
      )}

      <fieldset className="payout-field">
        <legend className="payout-label">{t('payoutMethodLabel')}</legend>
        <div className="payout-segment" role="radiogroup">
          {methods.map((m) => (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={form.method === m.key}
              className={`payout-segment-btn${form.method === m.key ? ' is-selected' : ''}`}
              onClick={() => set('method', m.key)}
            >
              {t(m.label)}
            </button>
          ))}
        </div>
      </fieldset>

      {form.method === 'wallet' ? (
        <>
          <fieldset className="payout-field">
            <legend className="payout-label">{t('payoutIssuerLabel')}</legend>
            <div className="payout-chips" role="radiogroup">
              {WALLET_ISSUERS.map((issuer) => (
                <button
                  key={issuer}
                  type="button"
                  role="radio"
                  aria-checked={form.walletIssuer === issuer}
                  className={`payout-chip${form.walletIssuer === issuer ? ' is-selected' : ''}`}
                  onClick={() => set('walletIssuer', issuer)}
                >
                  {t(ISSUER_LABEL[issuer])}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="payout-field">
            <label className="payout-label" htmlFor="payout-msisdn">
              {t('payoutMsisdnLabel')}
            </label>
            <input
              {...fieldProps('msisdn')}
              className="payout-input payout-input-ltr"
              type="text"
              inputMode="tel"
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              placeholder="01X XXXX XXXX"
              value={form.msisdn}
              onChange={(e) => set('msisdn', e.target.value)}
            />
            {hint('msisdn', savedSameKind && saved ? reenter(saved.destinationLast4) : t('payoutMsisdnHint'))}
          </div>
        </>
      ) : (
        <>
          <div className="payout-field">
            <label className="payout-label" htmlFor="payout-bankCode">
              {t('payoutBankLabel')}
            </label>
            <select {...fieldProps('bankCode')} className="payout-input payout-select" value={form.bankCode} onChange={(e) => set('bankCode', e.target.value)}>
              <option value="">{t('payoutBankPlaceholder')}</option>
              {PAYMOB_BANKS.map((b) => (
                <option key={b.code} value={b.code}>
                  {b[lang]}
                </option>
              ))}
            </select>
            {errors.bankCode && hint('bankCode', '')}
          </div>
          <div className="payout-field">
            <label className="payout-label" htmlFor="payout-accountNumber">
              {t('payoutAccountNumberLabel')}
            </label>
            <input
              {...fieldProps('accountNumber')}
              className="payout-input payout-input-ltr"
              type="text"
              dir="ltr"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              value={form.accountNumber}
              onChange={(e) => set('accountNumber', e.target.value)}
            />
            {hint('accountNumber', savedSameKind && saved ? reenter(saved.destinationLast4) : t('payoutAccountNumberHint'))}
          </div>
        </>
      )}

      <div className="payout-field">
        <label className="payout-label" htmlFor="payout-fullName">
          {t('payoutFullNameLabel')}
        </label>
        <input
          {...fieldProps('fullName')}
          className="payout-input"
          type="text"
          dir="auto"
          autoComplete="name"
          value={form.fullName}
          onChange={(e) => set('fullName', e.target.value)}
        />
        {hint('fullName', t('payoutFullNameHint'))}
      </div>

      <div className="payout-field">
        <label className="payout-label" htmlFor="payout-nationalId">
          {t('payoutNationalIdLabel')}
        </label>
        <input
          {...fieldProps('nationalId')}
          className="payout-input payout-input-ltr"
          type="text"
          inputMode="numeric"
          dir="ltr"
          autoComplete="off"
          spellCheck={false}
          value={form.nationalId}
          onChange={(e) => set('nationalId', e.target.value)}
        />
        {hint('nationalId', saved ? reenter(saved.nationalIdLast4) : t('payoutNationalIdHint'))}
      </div>

      <Button type="submit" disabled={saving}>
        {saving ? t('payoutSaving') : t('payoutSave')}
      </Button>
      {onCancel && (
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          {t('payoutCancelEdit')}
        </Button>
      )}
    </form>
  );
}
