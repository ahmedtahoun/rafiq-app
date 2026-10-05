import { PolicyPage, POLICY_SECTION_COUNT } from '../components/PolicyPage';
import { NotTherapySection } from '../components/NotTherapySection';

// The member-facing terms, over the same shared PolicyPage body.
//
// The Cancellations section names the 12-hour grace window, which the
// design's copy left as "your pro's specific policy, shared with you
// directly" — the app enforces a real one (cancelBooking forfeits a
// credit inside it), so the terms say what it is.
// The last block is "Coaching is not therapy" plus the crisis lines,
// which is the point of putting them in the terms at all: this is a page a
// member can reach without a coach, a session, or a conversation.
export default function ClientTermsOfService() {
  return (
    <PolicyPage
      titleKey="clientTermsTitle"
      updatedKey="clientTermsUpdated"
      sectionPrefix="clientTermsSection"
      sectionCount={POLICY_SECTION_COUNT.clientTermsSection}
      footer={<NotTherapySection bodyKey="clientTermsNotTherapyBody" />}
    />
  );
}
