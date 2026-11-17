'use client';

import React from 'react';
import { Beaker, ShieldAlert, FlaskConical, Stethoscope, Clock, Thermometer, Droplet, RefreshCw } from 'lucide-react';

export default function CalculatorContent() {
  return (
    <div className="max-w-4xl mx-auto mt-16 space-y-12 pb-16 md:mt-24 md:space-y-16 md:pb-24">
      {/* Introduction */}
      <section className="bg-white border border-[#E6EAF1] rounded-[1.25rem] p-8 md:p-12">
        <div className="flex items-center gap-3 mb-6">
          <FlaskConical className="w-6 h-6 text-[#0B6F7B]" />
          <h2 className="text-2xl md:text-3xl font-dm-sans font-light tracking-[-0.03em] text-black">
            The Complete Guide to Peptide Reconstitution
          </h2>
        </div>
        <div className="space-y-6 text-black/70 leading-relaxed md:text-lg">
          <p>
            When operating a clinical research facility or compounding pharmacy, absolute precision in peptide reconstitution is non-negotiable. Whether you are dealing with metabolic regulators like <strong>Semaglutide</strong> or regenerative compounds like <strong>BPC-157</strong>, the mathematical translation from lyophilized milligrams (mg) to liquid micrograms (mcg) dictates the integrity of your entire research protocol.
          </p>
          <p>
            Lyophilization (freeze-drying) is the industry standard for peptide synthesis. It removes water from the compound under low temperature and high vacuum, effectively putting the amino acid chain into stasis. This prevents degradation during transit and storage. However, before a peptide can be administered in any clinical or laboratory setting, it must be returned to an aqueous state through reconstitution.
          </p>
          <p>
            This 99 Purity Wholesale Peptide Calculator is designed specifically for licensed medical professionals, clinical researchers, and specialized laboratory technicians. It eliminates the mathematical friction of converting multi-milligram vials into precise microgram dosages across standard U-100, U-50, and U-30 insulin syringes.
          </p>
        </div>
      </section>

      {/* Bacteriostatic Water */}
      <section className="space-y-8">
        <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-dm-sans font-light tracking-[-0.03em] text-black border-b border-[#E6EAF1] pb-4">
          Understanding Bacteriostatic Water (BAC)
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-[#F3F5FA] border border-[#E6EAF1] p-8 rounded-[1.25rem]">
            <h3 className="text-xl font-dm-sans font-light tracking-[-0.03em] text-black mb-4 flex items-center gap-2">
              <Droplet className="w-5 h-5 text-[#0B6F7B]" /> What is BAC Water?
            </h3>
            <p className="text-black/60 leading-relaxed">
              Bacteriostatic Water for Injection is sterile, non-pyrogenic water containing 0.9% benzyl alcohol (9mg/mL). The benzyl alcohol serves as a bacteriostatic preservative, actively inhibiting the growth of most bacteria and fungi.
            </p>
          </div>
          
          <div className="bg-[#F3F5FA] border border-[#E6EAF1] p-8 rounded-[1.25rem]">
            <h3 className="text-xl font-dm-sans font-light tracking-[-0.03em] text-black mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#0B6F7B]" /> Shelf Life & Expiration
            </h3>
            <p className="text-black/60 leading-relaxed">
              Once a multi-dose vial of BAC water is punctured, its sterile integrity begins to degrade. The FDA strictly mandates a <strong>28-day discard rule</strong> for all multi-dose BAC vials, regardless of how much liquid remains. 
            </p>
          </div>
        </div>

        <div className="bg-amber-500/5 border border-amber-500/10 rounded-[1.25rem] p-6 md:p-8 flex gap-4 md:gap-6 mt-6">
          <ShieldAlert className="w-8 h-8 text-amber-600 flex-shrink-0" />
          <div>
            <h4 className="font-dm-sans font-light tracking-[-0.03em] text-amber-700 text-lg mb-2">
              Sterile Water vs. Bacteriostatic Water
            </h4>
            <p className="text-amber-950/70 leading-relaxed">
              Never confuse Bacteriostatic Water with Sterile Water. Sterile water does <em>not</em> contain benzyl alcohol. If a peptide is reconstituted with plain sterile water, it must be utilized immediately as a single-use dose. Bacteria will begin to colonize a sterile water solution almost instantly once exposed to the environment, completely ruining expensive research compounds like Tirzepatide or Retatrutide.
            </p>
          </div>
        </div>
      </section>

      {/* The Mathematics */}
      <section className="bg-white border border-[#E6EAF1] rounded-[1.25rem] p-8 md:p-12">
        <h2 className="text-2xl md:text-3xl font-dm-sans font-light tracking-[-0.03em] text-black mb-8">
          The Mathematics of Reconstitution
        </h2>
        <div className="space-y-6 text-black/70 leading-relaxed">
          <p>
            The fundamental challenge of peptide reconstitution lies in the conversion of <strong>mass (mg/mcg)</strong> to <strong>volume (mL/units)</strong>. To calculate accurate dosage, you must first establish the concentration of the vial post-reconstitution.
          </p>
          
          <div className="bg-[#0B0D10] text-white p-6 rounded-2xl font-dm-mono text-sm overflow-x-auto my-8 border border-white/10">
            <div className="text-white/50 mb-2">// Formula 1: Establishing Vial Concentration</div>
            <div className="mb-4 text-[#4FC3D0]">Concentration (mg/mL) = Vial Mass (mg) ÷ Added Volume (mL)</div>
            
            <div className="text-white/50 mb-2">// Formula 2: Converting to Micrograms</div>
            <div className="mb-4 text-[#4FC3D0]">mcg per mL = Concentration (mg/mL) × 1,000</div>
            
            <div className="text-white/50 mb-2">// Formula 3: Calculating Syringe Units</div>
            <div className="text-[#4FC3D0]">mcg per Unit = mcg per mL ÷ Syringe Volume in Units (e.g., 100)</div>
          </div>

          <h3 className="text-xl font-dm-sans font-light tracking-[-0.03em] text-black mt-8 mb-4">
            Practical Example: 10mg Semaglutide
          </h3>
          <p>
            Let’s run the math on a standard wholesale vial of 10mg Semaglutide, reconstituted with 2mL of Bacteriostatic Water, drawn into a U-100 (1mL) insulin syringe.
          </p>
          <ul className="list-disc pl-6 space-y-3 mt-4 text-black/70">
            <li><strong>Step 1:</strong> 10mg ÷ 2mL = <strong>5mg per mL</strong> concentration.</li>
            <li><strong>Step 2:</strong> 5mg × 1,000 = <strong>5,000mcg per mL</strong>.</li>
            <li><strong>Step 3:</strong> A U-100 syringe contains 100 units. Therefore, 5,000mcg ÷ 100 units = <strong>50mcg per tick mark (unit)</strong>.</li>
          </ul>
          <p className="mt-6 text-black/60 italic">
            *If a clinical protocol calls for a 500mcg dose, the practitioner would pull exactly 10 units into the U-100 syringe (50mcg × 10 units = 500mcg).
          </p>
        </div>
      </section>

      {/* Syringe Types Table */}
      <section className="space-y-8">
        <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-dm-sans font-light tracking-[-0.03em] text-black border-b border-[#E6EAF1] pb-4">
          Syringe Capacities & Tick Marks
        </h2>
        <p className="text-black/70 leading-relaxed">
          Not all insulin syringes are created equal. Reading the barrel incorrectly is the most common source of clinical dosing errors. Insulin syringes are measured in "Units" (U), which correlate directly to Milliliters (mL).
        </p>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="border-b-2 border-[#E6EAF1]">
                <th className="py-4 px-4 font-dm-sans font-light tracking-[-0.03em] text-black text-sm">Syringe Type</th>
                <th className="py-4 px-4 font-dm-sans font-light tracking-[-0.03em] text-black text-sm">Total Volume</th>
                <th className="py-4 px-4 font-dm-sans font-light tracking-[-0.03em] text-black text-sm">Total Units</th>
                <th className="py-4 px-4 font-dm-sans font-light tracking-[-0.03em] text-black text-sm">Scale Increments</th>
              </tr>
            </thead>
            <tbody className="font-archia text-black/70">
              <tr className="border-b border-[#E6EAF1] hover:bg-black/[0.02] transition-colors">
                <td className="py-4 px-4 font-medium text-black">U-100 (Standard)</td>
                <td className="py-4 px-4">1.0 mL</td>
                <td className="py-4 px-4">100 Units</td>
                <td className="py-4 px-4">Counted in 2-unit increments</td>
              </tr>
              <tr className="border-b border-[#E6EAF1] hover:bg-black/[0.02] transition-colors">
                <td className="py-4 px-4 font-medium text-black">U-50 (Half)</td>
                <td className="py-4 px-4">0.5 mL</td>
                <td className="py-4 px-4">50 Units</td>
                <td className="py-4 px-4">Counted in 1-unit increments</td>
              </tr>
              <tr className="hover:bg-black/[0.02] transition-colors">
                <td className="py-4 px-4 font-medium text-black">U-30 (Micro)</td>
                <td className="py-4 px-4">0.3 mL</td>
                <td className="py-4 px-4">30 Units</td>
                <td className="py-4 px-4">Counted in 1-unit or 0.5-unit increments</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Reconstitution Best Practices */}
      <section className="bg-[#0B0D10] text-white rounded-[1.25rem] p-8 md:p-12 shadow-none relative overflow-hidden">
        <h2 className="text-2xl md:text-3xl font-dm-sans font-light tracking-[-0.03em] text-white mb-8 relative z-10">
          Clinical Best Practices: Mixing & Storage
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
          <div className="space-y-4">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center mb-6">
              <RefreshCw className="w-5 h-5 text-white" />
            </div>
            <h3 className="font-dm-sans font-light tracking-[-0.03em] text-lg">1. The Vacuum Effect</h3>
            <p className="text-white/60 text-sm leading-relaxed">
              Lyophilized peptide vials are packaged under negative pressure (a vacuum). When you pierce the stopper with a BAC water syringe, the water will automatically pull into the vial. <strong>Do not blast the water directly onto the peptide puck.</strong> Angle the needle so the water runs slowly down the side of the glass. Aggressive water pressure can shear fragile amino acid bonds.
            </p>
          </div>
          
          <div className="space-y-4">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center mb-6">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            <h3 className="font-dm-sans font-light tracking-[-0.03em] text-lg">2. Swirl, Never Shake</h3>
            <p className="text-white/60 text-sm leading-relaxed">
              Once the BAC water is added, the lyophilized "puck" will dissolve rapidly. <strong>Never aggressively shake the vial.</strong> Shaking introduces air bubbles and mechanical stress capable of degrading the compound. Gently swirl the vial in a circular motion until the solution is completely clear and free of particulates.
            </p>
          </div>
          
          <div className="space-y-4">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center mb-6">
              <Thermometer className="w-5 h-5 text-white" />
            </div>
            <h3 className="font-dm-sans font-light tracking-[-0.03em] text-lg">3. Cold-Chain Storage</h3>
            <p className="text-white/60 text-sm leading-relaxed">
              Prior to reconstitution, lyophilized peptides can survive at room temperature, though long-term storage should be in a freezer (-20°C). <strong>Post-reconstitution, all peptides must immediately enter cold storage.</strong> Reconstituted vials should be kept in a medical-grade refrigerator between 2°C and 8°C (36°F - 46°F) and kept completely away from direct UV or sunlight.
            </p>
          </div>

          <div className="space-y-4">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center mb-6">
              <Beaker className="w-5 h-5 text-white" />
            </div>
            <h3 className="font-dm-sans font-light tracking-[-0.03em] text-lg">4. Recognizing Degradation</h3>
            <p className="text-white/60 text-sm leading-relaxed">
              A properly reconstituted peptide should be 100% translucent and clear. If your reconstituted vial appears cloudy, milky, or contains visible floating "floaties" or particulate matter, the compound has fallen out of suspension. This is indicative of degradation, improper pH in the BAC water, or a compromised seal. The vial must be discarded.
            </p>
          </div>
        </div>
      </section>

      {/* Advanced Research & Carrier Molecules */}
      <section className="space-y-6">
        <h2 className="text-2xl md:text-3xl font-dm-sans font-light tracking-[-0.03em] text-black">
          Advanced Reconstitution: Mannitol & Carrier Molecules
        </h2>
        <div className="space-y-6 text-black/70 leading-relaxed">
          <p>
            When utilizing high-purity wholesale peptides from a supplier like <strong>99 Purity Wholesale</strong>, you may notice the physical "puck" inside the vial varies in size, even if the milligram count is identical. This is due to the use of carrier molecules, primarily <strong>Mannitol</strong>.
          </p>
          <p>
            Because peptides like CJC-1295 or Ipamorelin are dosed in such minuscule quantities (2mg or 5mg), the raw synthesized powder is practically invisible to the naked eye. To ensure the peptide adheres to the glass during the freeze-drying process and doesn't blow out of the vial, chemists utilize an inert sugar (Mannitol) to give the peptide physical structure.
          </p>
          <p>
            Mannitol does not alter the mathematical equation of the peptide calculator. A 10mg vial of Tirzepatide containing 15mg of Mannitol filler is still fundamentally calculated as a 10mg vial. The carrier molecule dissolves instantly in BAC water and has zero physiological interaction.
          </p>
        </div>
      </section>

    </div>
  );
}
