import { PolicyPage } from '../components/PolicyPage';

// 1:1 port of CoachTermsOfService.dc.html — same shape as the privacy
// policy, different copy.
export default function CoachTermsOfService() {
  return (
    <PolicyPage
      titleKey="termsTitle"
      updatedKey="termsUpdated"
      sectionPrefix="termsSection"
      sectionCount={6}
    />
  );
}
