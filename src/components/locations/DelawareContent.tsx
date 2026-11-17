'use client';

import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { FadeIn } from '@/components/shared/Motion';

interface DelawareContentProps {
  locale: string;
}

export default function DelawareContent({ locale }: DelawareContentProps) {
  const isEs = locale === 'es';

  if (isEs) {
    return (
      <div className="space-y-12 text-black/70 leading-relaxed">
        {/* A quién va dirigida esta página */}
        <FadeIn className="bg-white border border-black/5 rounded-[1.25rem] p-8 md:p-10 shadow-sm space-y-4">
          <h2 className="text-2xl md:text-3xl font-dm-sans font-light text-black tracking-[-0.03em]">
            A Quién Va Dirigida Esta Página
          </h2>
          <p>
            Esta página está diseñada para contactos de adquisición y operaciones de laboratorio que evalúan a un proveedor de péptidos para uso comercial o institucional, incluidos:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-black/80 font-semibold">
            <li>Laboratorios de investigación u organizaciones de investigación por contrato</li>
            <li>Distribuidores y revendedores que buscan una relación de suministro al por mayor</li>
            <li>Operaciones de formulación y fabricación que obtienen materia prima para su procesamiento</li>
            <li>Laboratorios de pruebas analíticas que necesitan material de referencia</li>
          </ul>
          <p className="pt-2">
            Si nos está evaluando como proveedor, vale la pena leer detenidamente las secciones a continuación sobre documentación, precios y verificación de cuenta.
          </p>
        </FadeIn>

        {/* Categorías de Productos */}
        <FadeIn className="bg-white border border-black/5 rounded-[1.25rem] p-8 md:p-10 shadow-sm space-y-4">
          <h2 className="text-2xl md:text-3xl font-dm-sans font-light text-black tracking-[-0.03em]">
            Categorías de Productos
          </h2>
          <p>
            Nuestro catálogo se organiza por categoría en lugar de ser una lista única no diferenciada. Las categorías actuales incluyen:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-black/80 font-semibold">
            <li>Péptidos de investigación metabólica y GLP-1</li>
            <li>Péptidos relacionados con factores de crecimiento y reparación</li>
            <li>Compuestos de investigación cosmética y dérmica</li>
            <li>Síntesis personalizada y a granel para cuentas con requisitos específicos de secuencia o cantidad</li>
          </ul>
          <p className="pt-2">
            Las listas completas, las cantidades disponibles y las especificaciones actuales se mantienen en el{' '}
            <Link href="/products" className="text-[#0B6F7B] hover:underline font-semibold">
              catálogo de productos
            </Link>{' '}
            en lugar de duplicarse aquí, ya que la disponibilidad del catálogo cambia con más frecuencia que esta página. Si su empresa necesita una secuencia, objetivo de pureza o volumen fuera del catálogo estándar, eso también se gestiona mediante síntesis personalizada y a granel — póngase en contacto a través de{' '}
            <Link href="/contact" className="text-[#0B6F7B] hover:underline font-semibold">
              ventas
            </Link>{' '}
            con la especificación.
          </p>
        </FadeIn>

        {/* Documentación de Calidad */}
        <FadeIn className="bg-white border border-black/5 rounded-[1.25rem] p-8 md:p-10 shadow-sm space-y-4">
          <h2 className="text-2xl md:text-3xl font-dm-sans font-light text-black tracking-[-0.03em]">
            Documentación de Calidad
          </h2>
          <p>
            Cada lote que vendemos se suministra con un certificado de análisis (COA) específico para ese lote, no con una hoja de especificaciones genérica. Los COA reflejan las pruebas de identidad y pureza realizadas mediante métodos HPLC y LC-MS, y los compradores pueden solicitar o revisar el COA relevante para cualquier lote a través de nuestra{' '}
            <Link href="/certificates-of-analysis" className="text-[#0B6F7B] hover:underline font-semibold">
              biblioteca de certificados de análisis
            </Link>.
          </p>
          <p>
            Entendemos que para un laboratorio o revendedor, el COA suele ser el factor decisivo en una compra — es lo que su propio proceso de control de calidad o los clientes intermedios solicitarán. Si necesita un COA antes de realizar el pedido para evaluarnos como proveedor, contacte a{' '}
            <Link href="/contact" className="text-[#0B6F7B] hover:underline font-semibold">
              ventas
            </Link>{' '}
            y mencione el producto o número de catálogo específico.
          </p>
        </FadeIn>

        {/* Precios al Por Mayor y Verificación de Cuenta */}
        <FadeIn className="bg-white border border-black/5 rounded-[1.25rem] p-8 md:p-10 shadow-sm space-y-4">
          <h2 className="text-2xl md:text-3xl font-dm-sans font-light text-black tracking-[-0.03em]">
            Precios al Por Mayor y Verificación de Cuenta
          </h2>
          <p>
            Los precios están estructurados por volumen y nivel de cuenta en lugar de publicarse como una tarifa plana minorista, ya que los precios a granel dependen de la cantidad, la combinación de productos y la frecuencia de los pedidos. Para ver los precios al por mayor, necesitará una cuenta aprobada.
          </p>
          <p>
            La apertura de una cuenta implica un breve paso de verificación — confirmamos que la empresa es una entidad legítima de investigación, distribución o fabricación antes de publicar los precios o habilitar el pago. Esto no es una barrera añadida por efecto; es parte de mantener la base de cuentas limitada a compradores B2B reales, por lo que los precios no figuran públicamente en esta página.
          </p>
          <p className="pt-2">
            Para comenzar:{' '}
            <Link href="/wholesale-application" className="text-[#0B6F7B] hover:underline font-semibold">
              solicite una cuenta mayorista
            </Link>. Una vez aprobada, su cuenta tendrá acceso a los precios mayoristas estándar y podrá solicitar cotizaciones formales para pedidos más grandes o recurrentes a través de ventas.
          </p>
        </FadeIn>

        {/* Pedidos y Cumplimiento */}
        <FadeIn className="bg-white border border-black/5 rounded-[1.25rem] p-8 md:p-10 shadow-sm space-y-4">
          <h2 className="text-2xl md:text-3xl font-dm-sans font-light text-black tracking-[-0.03em]">
            Pedidos y Cumplimiento
          </h2>
          <p>
            Una vez aprobada la cuenta, el proceso de pedido se realiza a través del catálogo estándar y el proceso de pago, con solicitudes de cotización disponibles para cantidades no estándar. Los envíos se realizan desde Estados Unidos a direcciones comerciales e institucionales.
          </p>
          <p>
            No publicamos plazos de entrega garantizados en esta página, ya que los tiempos de tránsito dependen del tamaño del pedido, el método de envío y el destino — su representante de cuenta puede darle una estimación específica al momento del pedido.
          </p>
        </FadeIn>

        {/* Solo para Uso en Investigación */}
        <FadeIn className="bg-amber-500/5 border border-amber-500/15 rounded-[1.25rem] p-8 md:p-10 space-y-4">
          <h2 className="text-2xl md:text-3xl font-dm-sans font-light text-amber-900 tracking-[-0.03em]">
            Solo para Uso en Investigación
          </h2>
          <p className="text-amber-950/80">
            Todos los productos vendidos por 99 Purity Wholesale están destinados únicamente a la investigación de laboratorio in vitro, pruebas analíticas y fines de fabricación. No son:
          </p>
          <ul className="list-disc pl-6 space-y-1 text-amber-950 font-semibold">
            <li>Para consumo humano</li>
            <li>Para uso veterinario</li>
            <li>Para uso diagnóstico o terapéutico</li>
            <li>Suplementos dietéticos</li>
          </ul>
          <p className="text-amber-950/80 pt-2">
            Los compradores son responsables de comprender y cumplir con las leyes y regulaciones aplicables a su caso de uso y jurisdicción, incluidas las aplicables a la compra, manipulación o reventa de productos químicos de investigación en Delaware. Esta sección se proporciona para mayor claridad sobre nuestros términos de venta y no es un asesoramiento legal; los compradores con preguntas de cumplimiento específicas para su empresa deben consultar a su propio asesor. Los términos completos están disponibles en nuestra{' '}
            <Link href="/compliance" className="text-amber-800 hover:underline font-bold">
              página de cumplimiento
            </Link>.
          </p>
        </FadeIn>

        {/* Contexto de Investigación y Fabricación en Delaware */}
        <FadeIn className="bg-white border border-black/5 rounded-[1.25rem] p-8 md:p-10 shadow-sm space-y-4">
          <h2 className="text-2xl md:text-3xl font-dm-sans font-light text-black tracking-[-0.03em]">
            Contexto de Investigación y Fabricación en Delaware
          </h2>
          <p>
            Delaware cuenta con una base consolidada de ciencias de la vida y fabricación química, impulsada por instituciones como el{' '}
            <a href="https://dbi.udel.edu/" target="_blank" rel="noopener noreferrer" className="text-[#0B6F7B] hover:underline font-semibold">
              Instituto de Biotecnología de Delaware
            </a>{' '}
            y la actividad de investigación conectada a la Universidad de Delaware, junto con una presencia histórica en la fabricación farmacéutica y de productos químicos especializados en el estado. Hacemos referencia a esto únicamente como contexto general del mercado — ninguna de estas organizaciones es cliente, socio o afiliado de 99 Purity Wholesale, y no reclamamos ninguna relación con ellas.
          </p>
          <p>
            Realizamos envíos a empresas e instituciones de investigación en todo Delaware, incluidos Wilmington, Newark, Dover y New Castle. El proceso de cuenta mayorista, la estructura de precios y la documentación descritos anteriormente son los mismos independientemente de la ciudad o condado de Delaware en el que opere su empresa — no hay un proceso separado por ubicación, solo una cuenta y un catálogo disponible en todo el estado.
          </p>
        </FadeIn>

        {/* Para Comenzar */}
        <FadeIn className="bg-[#0B6F7B]/5 border border-[#0B6F7B]/15 rounded-[1.25rem] p-8 md:p-10 space-y-4">
          <h2 className="text-2xl md:text-3xl font-dm-sans font-light text-black tracking-[-0.03em]">
            Para Comenzar
          </h2>
          <ul className="space-y-3 font-semibold">
            <li className="flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-[#0B6F7B]" />
              <span>Solicite una cuenta mayorista para acceder a los precios y realizar pedidos:{' '}
                <Link href="/wholesale-application" className="text-[#0B6F7B] hover:underline font-bold">
                  Solicitar ahora
                </Link>
              </span>
            </li>
            <li className="flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-[#0B6F7B]" />
              <span>¿Tiene preguntas primero?{' '}
                <Link href="/contact" className="text-[#0B6F7B] hover:underline font-bold">
                  Contacte a ventas
                </Link>{' '}
                para hablar sobre las necesidades de su empresa antes de presentar la solicitud.
              </span>
            </li>
            <li className="flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-[#0B6F7B]" />
              <span>¿Quiere ver la gama de productos?{' '}
                <Link href="/products" className="text-[#0B6F7B] hover:underline font-bold">
                  Ver el catálogo de investigación
                </Link>
              </span>
            </li>
            <li className="flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-[#0B6F7B]" />
              <span>¿Necesita verificar un lote?{' '}
                <Link href="/certificates-of-analysis" className="text-[#0B6F7B] hover:underline font-bold">
                  Revisar la biblioteca de COA
                </Link>
              </span>
            </li>
          </ul>
        </FadeIn>
      </div>
    );
  }

  return (
    <div className="space-y-12 text-black/70 leading-relaxed">
      {/* Who This Page Is For */}
      <FadeIn className="bg-white border border-black/5 rounded-[1.25rem] p-8 md:p-10 shadow-sm space-y-4">
        <h2 className="text-2xl md:text-3xl font-dm-sans font-light text-black tracking-[-0.03em]">
          Who This Page Is For
        </h2>
        <p>
          This page is built for procurement and lab-operations contacts evaluating a peptide supplier for business or institutional use, including:
        </p>
        <ul className="list-disc pl-6 space-y-2 text-black/80 font-semibold">
          <li>Research laboratories and contract research organizations</li>
          <li>Distributors and resellers seeking a wholesale supply relationship</li>
          <li>Compounding and manufacturing operations sourcing raw material for further processing</li>
          <li>Analytical testing labs that need reference material</li>
        </ul>
        <p className="pt-2">
          If you're evaluating us as a supplier, the sections below on documentation, pricing, and account verification are the ones worth reading closely.
        </p>
      </FadeIn>

      {/* Product Categories */}
      <FadeIn className="bg-white border border-black/5 rounded-[1.25rem] p-8 md:p-10 shadow-sm space-y-4">
        <h2 className="text-2xl md:text-3xl font-dm-sans font-light text-black tracking-[-0.03em]">
          Product Categories
        </h2>
        <p>
          Our catalog is organized by category rather than as a single undifferentiated list. Current categories include:
        </p>
        <ul className="list-disc pl-6 space-y-2 text-black/80 font-semibold">
          <li>GLP-1 and metabolic research peptides</li>
          <li>Growth factor and repair-related peptides</li>
          <li>Cosmetic and dermal research compounds</li>
          <li>Custom and bulk synthesis for accounts with specific sequence or quantity requirements</li>
        </ul>
        <p className="pt-2">
          Full listings, available quantities, and current specifications are maintained on the{' '}
          <Link href="/products" className="text-[#0B6F7B] hover:underline font-semibold">
            product catalog
          </Link>{' '}
          rather than duplicated here, since catalog availability changes more often than this page does. If your business needs a sequence, purity target, or volume outside the standard catalog, that's handled through custom and bulk synthesis as well — reach out through{' '}
          <Link href="/contact" className="text-[#0B6F7B] hover:underline font-semibold">
            sales
          </Link>{' '}
          with the specification.
        </p>
      </FadeIn>

      {/* Quality Documentation */}
      <FadeIn className="bg-white border border-black/5 rounded-[1.25rem] p-8 md:p-10 shadow-sm space-y-4">
        <h2 className="text-2xl md:text-3xl font-dm-sans font-light text-black tracking-[-0.03em]">
          Quality Documentation
        </h2>
        <p>
          Every batch we sell is supplied with a certificate of analysis (COA) specific to that lot, not a generic specification sheet. COAs reflect identity and purity testing performed using HPLC and LC-MS methods, and buyers can request or review the relevant COA for any batch through our{' '}
          <Link href="/certificates-of-analysis" className="text-[#0B6F7B] hover:underline font-semibold">
            certificate of analysis library
          </Link>.
        </p>
        <p>
          We understand that for a lab or reseller, the COA is often the deciding factor in a purchase — it's what your own QA process or downstream customers will ask for. If you need a COA in advance of ordering to evaluate us as a supplier, contact{' '}
          <Link href="/contact" className="text-[#0B6F7B] hover:underline font-semibold">
            sales
          </Link>{' '}
          and reference the specific product or catalog number.
        </p>
      </FadeIn>

      {/* Wholesale Pricing and Account Verification */}
      <FadeIn className="bg-white border border-black/5 rounded-[1.25rem] p-8 md:p-10 shadow-sm space-y-4">
        <h2 className="text-2xl md:text-3xl font-dm-sans font-light text-black tracking-[-0.03em]">
          Wholesale Pricing and Account Verification
        </h2>
        <p>
          Pricing is structured for volume and account tier rather than published as a flat retail rate, since bulk pricing depends on quantity, product mix, and order frequency. To see wholesale pricing, you'll need an approved account.
        </p>
        <p>
          Opening an account involves a short verification step — we confirm the business is a legitimate research, distribution, or manufacturing entity before releasing pricing or enabling checkout. This isn't a barrier we'wide added for effect; it's part of keeping the account base limited to actual B2B buyers, which is also why pricing isn't listed publicly on this page.
        </p>
        <p className="pt-2">
          To start:{' '}
          <Link href="/wholesale-application" className="text-[#0B6F7B] hover:underline font-semibold">
            apply for a wholesale account
          </Link>. Once approved, your account has access to standard wholesale pricing and can request formal quotes for larger or recurring orders through sales.
        </p>
      </FadeIn>

      {/* Ordering and Fulfillment */}
      <FadeIn className="bg-white border border-black/5 rounded-[1.25rem] p-8 md:p-10 shadow-sm space-y-4">
        <h2 className="text-2xl md:text-3xl font-dm-sans font-light text-black tracking-[-0.03em]">
          Ordering and Fulfillment
        </h2>
        <p>
          Once an account is approved, ordering runs through the standard catalog and checkout process, with quote requests available for non-standard quantities. Shipments ship from within the United States to business and institutional addresses.
        </p>
        <p>
          We don't publish guaranteed delivery windows on this page, since transit times depend on order size, shipping method, and destination — your account rep can give you a specific estimate at the time of order.
        </p>
      </FadeIn>

      {/* Research Use Only */}
      <FadeIn className="bg-amber-500/5 border border-amber-500/15 rounded-[1.25rem] p-8 md:p-10 shadow-sm space-y-4">
        <h2 className="text-2xl md:text-3xl font-dm-sans font-light text-amber-900 tracking-[-0.03em]">
          Research Use Only
        </h2>
        <p className="text-amber-950/80">
          All products sold by 99 Purity Wholesale are intended for in-vitro laboratory research, analytical testing, and manufacturing purposes only. They are:
        </p>
        <ul className="list-disc pl-6 space-y-1 text-amber-950 font-semibold">
          <li>Not for human consumption</li>
          <li>Not for veterinary use</li>
          <li>Not intended for diagnostic or therapeutic use</li>
          <li>Not dietary supplements</li>
        </ul>
        <p className="text-amber-950/80 pt-2">
          Buyers are responsible for understanding and complying with the laws and regulations applicable to their use case and jurisdiction, including any applicable to research chemical purchase, handling, or resale in Delaware. This section is provided for clarity about our sales terms and is not legal advice; buyers with compliance questions specific to their business should consult their own counsel. Full terms are available on our{' '}
          <Link href="/compliance" className="text-amber-800 hover:underline font-bold">
            compliance page
          </Link>.
        </p>
      </FadeIn>

      {/* Delaware Research and Manufacturing Context */}
      <FadeIn className="bg-white border border-black/5 rounded-[1.25rem] p-8 md:p-10 shadow-sm space-y-4">
        <h2 className="text-2xl md:text-3xl font-dm-sans font-light text-black tracking-[-0.03em]">
          Delaware Research and Manufacturing Context
        </h2>
        <p>
          Delaware has an established life-science and chemical-manufacturing base, anchored by institutions like the{' '}
          <a href="https://dbi.udel.edu/" target="_blank" rel="noopener noreferrer" className="text-[#0B6F7B] hover:underline font-semibold">
            Delaware Biotechnology Institute
          </a>{' '}
          and research activity connected to the University of Delaware, along with a long-standing pharmaceutical and specialty-chemical manufacturing presence in the state. We reference this only as general market context — none of these organizations are customers, partners, or affiliates of 99 Purity Wholesale, and we don't claim any relationship with them.
        </p>
        <p>
          We ship to businesses and research organizations throughout Delaware, including in Wilmington, Newark, Dover, and New Castle. The wholesale account process, pricing structure, and documentation described above are the same regardless of which Delaware city or county your business operates in — there's no separate process by location, just one account and one catalog available statewide.
        </p>
      </FadeIn>

      {/* Get Started */}
      <FadeIn className="bg-[#0B6F7B]/5 border border-[#0B6F7B]/15 rounded-[1.25rem] p-8 md:p-10 shadow-sm space-y-4">
        <h2 className="text-2xl md:text-3xl font-dm-sans font-light text-black tracking-[-0.03em]">
          Get Started
        </h2>
        <ul className="space-y-3 font-semibold">
          <li className="flex items-center gap-2">
            <ArrowRight className="w-4 h-4 text-[#0B6F7B]" />
            <span>Apply for a wholesale account to access pricing and place orders:{' '}
              <Link href="/wholesale-application" className="text-[#0B6F7B] hover:underline font-bold">
                Apply now
              </Link>
            </span>
          </li>
          <li className="flex items-center gap-2">
            <ArrowRight className="w-4 h-4 text-[#0B6F7B]" />
            <span>Have questions first?{' '}
              <Link href="/contact" className="text-[#0B6F7B] hover:underline font-bold">
                Contact sales
              </Link>{' '}
              to talk through your business's needs before applying.
            </span>
          </li>
          <li className="flex items-center gap-2">
            <ArrowRight className="w-4 h-4 text-[#0B6F7B]" />
            <span>Want to see the product range?{' '}
              <Link href="/products" className="text-[#0B6F7B] hover:underline font-bold">
                View the research catalog
              </Link>
            </span>
          </li>
          <li className="flex items-center gap-2">
            <ArrowRight className="w-4 h-4 text-[#0B6F7B]" />
            <span>Need to verify a batch?{' '}
              <Link href="/certificates-of-analysis" className="text-[#0B6F7B] hover:underline font-bold">
                Review the COA library
              </Link>
            </span>
          </li>
        </ul>
      </FadeIn>
    </div>
  );
}
