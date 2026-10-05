import { PolicyPage, POLICY_SECTION_COUNT } from '../components/PolicyPage';
import { NotTherapySection } from '../components/NotTherapySection';

// 1:1 port of CoachTermsOfService.dc.html — same shape as the privacy
// policy, different copy.
// The last block is "Coaching is not therapy" plus the crisis lines: a
// coach needs to know where to send a member, not only that coaching is
// not treatment.
export default function CoachTermsOfService() {
  return (
    <PolicyPage
      titleKey="termsTitle"
      updatedKey="termsUpdated"
      sectionPrefix="termsSection"
      sectionCount={POLICY_SECTION_COUNT.termsSection}
      footer={<NotTherapySection bodyKey="termsNotTherapyBody" />}
    />
  );
}
