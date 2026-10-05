import { PolicyPage } from '../components/PolicyPage';
import { POLICY_SECTION_COUNT } from '../components/policySections';

// 1:1 port of CoachPrivacyPolicy.dc.html — six heading/body sections over
// the shared PolicyPage body.
export default function CoachPrivacyPolicy() {
  return (
    <PolicyPage
      titleKey="privacyTitle"
      updatedKey="privacyUpdated"
      sectionPrefix="privacySection"
      sectionCount={POLICY_SECTION_COUNT.privacySection}
    />
  );
}
