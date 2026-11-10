// Knowledge base from the assessment brief. This is the ONLY source of policy for drafts.
export const KNOWLEDGE_BASE = [
  ['Shipping', 'Orders ship within 24 hours, Monday to Saturday. Delivery takes 3-5 business days in metro cities and 5-8 business days elsewhere in India.'],
  ['Address change', 'The delivery address can be changed only before the order has shipped, and only if the customer contacts us within 12 hours of placing it. After shipping, the address cannot be changed.'],
  ['Cancellation', 'An order can be cancelled before it ships. After it ships, the customer can refuse delivery and a refund is issued once the parcel returns to us.'],
  ['Returns', 'Returns are accepted within 7 days of delivery for unopened, unused products. Opened products are accepted only if damaged or if the wrong item was sent.'],
  ['Refunds', 'Approved refunds go back to the original payment method within 5-7 business days after we receive the returned parcel.'],
  ['Cash on delivery', 'Cash on delivery is available for orders under ₹3,000, with a ₹50 fee.'],
  ['Ingredients', 'All Verdant & Co products are fragrance-free and vegan.'],
  ['Damaged or wrong product', 'The returns policy accepts opened products if they arrived damaged or the wrong item was sent. The steps, evidence needed, replacement options, and resolution timeline are not documented. Acknowledge the issue, ask for the order number, and have a team member confirm the next steps; do not promise a replacement or refund.'],
  ['Delayed or missing delivery', 'The AI cannot access shipment tracking or confirm an individual order status. Ask for the order number and tell the customer a team member will check; do not infer that the parcel is lost or promise a new delivery date.'],
  ['Delivery coverage and tracking', 'The documented delivery estimates apply to metro cities and other locations in India. International delivery, serviceable pin codes, courier partners, tracking links, and delivery-attempt procedures are not documented; ask a team member to confirm these details.'],
  ['Missing item or incomplete order', 'A policy for missing items, partial deliveries, or items absent from a parcel is not documented. Ask for the order number and flag the case for a team member; do not promise a refund or replacement.'],
  ['Product recommendations and skin types', 'Product-specific benefits, skin-type suitability, and recommendations are not documented. Do not select or recommend a product based on a customer’s skin type or concern; acknowledge the question and ask a team member to advise.'],
  ['Product use and skincare routines', 'Product directions, frequency of use, ingredient combinations, and skincare routines are not documented. Do not suggest how to use, layer, or combine products; flag the question for a team member.'],
  ['Sensitive skin, pregnancy, and medical suitability', 'The knowledge base does not establish whether a product is suitable for sensitive skin, pregnancy, breastfeeding, a medical condition, or use with medication. Do not provide a suitability or safety assurance; recommend professional medical advice for health concerns and flag the question for a team member.'],
  ['Product-specific ingredients', 'The only verified ingredient-related statement is that all Verdant & Co products are fragrance-free and vegan. Individual ingredient lists, allergens, and formula details are not documented; do not infer them and ask a team member to confirm.'],
];

export const kbAsText = () => KNOWLEDGE_BASE.map(([t, p]) => `- ${t}: ${p}`).join('\n');
