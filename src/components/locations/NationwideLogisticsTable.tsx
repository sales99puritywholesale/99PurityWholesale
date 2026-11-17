'use client';

import React from 'react';
import { FadeIn } from '@/components/shared/Motion';
import { useLocale } from 'next-intl';

const rowsEn = [
  { region: 'Northeast', states: 'NY, MA, PA, NJ, CT', time: '2-3 Business Days', support: 'Direct Route Access' },
  { region: 'Southeast', states: 'FL, GA, NC, VA, TN', time: '2-4 Business Days', support: 'High Volume Hub' },
  { region: 'Midwest', states: 'IL, OH, MI, IN, WI', time: '3-4 Business Days', support: 'Centralized Routing' },
  { region: 'Southwest', states: 'TX, AZ, NV, NM, OK', time: '2-4 Business Days', support: 'Climate-Controlled Priority' },
  { region: 'West Coast', states: 'CA, WA, OR, CO, UT', time: '2-3 Business Days', support: 'Expedited Air Freight' },
  { region: 'Non-Contiguous', states: 'HI, AK', time: '4-6 Business Days', support: 'Specialized Handling' },
];

const rowsEs = [
  { region: 'Noreste', states: 'NY, MA, PA, NJ, CT', time: '2-3 Días Hábiles', support: 'Acceso a Ruta Directa' },
  { region: 'Sudeste', states: 'FL, GA, NC, VA, TN', time: '2-4 Días Hábiles', support: 'Centro de Alto Volumen' },
  { region: 'Medio Oeste', states: 'IL, OH, MI, IN, WI', time: '3-4 Días Hábiles', support: 'Enrutamiento Centralizado' },
  { region: 'Sudoeste', states: 'TX, AZ, NV, NM, OK', time: '2-4 Días Hábiles', support: 'Prioridad Climatizada' },
  { region: 'Costa Oeste', states: 'CA, WA, OR, CO, UT', time: '2-3 Días Hábiles', support: 'Carga Aérea Acelerada' },
  { region: 'No Contiguos', states: 'HI, AK', time: '4-6 Días Hábiles', support: 'Manejo Especializado' },
];

interface NationwideLogisticsTableProps {
  heading?: string;
  intro?: string;
}

export default function NationwideLogisticsTable({
  heading,
  intro,
}: NationwideLogisticsTableProps) {
  const locale = useLocale();
  const isEs = locale === 'es';

  const defaultHeading = isEs
    ? 'Marco Nacional de Logística y Distribución'
    : 'Nationwide Logistics & Distribution Framework';

  const defaultIntro = isEs
    ? 'Nuestra arquitectura de distribución está diseñada para minimizar los tiempos de tránsito y proteger la estabilidad molecular de nuestros compuestos. Al procesar los pedidos de manera estratégica y utilizar protocolos especializados de cadena de frío cuando es necesario, garantizamos entregas rápidas y seguras en los 50 estados. A continuación se detalla nuestro esquema estándar de distribución regional para clientes mayoristas.'
    : 'Our distribution architecture is designed to minimize transit times and protect the molecular stability of our compounds. By strategically processing orders and utilizing specialized cold-chain protocols when necessary, we provide rapid, reliable delivery to all 50 states. Below is our standard regional distribution breakdown for wholesale clients.';

  const rows = isEs ? rowsEs : rowsEn;

  return (
    <section className="space-y-8">
      <FadeIn>
        <h2 className="text-3xl font-dm-sans font-light text-black tracking-[-0.03em] mb-6">
          {heading || defaultHeading}
        </h2>
        <p className="text-black/70 leading-relaxed mb-8 max-w-4xl">
          {intro || defaultIntro}
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-[#0B0D10] text-white">
                <th className="py-5 px-6 font-dm-mono text-[10px] uppercase tracking-widest rounded-tl-2xl">
                  {isEs ? 'Región' : 'Region'}
                </th>
                <th className="py-5 px-6 font-dm-mono text-[10px] uppercase tracking-widest">
                  {isEs ? 'Estados Clave Atendidos' : 'Key States Served'}
                </th>
                <th className="py-5 px-6 font-dm-mono text-[10px] uppercase tracking-widest">
                  {isEs ? 'Tiempo Estimado de Tránsito' : 'Est. Transit Time'}
                </th>
                <th className="py-5 px-6 font-dm-mono text-[10px] uppercase tracking-widest rounded-tr-2xl">
                  {isEs ? 'Soporte Prioritario' : 'Priority Support'}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white border-b border-l border-r border-black/5">
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-black/5 hover:bg-[#F3F5FA] transition-colors">
                  <td className="py-5 px-6 font-dm-sans font-medium text-sm uppercase tracking-wider">{row.region}</td>
                  <td className="py-5 px-6 text-sm text-black/60">{row.states}</td>
                  <td className="py-5 px-6 text-sm text-black/80 font-semibold">{row.time}</td>
                  <td className="py-5 px-6 font-dm-mono text-[10px] uppercase tracking-widest text-[#0B6F7B]">{row.support}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </FadeIn>
    </section>
  );
}
