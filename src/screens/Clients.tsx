import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { useFormat } from '../lib/format';
import { darken } from '../lib/color';
import {
  ArrowForwardIcon,
  CheckCircleIcon,
  ClientsIcon,
  FilterIcon,
  HomeIcon,
  MessageIcon,
  MoonIcon,
  PaymentIcon,
  PersonIcon,
  PlusIcon,
  ScheduleIcon,
  SearchIcon,
  StarIcon,
  SunIcon,
} from '../components/icons';
import { BottomNav, type BottomNavItem } from '../components/BottomNav';
import { QuickActions } from '../components/QuickActions';
import { BottomSheet } from '../components/BottomSheet';
import {
  FREE_MEMBER_CAP,
  getClientDetailHref,
  getClients,
  getFavorites,
  getTasks,
  isTaskOverdue,
  isVerified,
  toggleFavorite,
  type Client,
} from '../lib/mockStore';
import './Clients.css';

type StatusFilter = 'all' | 'active' | 'needs' | 'payment' | 'task' | 'inactive';

function specialtyOf(c: Client): string {
  return c.program.split(' · ')[0];
}

export default function Clients() {
  const t = useT();
  const fmt = useFormat();
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const dark = useAppStore((s) => s.dark);
  const setDark = useAppStore((s) => s.setDark);
  const nav = useAppStore((s) => s.nav);
  const isAr = lang === 'ar';

  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [specialtyFilter, setSpecialtyFilter] = useState('all');
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [, setTick] = useState(0);
  const refresh = () => setTick((v) => v + 1);

  const baseClients = getClients();
  const favorites = getFavorites();
  const isPro = isVerified();

  const activeRoster = baseClients.filter((c) => c.active);
  const statTotal = baseClients.length;
  const statActive = activeRoster.length;
  const statNeeds = baseClients.filter((c) => c.needsCheckin).length;
  const statAvg = activeRoster.length ? Math.round(activeRoster.reduce((sum, c) => sum + c.progress, 0) / activeRoster.length) : 0;

  function overdueTaskOf(id: string) {
    return getTasks(id).find((task) => isTaskOverdue(task)) || null;
  }

  const q = searchQuery.trim().toLowerCase();
  const visible = baseClients.filter((c) => {
    if (filter === 'active' && !c.active) return false;
    if (filter === 'inactive' && c.active) return false;
    if (filter === 'needs' && !c.needsCheckin) return false;
    if (filter === 'payment' && c.paymentStatus === 'paid') return false;
    if (filter === 'task' && !overdueTaskOf(c.id)) return false;
    if (specialtyFilter !== 'all' && specialtyOf(c) !== specialtyFilter) return false;
    if (q && !c.name.toLowerCase().includes(q)) return false;
    return true;
  });

  const circ = 2 * Math.PI * 16;
  const clients = visible.map((c) => {
    const isFav = !!favorites[c.id];
    const progressColor = c.progress >= 70 ? 'var(--green)' : c.progress >= 40 ? 'var(--amber)' : 'var(--red)';

    let statusKind: 'inactive' | 'paymentOverdue' | 'taskOverdue' | 'paymentDue' | null = null;
    if (!c.active) statusKind = 'inactive';
    else if (c.paymentStatus === 'overdue') statusKind = 'paymentOverdue';
    else if (overdueTaskOf(c.id)) statusKind = 'taskOverdue';
    else if (c.paymentStatus === 'due') statusKind = 'paymentDue';

    const statusDefs = {
      inactive: { label: t('clientsStatusInactive'), bg: 'var(--line)', color: 'var(--ink-soft)' },
      paymentOverdue: { label: t('clientsStatusOverdue'), bg: 'var(--red-bg)', color: 'var(--red)' },
      taskOverdue: { label: t('clientsStatusTaskOverdue'), bg: 'var(--amber-bg)', color: 'var(--amber)' },
      paymentDue: { label: t('clientsStatusPaymentDue'), bg: 'var(--amber-bg)', color: 'var(--amber)' },
    } as const;
    const status = statusKind ? statusDefs[statusKind] : null;

    return {
      client: c,
      detailHref: getClientDetailHref(c.id),
      progressLabel: `${c.progress}%`,
      progressColor,
      dash: `${((circ * c.progress) / 100).toFixed(1)} ${circ.toFixed(1)}`,
      avatarGrad: `linear-gradient(135deg, ${c.avatarBg} 0%, ${darken(c.avatarBg, 35)} 100%)`,
      avatarGlow: `${c.avatarBg}66`,
      nextColor: c.nextSessionAtMs != null ? 'var(--accent)' : 'var(--ink-soft)',
      nextText: c.nextSessionAtMs != null
        ? t('clientsNextAt', { session: fmt.nextSession(c.nextSessionAtMs) })
        : c.programCompleted
          ? t('clientsProgramCompleted')
          : t('mainNoSessionNote'),
      isFav,
      status,
      isPaymentStatus: statusKind === 'paymentOverdue' || statusKind === 'paymentDue',
      isTaskStatus: statusKind === 'taskOverdue',
    };
  });

  const statusChipDefs: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: t('clientsChipAll') },
    { key: 'active', label: t('clientsChipActive') },
    { key: 'needs', label: t('clientsChipNeeds') },
    { key: 'payment', label: t('clientsChipPayment') },
    { key: 'task', label: t('clientsChipTask') },
    { key: 'inactive', label: t('clientsChipInactive') },
  ];

  const distinctSpecialties = [...new Set(baseClients.map(specialtyOf))];
  const specialtyChipDefs = [{ key: 'all', label: t('clientsAllSpecialties') }, ...distinctSpecialties.map((label) => ({ key: label, label }))];

  const hasActiveFilters = filter !== 'all' || specialtyFilter !== 'all';
  const showCapBanner = !isPro && statActive >= FREE_MEMBER_CAP;

  const navItems: BottomNavItem[] = [
    { key: 'home', label: t('mainHome'), icon: HomeIcon, screen: 'main' },
    { key: 'clients', label: t('mainClientsNav'), icon: ClientsIcon, screen: 'clients' },
    { key: 'messages', label: t('mainMessagesNav'), icon: MessageIcon, screen: 'messagesInbox' },
    { key: 'quickActions', label: t('quickActionsTitle'), render: () => <QuickActions context="members" /> },
    { key: 'schedule', label: t('mainSchedule'), icon: ScheduleIcon, screen: 'schedule' },
    { key: 'profile', label: t('mainProfileNav'), icon: PersonIcon, screen: 'profile' },
  ];

  return (
    <div className="phone-frame clients-screen">
      <div className="clients-hero">
        <div className="clients-hero-top">
          <div>
            <div className="clients-total-label">{statTotal} {t('clientsTotalWord')}</div>
            <div className="clients-title">{t('clientsTitle')}</div>
          </div>
          <div className="clients-hero-actions">
            <button type="button" className="clients-hero-icon-btn" aria-label={t('switchLanguage')} onClick={() => setLang(isAr ? 'en' : 'ar')}>
              <span className="clients-lang-label">{isAr ? 'EN' : 'ع'}</span>
            </button>
            <button type="button" className="clients-hero-icon-btn" aria-label={t('toggleDarkMode')} onClick={() => setDark(!dark)}>
              {dark ? <SunIcon size={16} color="#FFFFFF" /> : <MoonIcon size={16} color="#FFFFFF" />}
            </button>
            <button type="button" className="clients-add-btn" aria-label={t('clientsAddMember')} onClick={() => nav('addClient')}>
              <PlusIcon size={18} color="var(--accent)" />
            </button>
          </div>
        </div>
      </div>

      <div className="clients-stats">
        <div className="clients-stat">
          <div className="clients-stat-num" style={{ color: 'var(--green)' }}>{statActive}</div>
          <div className="clients-stat-label">{t('clientsActive')}</div>
        </div>
        <div className="clients-stat-divider" />
        <div className="clients-stat">
          <div className="clients-stat-num" style={{ color: 'var(--red)' }}>{statNeeds}</div>
          <div className="clients-stat-label">{t('clientsCheckin')}</div>
        </div>
        <div className="clients-stat-divider" />
        <div className="clients-stat">
          <div className="clients-stat-num" style={{ color: 'var(--accent)' }}>{statAvg}%</div>
          <div className="clients-stat-label">{t('clientsAvgProgress')}</div>
        </div>
      </div>

      {showCapBanner && (
        <button
          type="button"
          className="clients-cap-banner"
          onClick={() => nav('subscription')}
        >
          <CheckCircleIcon size={17} color="var(--accent)" />
          <span>{t('clientsCapBanner', { active: statActive, cap: FREE_MEMBER_CAP })}</span>
          <ArrowForwardIcon size={14} color="var(--accent)" />
        </button>
      )}

      <div className="clients-search-row">
        <div className="clients-search-box">
          <SearchIcon size={16} color="var(--ink-soft)" />
          <input
            type="text"
            placeholder={t('clientsSearchPlaceholder')}
            aria-label={t('clientsSearchMembers')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button type="button" className="clients-search-clear" aria-label={t('clearSearch')} onClick={() => setSearchQuery('')}>
              ×
            </button>
          )}
        </div>
        <button
          type="button"
          className={`clients-filter-btn${hasActiveFilters ? ' has-filters' : ''}`}
          aria-label={t('clientsFilterMembers')}
          onClick={() => setShowFilterSheet(true)}
        >
          <FilterIcon size={18} color={hasActiveFilters ? 'var(--accent)' : 'var(--ink-soft)'} />
          {hasActiveFilters && <span className="clients-filter-dot" />}
        </button>
      </div>

      <div className="clients-list">
        {clients.length > 0 ? (
          clients.map((row) => (
            <div key={row.client.id} className="clients-card">
              <button type="button" className="clients-card-main" onClick={() => nav(row.detailHref)}>
                <div className="clients-avatar" style={{ background: row.avatarGrad, boxShadow: `0 10px 18px -8px ${row.avatarGlow}` }}>
                  {row.client.initials}
                </div>
                <div className="clients-card-text">
                  <div className="clients-card-name">{row.client.name}</div>
                  <div className="clients-card-program" style={{ color: row.client.avatarBg }}>{row.client.program}</div>
                  <div className="clients-card-next" style={{ color: row.nextColor }}>{row.nextText}</div>
                  {row.status && (
                    <div className="clients-status-badge" style={{ background: row.status.bg }}>
                      {row.isPaymentStatus && <PaymentIcon size={9} color={row.status.color} />}
                      {row.isTaskStatus && <CheckCircleIcon size={9} color={row.status.color} />}
                      <span style={{ color: row.status.color }}>{row.status.label}</span>
                    </div>
                  )}
                </div>
              </button>
              <div className="clients-card-side">
                <button
                  type="button"
                  className="clients-fav-btn"
                  aria-label={t('clientsToggleFavourite', { name: row.client.name })}
                  onClick={() => {
                    toggleFavorite(row.client.id);
                    refresh();
                  }}
                >
                  <StarIcon size={12} color={row.isFav ? 'var(--accent)' : 'var(--ink-soft)'} filled={row.isFav} />
                </button>
                <button type="button" className="clients-progress-ring" aria-label={t('clientsViewProgress', { name: row.client.name })} onClick={() => nav(row.detailHref)}>
                  <svg width="40" height="40" viewBox="0 0 40 40" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx="20" cy="20" r="16" fill="none" stroke="var(--line)" strokeWidth="4" />
                    <circle cx="20" cy="20" r="16" fill="none" stroke={row.progressColor} strokeWidth="4" strokeLinecap="round" strokeDasharray={row.dash} />
                  </svg>
                  <span className="clients-progress-num" style={{ color: row.progressColor }}>{row.progressLabel}</span>
                </button>
              </div>
              <QuickActions context="member" memberId={row.client.id} variant="compact" />
            </div>
          ))
        ) : (
          <div className="clients-empty">
            <div className="clients-empty-icon">
              <SearchIcon size={24} color="var(--ink-soft)" />
            </div>
            <div className="clients-empty-title">{t('clientsNoResultsTitle')}</div>
            <div className="clients-empty-sub">{t('clientsNoResultsSub')}</div>
          </div>
        )}
      </div>

      <BottomNav items={navItems} />

      <BottomSheet open={showFilterSheet} onClose={() => setShowFilterSheet(false)} title={t('clientsFilterTitle')}>
        <div className="clients-filter-group">
          <div className="clients-filter-group-label">{t('clientsStatusLabel')}</div>
          <div className="clients-chip-wrap">
            {statusChipDefs.map((d) => (
              <button
                key={d.key}
                type="button"
                className={`clients-chip${filter === d.key ? ' is-selected' : ''}`}
                onClick={() => setFilter(d.key)}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <div className="clients-filter-group">
          <div className="clients-filter-group-label">{t('clientsSpecialtyLabel')}</div>
          <div className="clients-chip-wrap">
            {specialtyChipDefs.map((d) => (
              <button
                key={d.key}
                type="button"
                className={`clients-chip clients-chip-outline${specialtyFilter === d.key ? ' is-selected' : ''}`}
                onClick={() => setSpecialtyFilter(d.key)}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <div className="clients-filter-actions">
          <button
            type="button"
            className="clients-filter-clear"
            onClick={() => {
              setFilter('all');
              setSpecialtyFilter('all');
            }}
          >
            {t('clientsClearAll')}
          </button>
          <button type="button" className="clients-filter-apply" onClick={() => setShowFilterSheet(false)}>
            {t('clientsShowResults')}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
