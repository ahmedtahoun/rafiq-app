import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { ChevronIcon, PlusIcon } from '../components/icons';
import { cadenceLabelKey, createTemplate, getTemplates } from '../lib/mockStore';
import { LoadState } from '../components/LoadState';
import { fetchOwnTemplates } from '../lib/templateData';
import { useRemoteSession } from '../lib/remoteSession';
import { useRemoteLoad } from '../store/remoteLoad';
import './Templates.css';

// 1:1 port of Templates.dc.html — the coach's reusable session cadence and
// starter-task sets, applied when a member with a matching specialty and
// plan is added.
//
// Routing uses a route param rather than the prototype's
// setSelectedTemplateId()/getSelectedTemplateId() handoff. That pair exists
// because the design had no way to pass one; this router does
// (nav({ screen, params }), restored by back()), and ClientDetail already
// reads its subject that way. Keeping the id in the route avoids a
// localStorage round-trip and a detail screen that opens on whatever was
// tapped last.
//
// Signed in, the coach's own rows (templateData.ts); signed out, the demo's.
// A real coach's new template is created on Save ('new'), as an offering is;
// the demo still adds a blank one when the button is tapped.
export default function Templates() {
  const t = useT();
  const back = useAppStore((s) => s.back);
  const nav = useAppStore((s) => s.nav);
  const remote = useRemoteSession();
  const load = useRemoteLoad('own_templates', remote, fetchOwnTemplates);

  if (remote && load.status === 'loading') return <LoadState status="loading" />;
  if (remote && load.status === 'error') return <LoadState status="error" onRetry={load.retry} showBack />;
  const templates = remote && load.status === 'ready' ? load.data : getTemplates();

  function open(templateId: string) {
    nav({ screen: 'templateDetail', params: { templateId } });
  }

  return (
    <div className="phone-frame templates">
      <div className="templates-header">
        <button className="templates-back" aria-label={t('back')} onClick={back}>
          <ChevronIcon size={16} />
        </button>
        <div className="templates-title">{t('templatesTitle')}</div>
      </div>

      <p className="templates-intro">{t('templatesIntro')}</p>

      <div className="templates-list">
        {templates.map((tpl) => (
          <button key={tpl.id} type="button" className="templates-row" onClick={() => open(tpl.id)}>
            <div className="templates-row-icon" style={{ background: tpl.bg }}><bdi>{tpl.icon}</bdi></div>
            <div className="templates-row-text">
              <div className="templates-row-name"><bdi>{tpl.name}</bdi></div>
              <div className="templates-row-meta">
                {t('templatesRowMeta', { cadence: t(cadenceLabelKey(tpl.cadence)), count: tpl.tasks.length })}
              </div>
            </div>
            <ChevronIcon size={15} color="var(--ink-soft)" />
          </button>
        ))}

        {templates.length === 0 && (
          <div className="templates-empty">
            <div className="templates-empty-title">{t('templatesNoTemplates')}</div>
            <div className="templates-empty-sub">{t('templatesNoTemplatesSub')}</div>
          </div>
        )}

        <button type="button" className="templates-new" onClick={() => open(remote ? 'new' : createTemplate())}>
          <PlusIcon size={16} color="var(--accent)" />
          {t('templatesNew')}
        </button>
      </div>
    </div>
  );
}
