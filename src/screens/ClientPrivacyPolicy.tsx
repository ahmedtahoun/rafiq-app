import { PolicyPage } from '../components/PolicyPage';

// The member-facing privacy policy, over the same shared PolicyPage body
// the coach-side pair already uses.
//
// Its Messaging section deliberately does NOT match the design prototype.
// That copy said conversations happen over WhatsApp and are governed by
// WhatsApp's privacy policy; in-app messaging has since shipped, so
// messages are stored by Rafiq and covered by this policy. A privacy
// policy that misstates where a member's messages go is not a copy nit,
// so it describes what the app actually does. See WORK-SPLIT: the
// coach-side equivalent still carries the original claim.
export default function ClientPrivacyPolicy() {
  return (
    <PolicyPage
      titleKey="clientPrivacyTitle"
      updatedKey="clientPrivacyUpdated"
      sectionPrefix="clientPrivacySection"
      sectionCount={6}
    />
  );
}
