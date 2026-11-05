'use client';

import React from 'react';
import LegalLayout, { LegalSection } from '@/components/legal/LegalLayout';

export default function RefundPolicyPage() {
  const sections: LegalSection[] = [
    {
      id: 'contamination',
      title: '1. Sterile Controls & Return Restrictions',
      content: (
        <>
          <p>
            Due to the strict sterile and temperature controls required for the storage of lyophilized peptide research compounds, we do not accept returns or exchanges for items that have left our shipping chain custody.
          </p>
          <p>
            This policy is strictly enforced to guarantee the chemical integrity and sterility of compounds delivered to other laboratory clients.
          </p>
        </>
      )
    },
    {
      id: 'purity-guarantee',
      title: '2. HPLC Verification & Quality Claims',
      content: (
        <>
          <p>
            Every batch supplied by 99 Purity Wholesale is guaranteed at a purity of &ge;99% as validated by independent third-party laboratories.
          </p>
          <p>
            In the event that an independent, certified laboratory analysis (utilizing validated HPLC/MS techniques) shows that a supplied compound has a purity of less than 99%, we will issue a full replacement or store credit. Supporting chromatogram documentation must be provided for all quality claims.
          </p>
        </>
      )
    },
    {
      id: 'carrier-damage',
      title: '3. Carrier Damage & Delivery Issues',
      content: (
        <>
          <p>
            We take extreme care in packaging bulk glassware and vial kits. However, if transit damage occurs:
          </p>
          <ul className="list-disc pl-5 space-y-2 mt-4">
            <li>Any broken vials or kit damages must be reported to our operations desk within 48 hours of delivery.</li>
            <li>Reports must include photographic evidence of the unopened packaging and damaged contents.</li>
            <li>Upon verification, replacements will be shipped immediately via priority dispatch at no additional cost.</li>
          </ul>
        </>
      )
    },
    {
      id: 'cancellation',
      title: '4. Order Cancellations',
      content: (
        <>
          <p>
            Orders can be cancelled for a full refund at any time prior to shipping label generation.
          </p>
          <p>
            Once a shipment has been processed and entered the carrier network, the transaction is final and cannot be recalled or cancelled.
          </p>
        </>
      )
    },
    {
      id: 'claims-process',
      title: '5. Submitting a Claim',
      content: (
        <>
          <p>
            To submit a quality or transit claim, please email our laboratory operations desk at <strong>sales@99puritywholesale.com</strong> with your order invoice number, batch/lot tracking code, and any supporting HPLC chromatograms or photos.
          </p>
        </>
      )
    }
  ];

  return (
    <LegalLayout
      title="Refund & Replacement Policy"
      badge="B2B Quality Guarantee"
      lastUpdated="Last Updated: May 2026"
      sections={sections}
    />
  );
}
