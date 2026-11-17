'use client';

import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { FadeIn } from '@/components/shared/Motion';
import { useLocale } from 'next-intl';

interface CompoundSpotlightProps {
  heading: string;
  intro: string;
}

const compoundsEn = [
  {
    slug: 'semaglutide',
    name: 'Semaglutide',
    desc: 'A GLP-1 receptor agonist utilized in metabolic and glycemic research. We provide scalable bulk supply with verified amino acid sequences to support laboratory studies.',
    tags: ['Metabolic', 'GLP-1'],
  },
  {
    slug: 'tirzepatide',
    name: 'Tirzepatide',
    desc: 'A dual GIP/GLP-1 receptor agonist. Our USA-distributed Tirzepatide is synthesized to verified purity standards for cellular receptor signaling research.',
    tags: ['Dual-Agonist', 'Research'],
  },
  {
    slug: 'bpc-157',
    name: 'BPC-157',
    desc: 'Body Protection Compound-157 is utilized in regenerative and tissue repair studies. We supply research-grade BPC-157 to qualified research institutions nationwide.',
    tags: ['Regenerative', 'Gastric'],
  },
  {
    slug: 'retatrutide',
    name: 'Retatrutide',
    desc: 'A novel triple-agonist (GLP-1/GIP/GCG) utilized in metabolic research. Our Retatrutide enables researchers to conduct targeted receptor interaction studies.',
    tags: ['Triple-Agonist', 'Metabolic'],
  },
];

const compoundsEs = [
  {
    slug: 'semaglutide',
    name: 'Semaglutide',
    desc: 'Un agonista del receptor GLP-1 utilizado en la investigación metabólica y glucémica en EE. UU. Ofrecemos suministro a granel escalable con secuencias de aminoácidos verificadas para respaldar estudios de laboratorio.',
    tags: ['Metabólico', 'GLP-1'],
  },
  {
    slug: 'tirzepatide',
    name: 'Tirzepatide',
    desc: 'Un agonista dual de los receptores GIP/GLP-1. Nuestro Tirzepatide distribuido en EE. UU. se sintetiza bajo estándares de pureza verificados para la investigación de señalización de receptores celulares.',
    tags: ['Agonista Dual', 'Investigación'],
  },
  {
    slug: 'bpc-157',
    name: 'BPC-157',
    desc: 'El Body Protection Compound-157 se utiliza en estudios regenerativos y de reparación tisular. Suministramos BPC-157 de grado de investigación a instituciones cualificadas en todo el país.',
    tags: ['Regenerativo', 'Gástrico'],
  },
  {
    slug: 'retatrutide',
    name: 'Retatrutide',
    desc: 'Un triple agonista (GLP-1/GIP/GCG) utilizado en la modulación metabólica. Nuestro Retatrutide permite a los investigadores realizar estudios de interacción de receptores.',
    tags: ['Triple Agonista', 'Metabólico'],
  },
];

export default function CompoundSpotlight({ heading, intro }: CompoundSpotlightProps) {
  const locale = useLocale();
  const isEs = locale === 'es';
  const compounds = isEs ? compoundsEs : compoundsEn;

  return (
    <section id="popular-compounds" className="scroll-mt-36 bg-white border border-black/5 rounded-[1.75rem] p-8 md:p-12 shadow-sm">
      <FadeIn>
        <h2 className="text-3xl font-dm-sans font-light text-black tracking-[-0.03em] mb-6">
          {heading}
        </h2>
        <div className="prose prose-lg max-w-none text-black/70 leading-relaxed mb-10">
          <p>{intro}</p>
        </div>
      </FadeIn>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {compounds.map((c) => (
          <Link
            key={c.slug}
            href={`/products/${c.slug}`}
            className="group block bg-[#F3F5FA] border border-black/5 p-8 rounded-[1.25rem] hover:bg-black hover:text-white transition-all duration-500"
          >
            <div className="flex justify-between items-start mb-6">
              <h3 className="text-2xl font-dm-sans font-light tracking-[-0.03em] group-hover:text-[#0B6F7B] transition-colors">{c.name}</h3>
              <div className="w-10 h-10 rounded-full bg-white border border-black/5 flex items-center justify-center group-hover:border-[#0B6F7B]/30">
                <ArrowRight className="w-4 h-4 text-black" />
              </div>
            </div>
            <p className="text-sm leading-relaxed mb-6 group-hover:text-white/70">
              {c.desc}
            </p>
            <div className="flex flex-wrap gap-2">
              {c.tags.map((tag) => (
                <span key={tag} className="text-[10px] font-dm-mono uppercase tracking-widest bg-black/5 px-3 py-1.5 rounded-full group-hover:bg-white/10 group-hover:text-white">{tag}</span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
