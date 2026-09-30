import { PolicyPage } from '../components/PolicyPage';
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
      sectionCount={6}
      footer={<NotTherapySection bodyKey="termsNotTherapyBody" />}
    />
  );
}
