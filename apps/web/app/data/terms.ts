/**
 * The terms a buyer agrees to on the booking form, and the `/terms` page that
 * shows them.
 *
 * These points and the "what ticking means" clause are the whole of the terms.
 *
 * `TERMS_VERSION` is what a registration records as agreed to, and what
 * `POST /api/register` compares the form's copy against, so a tab opened
 * before the terms changed cannot book under the old ones. Move it on whenever
 * the wording changes. It is not printed: the page and the modal show no
 * "last updated" date.
 */
export const TERMS_VERSION = '2026-10-02.2'

export const TERMS_PATH = '/terms'

export interface TermsPoint {
  /** Bold lead-in. `text` follows it after a space, so it reads on either way. */
  title: string
  text: string
}

export const TERMS_POINTS: TermsPoint[] = [
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
