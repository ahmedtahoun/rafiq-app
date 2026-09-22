import { PolicyPage } from '../components/PolicyPage';

// The member-facing terms, over the same shared PolicyPage body.
//
// The Cancellations section names the 12-hour grace window, which the
// design's copy left as "your pro's specific policy, shared with you
// directly" — the app enforces a real one (cancelBooking forfeits a
// credit inside it), so the terms say what it is.
export default function ClientTermsOfService() {
  return (
    <PolicyPage
      titleKey="clientTermsTitle"
      updatedKey="clientTermsUpdated"
      sectionPrefix="clientTermsSection"
      sectionCount={6}
    />
  );
}
