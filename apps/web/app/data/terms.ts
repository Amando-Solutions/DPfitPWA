/**
 * The terms a buyer agrees to on the booking form, and the `/terms` page that
 * shows them.
 *
 * The short version and the "what ticking means" clause are the real wording.
 * `TERMS_SECTIONS` is still PLACEHOLDER: sample terms waiting on the full
 * ones, which the short version's section numbers point into. Replace the
 * sections wholesale when they arrive.
 *
 * `TERMS_VERSION` is what a registration records as agreed to, and what
 * `POST /api/register` compares the form's copy against, so a tab opened
 * before the terms changed cannot book under the old ones. Move it on whenever
 * the wording changes. It is not printed: the page and the modal show no
 * "last updated" date.
 */
export const TERMS_VERSION = '2026-10-02.2'

export const TERMS_PATH = '/terms'

export interface SummaryPoint {
  /** Bold lead-in. `text` follows it after a space, so it reads on either way. */
  title: string
  text: string
}

export const TERMS_SUMMARY_NOTE =
  'This summary is for convenience only. If it differs from the full Terms below, the full Terms apply.'

export const TERMS_SUMMARY: SummaryPoint[] = [
  { title: 'Who can join?', text: "You must be 18 or older and confirm you're healthy enough to train, or provide written clearance from a doctor." },
  { title: 'Training carries real risks.', text: 'Use the form videos and the Progressive Overload Guide, listen to your body, and stop if you feel unusual pain.' },
  { title: 'Liability.', text: 'We are not liable for injury from taking part, except where the law says we must be (see Section 5).' },
  { title: 'Not medical advice.', text: 'This is coaching. Food targets are estimates, and your results depend on your consistency.' },
  { title: 'Your photos are private.', text: 'Only you and your coach see them in the app.' },
  {
    title: 'Marketing use.',
    text: 'By agreeing to the Terms, you allow Dayo Pius to use your before and after photos and results to promote her coaching, always with your face blurred. You can say no at any time by emailing hi@dayopius.com, and it does not affect your place in the Challenge. A photo already posted will be removed within 7 days.',
  },
  { title: 'Access codes.', text: "Your code is sent on the onboarding date in your reservation email. It is single-use and can't be transferred." },
  { title: 'Refunds.', text: 'All payments are final. Refunds are not available, before or after your access code is sent.' },
  {
    title: 'If we cancel or reschedule.',
    text: 'If we cancel the Challenge, or move the start date by more than 7 days, you may take a place on the next cohort date. Refunds are not available.',
  },
  { title: 'Log honestly.', text: 'Points and badges have no cash value.' },
  { title: 'Live calls', text: 'are recorded and shared in the group chat for your cohort only.' },
  { title: 'Our content is for you alone.', text: "Don't copy, record, share or resell the program, guides or videos." },
  { title: 'Be respectful', text: 'in the group chat and live calls. Harassment means removal without a refund.' },
  { title: 'These terms stay put.', text: "The terms you accept apply for your whole Challenge. We'll email you if anything has to change." },
]

/** What the box on the booking form commits somebody to. */
export interface BoxClause {
  id: string
  title: string
  lead: string
  points: string[]
}

export const TERMS_CLAUSE: BoxClause = {
  id: 'terms-agreement',
  title: 'What ticking "I have read and agree to the Terms" means',
  lead: 'By ticking that box, you confirm all of the following:',
  points: [
    'My health declaration is true (Section 2).',
    'I understand the risks and accept the waiver in Sections 3 and 5.',
    'I consent to my health data and photos being stored (Section 14).',
    'I allow Dayo Pius to use my before and after photos and results to promote her coaching, always with my face blurred (Section 8).',
  ],
}

export interface TermsSection {
  title: string
  paragraphs: string[]
}

export const TERMS_SECTIONS: TermsSection[] = [
  {
    title: 'About these terms',
    paragraphs: [
      'These terms apply when you book a slot in a DP Fitness challenge. By ticking the box on the booking form and completing payment, you agree to them. If you do not agree, please do not book.',
    ],
  },
  {
    title: 'The challenge',
    paragraphs: [
      'The challenge is a group coaching program that runs in the DP Fitness app for the length of your cohort. It includes a training program, nutrition guidance, weekly check-ins, live group calls and a private community chat.',
      'It is not one-on-one coaching. We may adjust the program, the call schedule or the app where we reasonably need to, and will tell you about any change that affects you.',
    ],
  },
  {
    title: 'Your health',
    paragraphs: [
      'The program is general fitness and nutrition guidance. It is not medical advice and does not replace it. Check with a doctor before starting if you are pregnant, injured, or have any health condition.',
      'You train at your own risk and are responsible for using safe form, choosing suitable weights and stopping if you feel pain, dizziness or discomfort.',
    ],
  },
  {
    title: 'Booking and payment',
    paragraphs: [
      'Payment is taken by Selar, a third-party payment platform, and is subject to its own terms. The price is shown on this site before you pay; Selar may convert it into your local currency.',
      'Your slot is confirmed once your payment has been received. During a pre-order, your access code is held and sent when enrolment closes.',
    ],
  },
  {
    title: 'Access',
    paragraphs: [
      'Your access code is sent to the email address you give us. It is personal to you and may not be shared, transferred or resold. We may suspend access that has been shared.',
      'App access lasts for the length of your cohort.',
    ],
  },
  {
    title: 'Refunds',
    paragraphs: [
      'Your slot, app access and coaching time are reserved for you from the start. Once the cohort has started and you have received your access code, refunds are not available. If something changes before the cohort starts, contact us and we will do our best to help.',
    ],
  },
  {
    title: 'Community',
    paragraphs: [
      'Be respectful in the group chat and on calls. Do not share other members’ photos, messages or personal details outside the group. We may remove anyone who harasses or endangers other members, without a refund.',
    ],
  },
  {
    title: 'Our content',
    paragraphs: [
      'The program, videos, guides and other materials are for your personal use during the challenge. Please do not copy, publish or redistribute them.',
    ],
  },
  {
    title: 'Results',
    paragraphs: [
      'Results vary from person to person and depend on consistency with training and nutrition. Results shared on this site are individual experiences, not a promise of what you will achieve.',
    ],
  },
  {
    title: 'Your information',
    paragraphs: [
      'We use your name, email address, WhatsApp number and timezone to run the challenge and to contact you about it. We do not sell your details.',
    ],
  },
  {
    title: 'Liability',
    paragraphs: [
      'As far as the law allows, DP Fitness is not liable for any injury, loss or damage arising from your participation in the challenge, except where it is caused by our own negligence. Nothing in these terms limits a right you have by law.',
    ],
  },
  {
    title: 'Changes to these terms',
    paragraphs: [
      'We may update these terms from time to time. The version you agreed to when you booked applies to that booking.',
    ],
  },
]
