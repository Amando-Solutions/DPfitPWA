/**
 * The terms a buyer agrees to on the booking form, and the `/terms` page that
 * shows them.
 *
 * `TERMS_SECTIONS` is the full Terms, Version 1.0 of 2 October 2026, word for
 * word. The document's short version is left out on purpose: the page shows
 * only the full Terms.
 *
 * `TERMS_VERSION` is what a registration records as agreed to, and what
 * `POST /api/register` compares the form's copy against, so a tab opened
 * before the terms changed cannot book under the old ones. Move it on whenever
 * the wording changes. It is not printed: the page and the modal show no
 * "last updated" date.
 */
export const TERMS_VERSION = '2026-10-03'

export const TERMS_PATH = '/terms'

/** A paragraph or list item. `lead` is a bold lead-in that `text` follows after a space. */
export interface TermsLine {
  lead?: string
  text: string
}

export interface TermsParagraph extends TermsLine {
  /** The whole paragraph in bold: the waiver, which has to stand out. */
  strong?: boolean
}

export interface TermsList {
  items: TermsLine[]
}

export interface TermsSection {
  /** Numbered by position, so the first is Section 1. */
  title: string
  blocks: (TermsParagraph | TermsList)[]
}

export const TERMS_SECTIONS: TermsSection[] = [
  {
    title: 'About these Terms',
    blocks: [
      {
        lead: '1.1 Who this agreement is between.',
        text: 'These Terms and Conditions ("Terms") are between you ("Member", "you") and Oladayo Olawore, trading as Dayo Pius Fitness ("we", "us"). You can contact us at hi@dayopius.com.',
      },
      {
        lead: '1.2 What they cover.',
        text: 'These Terms apply to the Body Recomp Challenge ("the Challenge"), a 6-week group coaching program delivered through the Dayo Pius Fitness app ("the app").',
      },
      {
        lead: '1.3 Acceptance.',
        text: 'By ticking "I have read and agree to the Terms", paying for the Challenge, entering an access code or creating a member profile, you agree to be bound by these Terms. If you do not agree, do not pay for the Challenge or use the app.',
      },
      {
        lead: '1.4 Transfer.',
        text: 'We may transfer our rights and obligations under these Terms to a company or business we set up to run the Challenge. Your rights are not affected.',
      },
    ],
  },
  {
    title: 'Eligibility and health screening',
    blocks: [
      { lead: '2.1 Age.', text: 'You must be at least 18 years old to take part.' },
      { lead: '2.2 Health declaration.', text: 'Before starting, you confirm that all of the following are true:' },
      {
        items: [
          { text: 'I have no known heart condition, and I do not experience chest pain during physical activity.' },
          { text: 'I have not been advised by a doctor to only do physical activity recommended by a doctor.' },
          { text: 'I do not have a bone or joint problem that could be made worse by a change in physical activity.' },
          { text: "I am not currently pregnant, or if I am, I have my doctor's clearance to take part." },
          { text: "I am not breastfeeding and have not given birth in the last 6 months, or if I have, I have my doctor's clearance to take part." },
          { text: 'I do not have, and have never had, an eating disorder.' },
          { text: 'I do not have diabetes, high blood pressure, or a thyroid, kidney or other condition, and I take no medication, that could be affected by a change in diet or exercise.' },
          { text: 'I am not aware of any other reason why I should not take part in a physical exercise program.' },
        ],
      },
      {
        lead: '2.3 If any statement does not apply to you.',
        text: 'You must get written clearance from a licensed doctor confirming you are fit to take part in a structured resistance training and nutrition program before you start training. We may ask for this clearance at any time and may pause your access until it is provided.',
      },
      {
        lead: '2.4 Changes during the Challenge.',
        text: 'If your health changes during the 6 weeks, for example a new injury, diagnosis, pregnancy or surgery, you agree to stop the program, see a doctor before continuing, and let your coach know. Stopping for health reasons does not entitle you to a refund (see Section 9).',
      },
    ],
  },
  {
    title: 'Assumption of risk',
    blocks: [
      {
        text: 'The Challenge involves physical exercise, resistance training and changes to your diet. Like any training program, it carries risk, including muscle soreness, strains, joint injury, fatigue, dizziness and, in rare cases, serious injury, a cardiovascular event or death. Most of these risks are reduced by following the form videos, the Progressive Overload Guide and the advice below. You take part voluntarily and accept these risks.',
      },
      { text: 'You also understand that:' },
      {
        items: [
          { text: 'No coach or representative is physically present to supervise your form during your workouts.' },
          { text: 'The app gives you form videos for each exercise and a Progressive Overload Guide to help you choose and increase your weights. You agree to watch the videos and follow the guide. They are guidance and do not replace in-person instruction.' },
          { text: 'You are solely responsible for using correct form and suitable weights for your own body and ability.' },
        ],
      },
      {
        lead: 'Listen to your body.',
        text: "Normal training discomfort, such as a muscle burn during a set or soreness a day or two later, is expected. Unusual pain is not. You agree to stop the exercise immediately if you feel sharp, sudden or stabbing pain, pain in a joint, chest pain or tightness, dizziness or faintness, or unusual shortness of breath. Do not train through it. Tell your coach, and get medical help if the pain is severe or doesn't go away.",
      },
    ],
  },
  {
    title: 'Medical and nutrition disclaimer',
    blocks: [
      {
        text: 'The Challenge is a fitness coaching and accountability program. It is not a medical service. Nothing in the Challenge, including calorie and macro targets, workout programming or coach feedback, is medical advice, diagnosis or treatment.',
      },
      {
        items: [
          { text: 'Calorie and macro targets are calculated with a formula based on the details you provide (age, sex, weight, height, activity level and goal). They are estimates, not a personalised medical or clinical nutrition plan.' },
          { text: 'You should speak to a doctor or registered dietitian before starting this or any exercise or nutrition program, especially if you have a medical condition or injury, or are pregnant or breastfeeding.' },
          { text: 'The Challenge is not a substitute for professional medical, psychological or nutritional advice.' },
        ],
      },
    ],
  },
  {
    title: 'Waiver and release',
    blocks: [
      {
        strong: true,
        text: 'To the fullest extent permitted by Nigerian law, and subject to the exceptions below, you agree that Oladayo Olawore, Dayo Pius Fitness, the Challenge and its coaches, owners, operators, employees and affiliates ("Released Parties") will not be liable for any injury, illness or other harm, however serious, or for property damage, arising from your participation, except where caused by the Released Parties\' gross negligence, wilful misconduct, or failure to meet mandatory legal or safety standards.',
      },
      {
        text: 'This section does not affect any right or protection you have under the Federal Competition and Consumer Protection Act 2018, or any other law that cannot be excluded or limited by agreement, including your right to services performed with reasonable care and skill and in line with what you were led to expect.',
      },
    ],
  },
  {
    title: 'Indemnification',
    blocks: [
      {
        text: 'You agree to cover the Released Parties for claims, damages and reasonable expenses, including legal fees, that are caused by your own breach of these Terms or your unlawful conduct. This includes harm you cause to another member, for example through your conduct in the group chat or content you share.',
      },
    ],
  },
  {
    title: 'Your results',
    blocks: [
      {
        text: "Every body responds differently. Your results will depend on how consistently you follow your training and nutrition, your sleep and recovery, your starting point and your genetics. We give you the program, the coaching and the support, and you bring the effort. Because results are personal, we can't promise a specific amount of weight change, fat loss or muscle gain.",
      },
    ],
  },
  {
    title: 'Photos, your content and marketing use',
    blocks: [
      {
        lead: '8.1 In the app.',
        text: "Proof-of-workout photos and progress photos are stored in the app and are visible only to you and your coach, not to other members. By uploading a photo, you confirm you have the right to share it and that it does not violate anyone else's rights. You keep ownership of your photos.",
      },
      {
        lead: '8.2 Marketing use.',
        text: 'By agreeing to these Terms, you allow Dayo Pius to use your before and after photos and your results, such as changes in measurements or strength, to promote her coaching and future challenges. This includes Instagram, TikTok and other social media, the website and adverts. You can say no at any time by emailing hi@dayopius.com. Saying no does not affect your place in the Challenge.',
      },
      { lead: '8.3 How your privacy is protected.', text: 'Whenever your photos are used for marketing:' },
      {
        items: [
          { text: 'Your face will always be blurred or cropped out.' },
          { text: 'Your full name, contact details and other identifying information will never be shared.' },
          { text: 'Your photos will not be sold or licensed to anyone else.' },
        ],
      },
      {
        lead: '8.4 Withdrawing your consent.',
        text: 'You may withdraw your marketing consent at any time by emailing hi@dayopius.com. If your photos or results have already been posted, we will remove them from our own pages within 7 days of your email. We cannot recall copies that other people have already saved or reposted.',
      },
    ],
  },
  {
    title: 'Access codes, payment and refunds',
    blocks: [
      { lead: '9.1 Payment.', text: 'Payment is made through Selar. Your payment reserves your place in the Challenge.' },
      {
        lead: '9.2 Access codes.',
        text: 'Your one-time access code is sent by email on the onboarding date stated in your reservation email. Access codes are single-use and cannot be transferred to anyone else.',
      },
      { lead: '9.3 Refunds.', text: 'All payments are final once made. Refunds are not available, before or after your access code is sent.' },
      {
        lead: '9.4 Stopping early.',
        text: 'If you stop the Challenge early for any reason, including illness, injury, pregnancy or personal circumstances, you are not entitled to a full or partial refund, a credit, a pause, an extension or a place in a future cohort.',
      },
      {
        lead: '9.5 If we cancel or reschedule.',
        text: 'If we cancel the Challenge, or move the start date by more than 7 days, you may choose a place on the next cohort date. Refunds are not available in this case.',
      },
      {
        lead: '9.6 Exceptions.',
        text: 'Any exception to this section is at our sole discretion, is not guaranteed, and may require written medical evidence from a licensed doctor. Granting an exception to one member does not create a right for anyone else.',
      },
    ],
  },
  {
    title: 'Your account',
    blocks: [
      {
        items: [
          { text: 'Your account is for you alone. You may not share your login or let anyone else use your account.' },
          { text: 'Keep your password private, and email hi@dayopius.com straight away if you think someone else has access to your account.' },
          { text: 'You can be signed in on one device at a time. Signing in on a new device signs you out of the previous one.' },
        ],
      },
    ],
  },
  {
    title: 'Points, badges and the leaderboard',
    blocks: [
      {
        items: [
          { text: 'Points and badges are for motivation only. They have no cash value and cannot be exchanged or transferred.' },
          { text: 'Your workout logs must be true. Proof-of-workout photos must be your own and taken at that session.' },
          { text: 'We may adjust or remove points and badges where we reasonably believe a log or photo is false.' },
          { text: 'Where a leaderboard is shown, it displays your display name only. You can opt out in your settings.' },
          { text: 'If prizes are ever offered, they will have their own rules.' },
        ],
      },
    ],
  },
  {
    title: 'Code of conduct, group chat and live calls',
    blocks: [
      {
        lead: '12.1 Conduct.',
        text: 'You agree not to use the group chat, live calls or any other part of the app to harass or discriminate against other members, or to share inappropriate content involving them.',
      },
      {
        lead: '12.2 Group chat.',
        text: "Messages you post are visible to the members and coach of your cohort. You may not share other members' messages, photos or personal details outside the app.",
      },
      {
        lead: '12.3 Live calls.',
        text: 'Live calls are recorded and shared in the group chat for your cohort only. If you do not want to appear in a recording, keep your camera off. Recordings are not used for marketing without your separate consent. You may not record or share live calls yourself.',
      },
      { lead: '12.4 Breaches.', text: 'We may suspend or remove your access for breaking this section, as set out in Section 16.' },
    ],
  },
  {
    title: 'Our content',
    blocks: [
      {
        text: 'The training program, guides, videos, food plan and all other Challenge materials belong to us. You may use them for your own personal training during the Challenge. You may not copy, screen-record, share, publish or resell them, or use them to coach anyone else.',
      },
    ],
  },
  {
    title: 'Your personal data',
    blocks: [
      {
        lead: '14.1 What we collect.',
        text: 'We collect your profile details (name, email, age, sex, weight, height, activity level and goal), your health information (health declaration, allergies and injuries), your photos, your workout logs, check-ins and feedback, and your messages in the group chat.',
      },
      {
        lead: '14.2 Why we collect it.',
        text: 'We use this information to deliver the Challenge, calculate your food targets, coach you and keep the app secure.',
      },
      {
        lead: '14.3 Your consent.',
        text: 'By ticking "I have read and agree to the Terms", you consent to your health data and photos being stored and used for these purposes.',
      },
      {
        lead: '14.4 Who can see it.',
        text: 'Your health information and photos are visible only to you, your coach and the technical team that maintains the app, where needed to keep it working. Your display name and group chat messages are visible to your cohort. We never sell your personal data.',
      },
      {
        lead: '14.5 Service providers.',
        text: 'We use service providers to host the app, process payments and send emails. Some of them store data outside Nigeria. They may use your data only to provide those services to us.',
      },
      {
        lead: '14.6 How long we keep it.',
        text: 'We delete your health information and photos within 90 days after your Challenge ends, unless you join another challenge with us. Photos you have allowed us to use for marketing are kept until you withdraw that consent.',
      },
      {
        lead: '14.7 Your rights.',
        text: 'Under the Nigeria Data Protection Act 2023, you may ask to see, correct or delete your personal data, or withdraw your consent, by emailing hi@dayopius.com. If you withdraw consent to storage during the Challenge, we may be unable to keep providing it to you, and Section 9 still applies.',
      },
    ],
  },
  {
    title: 'Limitation of liability',
    blocks: [
      {
        text: "If a court finds the waiver in Section 5 unenforceable for any reason, the Released Parties' total liability to you for any claim arising from these Terms or your use of the app will not exceed the amount you paid for the Challenge. This limit does not apply to death or personal injury caused by our negligence, or to any liability that cannot be limited by law.",
      },
    ],
  },
  {
    title: 'Suspension and termination',
    blocks: [
      {
        lead: '16.1 By us.',
        text: "We may suspend or end your access for a serious or repeated breach of these Terms, without a refund. We will warn you first, except where the breach is serious, such as harassment, false logging or sharing our content or another member's content.",
      },
      {
        lead: '16.2 By you.',
        text: 'You may stop taking part at any time by no longer using the app. Stopping early, for any reason, does not entitle you to a refund.',
      },
    ],
  },
  {
    title: 'Changes to these Terms',
    blocks: [
      {
        text: 'The version of these Terms you accepted applies for the whole of your Challenge. If we need to change it during your Challenge, we will email you. Any change to how we use your photos or personal data will apply to you only if you agree to it. Updated Terms apply to future challenges and are accepted when you join them.',
      },
    ],
  },
  {
    title: 'Disputes and governing law',
    blocks: [
      {
        lead: '18.1 Talk to us first.',
        text: 'If you have a complaint, email hi@dayopius.com. We will try to resolve it with you within 14 days.',
      },
      {
        lead: '18.2 Mediation.',
        text: 'If we cannot resolve it, either of us may refer the dispute to mediation at the Lagos Multi-Door Courthouse before going to court.',
      },
      {
        lead: '18.3 Governing law and courts.',
        text: 'These Terms are governed by the laws of the Federal Republic of Nigeria. Any dispute that is not resolved under Sections 18.1 and 18.2 is subject to the jurisdiction of the courts of Lagos State.',
      },
    ],
  },
  {
    title: 'General',
    blocks: [
      {
        items: [
          {
            lead: 'Entire agreement.',
            text: 'These Terms are the whole agreement between you and us about the Challenge. The short version at the top is a summary only, and the full Terms apply if the two differ.',
          },
          {
            lead: 'If part of these Terms is invalid.',
            text: 'If any part of these Terms is found invalid or unenforceable, the rest remains in full force, and the invalid part will be replaced with a valid provision that most closely reflects its original intent.',
          },
          {
            lead: 'Events outside our control.',
            text: 'We are not responsible for a delay or failure caused by events outside our reasonable control, such as power, network or service provider outages.',
          },
          {
            lead: 'Notices.',
            text: 'We will contact you at the email address on your account. You can contact us at hi@dayopius.com.',
          },
          {
            lead: 'No waiver.',
            text: 'If we do not enforce a part of these Terms on one occasion, we may still enforce it later.',
          },
        ],
      },
    ],
  },
  {
    title: 'Acknowledgment',
    blocks: [
      { text: 'By ticking "I have read and agree to the Terms", you confirm that:' },
      {
        items: [
          { text: 'You have read and understood these Terms in full.' },
          { text: 'Your health declaration in Section 2 is true.' },
          { text: 'You understand the risks and accept the waiver in Sections 3 and 5.' },
          { text: 'You consent to your health data and photos being stored, as set out in Section 14.' },
          { text: 'You allow Dayo Pius to use your before and after photos and results to promote her coaching, always with your face blurred, as set out in Section 8.' },
          { text: 'You are entering this agreement of your own free will.' },
        ],
      },
      {
        text: 'You can say no to marketing use at any time by emailing hi@dayopius.com. Saying no does not affect your place in the Challenge.',
      },
    ],
  },
]
