
const faqs = [
  {
    q: "I added too much BAC water to my 10mg Semaglutide vial, is it ruined?",
    a: "No, the peptide is not ruined. Adding more bacteriostatic water than intended simply dilutes the concentration (mg/mL). The total mass of the peptide (10mg) remains identical. You simply need to use the calculator above to adjust your math. For example, if you added 3mL instead of 2mL, you will just need to draw a higher volume of liquid into your syringe to achieve the exact same microgram dosage."
  },
  {
    q: "How do I calculate mcg per tick mark on a U-100 syringe if my vial is 5mg?",
    a: "If you reconstitute a 5mg vial with 2mL of BAC water, your concentration is 2.5mg/mL (or 2,500mcg/mL). A U-100 syringe holds 1mL across 100 units (tick marks). Therefore, you divide 2,500mcg by 100 units, which equals exactly 25mcg per single tick mark (unit)."
  },
  {
    q: "Why does my reconstituted peptide look cloudy?",
    a: "A properly reconstituted research peptide should be entirely clear and free of particulates. If the solution is cloudy, milky, or contains 'floaties', it indicates the peptide has fallen out of suspension. This can be caused by severe degradation, improper pH levels in the BAC water, or a manufacturing defect. Cloudy vials should never be used in research protocols and must be discarded immediately."
  },
  {
    q: "Can I use sterile water instead of Bacteriostatic Water?",
    a: "While sterile water can technically dissolve a lyophilized peptide, it does not contain the 0.9% benzyl alcohol preservative found in Bacteriostatic Water. Without this preservative, bacteria will begin to colonize the solution almost immediately upon puncture. Therefore, peptides mixed with sterile water must be utilized entirely in a single session and cannot be stored for multi-dose protocols."
  },
  {
    q: "Does the size of the lyophilized 'puck' dictate the milligram count?",
    a: "No. The visible mass of the 'puck' inside the vial is primarily composed of Mannitol, an inert sugar used as a carrier molecule to give the microscopic peptide structure during the freeze-drying process. A 2mg vial of CJC-1295 may look physically larger than a 10mg vial of Tirzepatide simply because more Mannitol was utilized during synthesis. Always refer to the label, never the size of the puck."
  },
  {
    q: "What happens if I accidentally shake the vial after adding BAC water?",
    a: "Peptide amino acid chains are incredibly fragile. Aggressively shaking the vial introduces mechanical shear stress that can physically break the molecular bonds, degrading the compound's efficacy. You should always gently swirl the vial in a circular motion until the lyophilized powder is completely dissolved."
  },
  {
    q: "Is it normal for a vacuum to pull the BAC water into the vial automatically?",
    a: "Yes. High-quality wholesale peptides are sealed under negative pressure (a vacuum) during the freeze-drying process. When you puncture the stopper with a syringe, the vacuum will naturally pull the BAC water inside. Be sure to angle the needle against the glass so the water runs down the side, preventing a direct high-pressure blast onto the peptide puck."
  },
  {
    q: "How long does a reconstituted peptide last in the refrigerator?",
    a: "Once reconstituted with Bacteriostatic Water, most research peptides remain stable for 28 to 30 days when stored properly in a medical refrigerator at 2°C to 8°C (36°F - 46°F). Beyond 30 days, the peptide begins to rapidly degrade and lose biological efficacy. The BAC water itself also expires 28 days after its initial puncture."
  },
  {
    q: "Can I pre-fill insulin syringes and store them in the freezer?",
    a: "No. Once a peptide is reconstituted with BAC water, it should never be frozen again. Freezing an aqueous peptide solution causes ice crystals to form, which act like microscopic razors that slice and destroy the amino acid chains. Keep reconstituted vials and any pre-filled syringes strictly refrigerated, never frozen."
  },
  {
    q: "Do I need to adjust math if I use a U-50 instead of a U-100 syringe?",
    a: "The total volume changes, but the math per unit remains the same relative to a U-100. A U-50 syringe holds exactly half the volume (0.5mL) of a U-100 syringe (1.0mL). If your concentration is 50mcg per unit on a U-100 syringe, it is still 50mcg per unit on a U-50 syringe; you simply have fewer total units available in the barrel."
  }
];

import FaqLight from '@/components/shared/FaqLight';

export default function CalculatorFaq() {
  return <FaqLight id="calculator-faq" title="Real-World Troubleshooting" items={faqs} />;
}
