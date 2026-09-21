import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { ChevronIcon, PlusIcon } from '../components/icons';
import { cadenceLabelKey, createTemplate, getTemplates } from '../lib/mockStore';
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
export default function Templates() {
  const t = useT();
  const back = useAppStore((s) => s.back);
  const nav = useAppStore((s) => s.nav);

  const templates = getTemplates();

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
            <div className="templates-row-icon" style={{ background: tpl.bg }}>{tpl.icon}</div>
            <div className="templates-row-text">
              <div className="templates-row-name">{tpl.name}</div>
              <div className="templates-row-meta">
                {t('templatesRowMeta', { cadence: t(cadenceLabelKey(tpl.cadence)), count: tpl.tasks.length })}
              </div>
            </div>
            <ChevronIcon size={15} color="var(--ink-soft)" />
          </button>
        ))}

        <button type="button" className="templates-new" onClick={() => open(createTemplate())}>
          <PlusIcon size={16} color="var(--accent)" />
          {t('templatesNew')}
        </button>
      </div>
    </div>
  );
}
