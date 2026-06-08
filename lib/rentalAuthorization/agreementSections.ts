export type AgreementSectionId =
  | 'equipment_identification'
  | 'equipment_condition'
  | 'responsibility'
  | 'late_return'
  | 'security_hold'
  | 'insurance_protection'
  | 'assumption_of_risk'
  | 'prohibited_uses'
  | 'return_expectations'
  | 'damage_disputes';

export type AgreementSectionDef = {
  id: AgreementSectionId;
  title: string;
  summary: string;
  bullets?: string[];
  requiresCheckbox?: boolean;
  checkboxLabel?: string;
};

export const RENTAL_AGREEMENT_SECTIONS: AgreementSectionDef[] = [
  {
    id: 'equipment_identification',
    title: 'Equipment identification',
    summary: 'The item, rental period, and meetup details for this rental.',
  },
  {
    id: 'equipment_condition',
    title: 'Equipment condition acknowledgment',
    summary: 'Confirm the item matches inspection photos and notes.',
    requiresCheckbox: true,
    checkboxLabel:
      'I confirm the equipment condition matches the provided photos and inspection notes.',
    bullets: [
      'Existing wear and documented damage are disclosed.',
      'Included accessories match the listing.',
      'I acknowledge operational condition at pickup.',
      'Battery or fuel level is acceptable for intended use.',
    ],
  },
];

export const LIABILITY_DISCLOSURE_SECTIONS: AgreementSectionDef[] = [
  {
    id: 'responsibility',
    title: 'Responsibility during rental',
    summary: 'While you have possession, you are responsible for proper use and care.',
    bullets: [
      'Theft or loss while in your possession',
      'Misuse or negligent operation',
      'Damage caused by unauthorized users',
      'Damage beyond normal wear',
    ],
  },
  {
    id: 'late_return',
    title: 'Late return policy',
    summary: 'Returns after the agreed window may incur fees and continued billing.',
    bullets: [
      'Grace period applies only when stated in your rental terms',
      'Daily late fees up to the published cap',
      'Continued billing until the item is returned',
      'Non-return may trigger deposit capture and escalation',
    ],
  },
  {
    id: 'security_hold',
    title: 'Security hold disclosure',
    summary: 'A temporary hold — not an immediate charge — may be placed on your payment method.',
    bullets: [
      'Hold amount covers potential damage, loss, cleaning, or late fees',
      'You authorize capture only if qualifying charges apply',
      'Hold is released when the rental closes with no outstanding claims',
    ],
  },
  {
    id: 'insurance_protection',
    title: 'Insurance / protection disclosure',
    summary: 'If you decline optional protection, you may bear repair or replacement costs.',
    requiresCheckbox: true,
    checkboxLabel: 'I understand I declined protection coverage and may be financially responsible.',
  },
  {
    id: 'assumption_of_risk',
    title: 'Assumption of risk / liability waiver',
    summary: 'Some items carry inherent risk. You accept those risks by proceeding.',
    bullets: [
      'Motorcycles, power tools, trailers, and machinery require careful operation',
      'You assume risk of injury or property damage from normal inherent hazards',
      'Owner liability is limited to the extent permitted by law and this agreement',
    ],
  },
  {
    id: 'prohibited_uses',
    title: 'Prohibited uses',
    summary: 'The item may not be used for the following:',
    bullets: [
      'Illegal activity',
      'Use while intoxicated or impaired',
      'Racing, stunts, or reckless operation',
      'Sub-renting without written approval',
      'Unauthorized commercial use',
    ],
  },
  {
    id: 'return_expectations',
    title: 'Return expectations',
    summary: 'Return the item in the same condition with all accessories.',
    bullets: [
      'Reasonable cleanliness',
      'Fuel or battery level per owner instructions',
      'Same operational condition as at pickup (ordinary wear excepted)',
      'All included accessories and keys',
    ],
  },
];

/** Renter authorization screen — accordion only, no per-section checklists. */
export const RENTAL_AGREEMENT_REVIEW_ACCORDION: AgreementSectionDef[] = [
  {
    id: 'equipment_identification',
    title: 'Rental Agreement',
    summary: 'What you are agreeing to rent, when, and how handoff is documented.',
    bullets: [
      'You agree to rent the listed item for the scheduled pickup and return window.',
      'Owner pickup photos and your in-person inspection set the item’s starting condition.',
      'Meetup location, arrival check-ins, and handoff confirmations are saved to this rental.',
    ],
  },
  {
    id: 'assumption_of_risk',
    title: 'Liability Waiver',
    summary: 'Safe use, prohibited activity, and your responsibility while the item is with you.',
    bullets: [
      'Operate the item safely for its intended use and follow owner instructions.',
      'No illegal use, impairment, racing or stunts, or sub-renting without written approval.',
      'You are responsible for the item’s care and condition for the entire rental period.',
    ],
  },
  {
    id: 'insurance_protection',
    title: 'Protection & Insurance',
    summary: 'Damage, loss, security hold, and when charges may apply.',
    bullets: [
      'You are responsible for damage, loss, or theft while the item is in your possession.',
      'A temporary security hold may be placed — it is not a charge unless qualifying claims apply.',
      'Without optional protection, repair or replacement costs may be out of pocket.',
    ],
  },
  {
    id: 'return_expectations',
    title: 'Rental Summary',
    summary: 'Return on time, bring everything back, and what becomes part of your record.',
    bullets: [
      'Return by the agreed date and time with all included accessories, keys, and reasonable cleanliness.',
      'Late returns may incur fees after any stated grace period, up to the published cap.',
      'Pickup and return photos you submit become part of the official rental record.',
    ],
  },
  {
    id: 'damage_disputes',
    title: 'Damage & Disputes',
    summary: 'How documented evidence may be used if something goes wrong.',
    bullets: [
      'Pickup and return evidence may be used to resolve damage or condition disputes.',
      'Messages, meetup records, and uploaded photos may be reviewed during a claim.',
      'Either party may submit supporting documentation; RenbyU may rely on documented evidence when resolving disputes.',
    ],
  },
];

export function buildRentalAgreementText(): string {
  const lines = [
    ...RENTAL_AGREEMENT_SECTIONS.flatMap((s) => [s.title, s.summary, ...(s.bullets ?? [])]),
    ...LIABILITY_DISCLOSURE_SECTIONS.flatMap((s) => [s.title, s.summary, ...(s.bullets ?? [])]),
    'Return the item in the same condition received, excluding normal wear.',
    'Pickup and return photos plus confirmations are part of the rental record.',
  ];
  return lines.join('\n');
}
