/**
 * The terms a buyer agrees to on the booking form, and the `/terms` page that
 * shows them.
 *
 * PLACEHOLDER: sample terms, written to fit the challenge as it runs today and
 * waiting on the real ones. Replace the sections wholesale when they arrive.
 *
 * `TERMS_VERSION` is what a registration records as agreed to, and what
 * `POST /api/register` compares the form's copy against, so a tab opened
 * before the terms changed cannot book under the old ones. Move it on whenever
 * the wording changes; it is also the "last updated" date the page prints.
 */
export const TERMS_VERSION = '2026-10-02'

export const TERMS_PATH = '/terms'

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
