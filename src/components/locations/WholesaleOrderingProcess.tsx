'use client';

import React from 'react';
import { FileText, Search, MessageCircle, Truck } from 'lucide-react';
import { FadeIn, StaggerContainer, StaggerItem } from '@/components/shared/Motion';
import { useLocale } from 'next-intl';

interface WholesaleOrderingProcessProps {
  locationName: string;
}

const stepsEn = [
  {
    icon: FileText,
    step: '01',
    title: 'Apply for a Wholesale Account',
    desc: 'Submit your Business EIN, a research-use declaration, and basic account details. Most applications are reviewed within one business day.',
  },
  {
    icon: Search,
    step: '02',
    title: 'Browse the Catalog & Request Pricing',
    desc: 'Once verified, review our full catalog of 50+ research compounds and request tiered wholesale pricing based on your expected order volume.',
  },
  {
    icon: MessageCircle,
    step: '03',
    title: 'Place Your Order',
    desc: 'Confirm your order via WhatsApp, email, or your account manager. Payment is accepted via ACH, wire transfer, or corporate card — Net-30 terms available for established accounts.',
  },
  {
    icon: Truck,
    step: '04',
    title: 'Priority Domestic Shipping',
    desc: 'Orders are dispatched within 1–2 business days of payment confirmation, with a batch-matched Certificate of Analysis included in every shipment.',
  },
];

const stepsEs = [
  {
    icon: FileText,
    step: '01',
    title: 'Solicitar una Cuenta al Por Mayor',
    desc: 'Envíe su EIN comercial, una declaración de uso en investigación y los datos básicos de su cuenta. La mayoría de las solicitudes se revisan en un día hábil.',
  },
  {
    icon: Search,
    step: '02',
    title: 'Explorar el Catálogo y Solicitar Precios',
    desc: 'Una vez verificado, consulte nuestro catálogo completo de más de 50 compuestos y solicite tarifas mayoristas escalonadas según su volumen de pedido previsto.',
  },
  {
    icon: MessageCircle,
    step: '03',
    title: 'Realizar su Pedido',
    desc: 'Confirme su pedido por WhatsApp, correo electrónico o mediante su gestor de cuenta. Aceptamos pagos mediante ACH, transferencia o tarjeta corporativa (términos Net-30 disponibles).',
  },
  {
    icon: Truck,
    step: '04',
    title: 'Envío Nacional Prioritario',
    desc: 'Los pedidos se despachan dentro de 1–2 días hábiles tras la confirmación del pago, con un Certificado de Análisis verificado incluido en cada envío.',
  },
];

export default function WholesaleOrderingProcess({ locationName }: WholesaleOrderingProcessProps) {
  const locale = useLocale();
  const isEs = locale === 'es';
  const steps = isEs ? stepsEs : stepsEn;

  return (
    <section className="space-y-8">
      <FadeIn>
        <h2 className="text-2xl md:text-3xl font-dm-sans font-light text-black tracking-[-0.03em] mb-4">
          {isEs 
            ? `Proceso de Pedidos al Por Mayor para Compradores de ${locationName}` 
            : `Wholesale Ordering Process for ${locationName} Buyers`}
        </h2>
        <p className="text-black/60 leading-relaxed max-w-3xl mb-8">
          {isEs
            ? 'Abrir una cuenta al por mayor con 99 Purity Wholesale es un proceso sencillo de cuatro pasos, desde la solicitud inicial hasta su primer pedido con envío prioritario.'
            : 'Opening a wholesale account with 99 Purity Wholesale is a straightforward four-step process, from initial application to your first priority-shipped order.'}
        </p>
      </FadeIn>
      <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {steps.map((s) => (
          <StaggerItem key={s.step} className="bg-white border border-black/5 rounded-[1.25rem] p-6 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 text-[64px] font-dm-sans font-medium text-black/5 leading-none pointer-events-none">
              {s.step}
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#F3F5FA] border border-black/5 flex items-center justify-center mb-5 relative z-10">
              <s.icon className="w-5 h-5 text-[#0B6F7B]" />
            </div>
            <h3 className="text-sm font-dm-sans font-medium text-black uppercase tracking-wide mb-2 relative z-10">
              {s.title}
            </h3>
            <p className="text-black/55 text-xs leading-relaxed relative z-10">
              {s.desc}
            </p>
          </StaggerItem>
        ))}
      </StaggerContainer>
    </section>
  );
}
