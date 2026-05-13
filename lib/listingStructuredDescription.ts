/**
 * Listing `description` from the publish wizard is a fixed set of labeled lines.
 * Parse them so the detail screen can render structured rows and keep only true prose for "About".
 */

export type ParsedStructuredListingDescription = {
  category: string | null;
  condition: string | null;
  conditionNotes: string | null;
  included: string | null;
  pickupDelivery: string | null;
  deliveryFee: string | null;
  serviceArea: string | null;
  /** Lines that did not match a known wizard prefix (free-form copy or host notes). */
  narrative: string;
};

type StructuredKey = keyof Omit<ParsedStructuredListingDescription, 'narrative'>;

const LINE_RULES: { key: StructuredKey; pattern: RegExp }[] = [
  { key: 'category', pattern: /^Category:\s*(.*)$/i },
  { key: 'condition', pattern: /^Condition:\s*(.*)$/i },
  { key: 'conditionNotes', pattern: /^Condition notes:\s*(.*)$/i },
  { key: 'included', pattern: /^Included:\s*(.*)$/i },
  { key: 'pickupDelivery', pattern: /^Pickup \/ delivery:\s*(.*)$/i },
  { key: 'deliveryFee', pattern: /^Delivery fee preference:\s*(.*)$/i },
  { key: 'serviceArea', pattern: /^Service area:\s*(.*)$/i },
];

export function parseStructuredListingDescription(raw: string): ParsedStructuredListingDescription {
  const empty: ParsedStructuredListingDescription = {
    category: null,
    condition: null,
    conditionNotes: null,
    included: null,
    pickupDelivery: null,
    deliveryFee: null,
    serviceArea: null,
    narrative: '',
  };
  const t = raw.trim();
  if (!t) return empty;

  const fields: Record<StructuredKey, string | null> = {
    category: null,
    condition: null,
    conditionNotes: null,
    included: null,
    pickupDelivery: null,
    deliveryFee: null,
    serviceArea: null,
  };
  const narrativeLines: string[] = [];

  for (const rawLine of raw.split(/\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    let matched = false;
    for (const { key, pattern } of LINE_RULES) {
      const m = line.match(pattern);
      if (m) {
        const v = m[1].trim();
        if (v) fields[key] = v;
        matched = true;
        break;
      }
    }
    if (!matched) narrativeLines.push(line);
  }

  return {
    category: fields.category,
    condition: fields.condition,
    conditionNotes: fields.conditionNotes,
    included: fields.included,
    pickupDelivery: fields.pickupDelivery,
    deliveryFee: fields.deliveryFee,
    serviceArea: fields.serviceArea,
    narrative: narrativeLines.join('\n').trim(),
  };
}
