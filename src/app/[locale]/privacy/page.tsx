'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import LegalLayout, { LegalSection } from '@/components/legal/LegalLayout';

export default function PrivacyPolicyPage() {
  const t = useTranslations('Legal');

  const sections: LegalSection[] = [
    {
      id: 'scope',
      title: '1. Scope & B2B Context',
      content: (
        <>
          <p>
            This Privacy Policy governs the collection, storage, and processing of commercial data by 99 Purity Wholesale. We operate exclusively as a Business-to-Business (B2B) platform supplying research compounds to qualified organizations, wellness clinics, compounding pharmacies, and researchers.
          </p>
          <p>
            We do not provide services to, or collect data from, individual retail consumers. All data provided must relate to your active business credentials and professional laboratory intentions.
          </p>
        </>
      )
    },
    {
      id: 'collection',
      title: '2. Information We Collect',
      content: (
        <>
          <p>
            To establish a wholesale account and fulfill research compound orders, we collect relevant professional information, including:
          </p>
          <ul className="space-y-2 mt-4">
            <li><strong>Corporate Credentials:</strong> Business name, state registration, employer identification numbers (EIN), and clinic licensing information.</li>
            <li><strong>Operational Contact Info:</strong> Work email addresses, shipping/billing physical addresses, and corporate telephone numbers.</li>
            <li><strong>Compliance Materials:</strong> Professional attestations, laboratory credentials, and intended research descriptions.</li>
          </ul>
        </>
      )
    },
    {
      id: 'usage',
      title: '3. Data Security & Encryption',
      content: (
        <>
          <p>
            All submitted credentials, business forms, and order data are encrypted in transit using Transport Layer Security (TLS 1.3) and stored utilizing Advanced Encryption Standard (AES-256).
          </p>
          <p>
            We enforce strict access controls restricting corporate database access only to authorized laboratory compliance officers and verification staff.
          </p>
        </>
      )
    },
    {
      id: 'sharing',
      title: '4. Third-Party Sharing',
      content: (
        <>
          <p>
            We do not sell, rent, or trade your corporate information with marketing companies. Data sharing is limited to essential operational partners, specifically:
          </p>
          <ul className="space-y-2 mt-4">
            <li><strong>HPLC Verification Laboratories:</strong> Only when validating research credentials or verifying batch documentation.</li>
            <li><strong>LTL Logistics & Shipping Carriers:</strong> To transport and deliver wholesale research kits.</li>
            <li><strong>Legal Counsel:</strong> In compliance with federal audits or regulatory verification requirements.</li>
          </ul>
        </>
      )
    },
    {
      id: 'compliance',
      title: '5. Regulatory Safeguards',
      content: (
        <>
          <p>
            As a supplier of high-purity research compounds, we comply with relevant federal mandates. If required by law, we will share business transaction logs with appropriate authorities to confirm research clearance.
          </p>
        </>
      )
    }
  ];

  return (
    <LegalLayout
      title={t('Privacy.title') || "Privacy Policy"}
      badge="Data Protection Regulation"
      lastUpdated="Last Updated: May 2026"
      sections={sections}
    />
  );
}
