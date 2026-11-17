'use client';

import React from 'react';
import { Link } from '@/i18n/routing';
import { FadeIn } from '@/components/shared/Motion';
import { useLocale } from 'next-intl';

export default function QualityStandardsSection({ locationSlug }: { locationSlug?: string }) {
  const locale = useLocale();
  const isEs = locale === 'es';
  const isAlabama = locationSlug === 'alabama';
  const isAlaska = locationSlug === 'alaska';
  const isArizona = locationSlug === 'arizona';
  const isArkansas = locationSlug === 'arkansas';

  if (isEs) {
    return (
      <>
        {/* Solid-Phase Peptide Synthesis (SPPS) - ES */}
        <section className="bg-white border border-black/5 rounded-[1.75rem] p-8 md:p-12 shadow-sm">
          <FadeIn>
            <h2 className="text-3xl font-dm-sans font-light text-black tracking-[-0.03em] mb-6">
              Síntesis Avanzada de Péptidos en Fase Sólida (SPPS)
            </h2>
            <div className="prose prose-lg max-w-none text-black/70 leading-relaxed">
              <p className="mb-4">
                {isAlabama ? (
                  <>La integridad estructural de un péptido de investigación depende fundamentalmente de su proceso de síntesis. En 99 Purity Wholesale, nuestros compuestos se producen utilizando síntesis de péptidos en fase sólida (SPPS) de última generación con química FMOC (fluorenilmetiloxicarbonilo). Este método constituye el estándar de referencia en ingeniería bioquímica, permitiendo la construcción rápida y controlada de cadenas de aminoácidos complejas sin reacciones secundarias ni errores de plegado.</>
                ) : isAlaska ? (
                  <>Para que los péptidos de investigación proporcionen resultados reproducibles, su estructura molecular debe controlarse con precisión desde la síntesis. Fabricamos nuestros compuestos mediante síntesis en fase sólida (SPPS) utilizando química FMOC. Esta metodología es el estándar en bioingeniería, facilitando el ensamblaje de cadenas de aminoácidos estructuradas y previniendo errores de secuencia o fallos en el plegado molecular.</>
                ) : isArizona ? (
                  <>La reproducibilidad de los ensayos clínicos requiere péptidos de investigación con una estructura molecular impecable desde el inicio de su síntesis. 99 Purity Wholesale utiliza síntesis de péptidos en fase sólida (SPPS) controlada por química FMOC. Esta técnica destaca como el método principal en síntesis bioquímica, permitiendo ensamblar cadenas de aminoácidos de forma rápida y controlada, sin reacciones cruzadas ni impurezas estructurales.</>
                ) : (
                  <>La integridad estructural de un péptido de investigación depende enteramente de la precisión de su síntesis. En 99 Purity Wholesale, nuestros compuestos se fabrican mediante síntesis de péptidos en fase sólida (SPPS) de última generación utilizando química FMOC (fluorenilmetiloxicarbonilo). Esta metodología representa el estándar de oro en ingeniería bioquímica, permitiendo el ensamblaje rápido y estrictamente controlado de cadenas largas de aminoácidos sin riesgo de reacciones secundarias no deseadas o errores de plegamiento estructural.</>
                )}
              </p>
              <p className="mb-4">
                {isAlabama ? (
                  <>A diferencia de las técnicas de síntesis en fase líquida convencionales, la SPPS fija el extremo C-terminal de la cadena peptídica a un soporte de resina insoluble. Al introducir cada aminoácido, el grupo protector FMOC se elimina brevemente para permitir la formación de un enlace covalente preciso. Este proceso se repite minuciosamente hasta obtener la secuencia exacta. Para secuencias complejas como Tirzepatide, este entorno estructurado es indispensable para un perfil molecular impecable.</>
                ) : isAlaska ? (
                  <>A diferencia de los métodos en fase líquida tradicionales, la SPPS ancla la secuencia en desarrollo directamente a una resina sólida insoluble. Con cada nueva adición, se libera el grupo protector FMOC para dar paso a un enlace covalente específico. La repetición controlada de este ciclo genera la estructura exacta deseada. En péptidos de cadena larga como Tirzepatide, este soporte rígido es esencial para conservar el diseño molecular intacto.</>
                ) : isArizona ? (
                  <>Frente a los procesos en fase líquida obsoletos, el método SPPS fija el extremo C-terminal del péptido a una resina insoluble. La eliminación temporal del grupo protector FMOC antes de cada acoplamiento asegura que cada aminoácido forme un enlace peptídico altamente específico. Repetimos este ciclo de forma automatizada para lograr la secuencia exacta, algo crucial en péptidos complejos de 39 aminoácidos como Tirzepatide para asegurar su pureza.</>
                ) : (
                  <>A diferencia de los métodos anticuados de síntesis en fase líquida, la SPPS ancla el extremo C-terminal de la cadena peptídica en crecimiento a un soporte de resina insoluble. A medida que se introduce cada aminoácido subsiguiente, el grupo protector FMOC se retira temporalmente, lo que permite la formación de un enlace covalente altamente específico. Este ciclo se repite con meticulosa precisión hasta lograr la secuencia molecular exacta deseada. Para secuencias complejas como <Link href="/products/tirzepatide" className="text-[#0B6F7B] hover:underline font-semibold">Tirzepatide</Link> (que consta de 39 aminoácidos individuales), este entorno controlado es la única manera de garantizar un perfil molecular intachable.</>
                )}
              </p>
              <p className="mb-4">
                {isAlabama ? (
                  <>Además, la estereoquímica es crucial para la afinidad de unión celular. Los receptores biológicos son altamente sensibles a la disposición espacial de los átomos. Nuestros protocolos aplican estrictamente los L-isómeros biológicamente activos (salvo especificación en contrario), asegurando que el compuesto resultante imite las señales biológicas nativas. Tras la síntesis, el péptido se escinde de la resina y se purifica para eliminar impurezas y subproductos, ofreciendo un compuesto estéril optimizado para laboratorio.</>
                ) : isAlaska ? (
                  <>Asimismo, la afinidad celular depende de la estereoquímica espacial, dado que los receptores son muy sensibles a la orientación atómica. Empleamos L-isómeros activos para que los compuestos emulen las señales biológicas nativas. Una vez sintetizado el péptido, se separa de la resina y se somete a purificación cromatográfica para descartar fragmentos incompletos y sales reactivas, entregando un compuesto puro listo para ensayos de laboratorio.</>
                ) : isArizona ? (
                  <>La precisión estereoquímica determina la afinidad de unión a los receptores celulares, los cuales discriminan la disposición espacial molecular. Incorporamos L-isómeros activos (salvo diseño específico de D-isómeros) para garantizar que el péptido de investigación replique las interacciones biológicas deseadas. Tras el ensamblaje, el producto se escinde y purifica para eliminar sales y secuencias incompletas, logrando un compuesto puro al ≥99% para pruebas analíticas.</>
                ) : (
                  <>Además, la estereoquímica desempeña un papel crucial en la afinidad de unión celular. Los receptores biológicos son muy sensibles a la disposición espacial de los átomos. Nuestros protocolos de síntesis utilizan estrictamente los L-isómeros biológicamente activos (a menos que la secuencia requiera específicamente un D-isómero), asegurando que el compuesto resultante imite a la perfección las señales biológicas endógenas. Tras la síntesis, el péptido se escinde de la resina y se somete a una rigurosa purificación para eliminar cadenas incompletas, aminoácidos libres y subproductos de síntesis como las sales de ácido trifluoroacético (TFA). El resultado es un compuesto estéril y de máxima pureza listo para la experimentación in vitro.</>
                )}
              </p>
            </div>
          </FadeIn>
        </section>

        {/* Lyophilization & Cold Chain Integrity - ES */}
        <section className="bg-[#F3F5FA] border border-black/5 rounded-[1.75rem] p-8 md:p-12 shadow-sm">
          <FadeIn>
            <h2 className="text-3xl font-dm-sans font-light text-black tracking-[-0.03em] mb-6">
              Protocolos de Liofilización y Estabilización Molecular
            </h2>
            <div className="prose prose-lg max-w-none text-black/70 leading-relaxed">
              <p className="mb-4">
                {isAlabama ? (
                  <>La pureza inicial del péptido se ve comprometida si se degrada durante el transporte. Las soluciones acuosas son propensas a la hidrólisis, oxidación y descomposición enzimática rápida. Para detener este proceso, todos los compuestos de 99 Purity Wholesale se liofilizan antes de salir de nuestras instalaciones.</>
                ) : isAlaska ? (
                  <>Un alto nivel de pureza en el laboratorio de síntesis no sirve si ocurre degradación en el trayecto. En estado líquido, los péptidos se descomponen rápidamente por oxidación e hidrólisis. Para evitarlo, los compuestos de 99 Purity Wholesale pasan por un ciclo de liofilización al vacío antes de ser despachados.</>
                ) : isArizona ? (
                  <>La pureza del péptido sintetizado pierde su valor si el compuesto se degrada durante el envío. Debido a que las soluciones líquidas facilitan la hidrólisis y descomposición molecular, 99 Purity Wholesale liofiliza cada producto antes de su envío.</>
                ) : (
                  <>La pureza de un péptido en el punto de síntesis carece de valor si se degrada durante el transporte. Los péptidos en soluciones acuosas son sumamente susceptibles a la hidrólisis, la oxidación y la degradación enzimática rápida. Para detener estos procesos por completo, todos los compuestos distribuidos por 99 Purity Wholesale se someten a un minucioso proceso de liofilización (secado por congelación) antes de salir del laboratorio.</>
                )}
              </p>
              <p className="mb-4">
                {isAlabama ? (
                  <>La liofilización es un proceso termodinámico avanzado. La solución se congela a temperaturas muy bajas, solidificando el agua. Luego se aplica vacío y se eleva la temperatura paulatinamente para sublimar el hielo directamente a gas. Esto genera una pastilla estable y porosa sin humedad. Al eliminar el agua, el péptido entra en un estado deshidratado de suspensión estable a temperatura ambiente.</>
                ) : isAlaska ? (
                  <>Este procedimiento congela la solución purificada a temperaturas extremas para convertir la humedad en hielo. Bajo vacío profundo, la temperatura se regula para lograr la sublimación directa del hielo a gas. El resultado es un compuesto poroso y seco. Al no haber agua libre, se detienen las reacciones de degradación, permitiendo que el péptido se conserve estable por largos periodos sin refrigeración continua.</>
                ) : isArizona ? (
                  <>Esta técnica deshidrata la solución congelando el agua a temperaturas ultra-bajas. Posteriormente, mediante un vacío controlado y un aumento gradual de temperatura, el hielo se sublima directamente a gas. El producto final es una pastilla seca y estable. Sin agua que actúe como catalizador químico, el péptido se conserva en un estado de suspensión que tolera la temperatura ambiente durante el transporte.</>
                ) : (
                  <>La liofilización es un proceso termodinámico complejo. La solución purificada de péptidos se congela inicialmente a temperaturas ultrabajas, convirtiendo el contenido de agua en hielo sólido. A continuación se aplica un vacío profundo y la temperatura se eleva cuidadosamente. Esto permite que el hielo se sublime, pasando directamente del estado sólido al gaseoso sin transitar por la fase líquida. El producto resultante es una pastilla sólida porosa y estable, totalmente desprovista de humedad. Dado que la degradación biológica requiere agua como catalizador, este estado deshidratado sitúa eficazmente al péptido en suspensión temporal, permitiéndole permanecer altamente estable durante períodos prolongados, incluso a temperatura ambiente.</>
                )}
              </p>
              <p className="mb-4">
                {isAlabama ? (
                  <>Como protección adicional durante la liofilización, incorporamos Manitol de grado médico como lyoprotector y agente de carga. El manitol evita la cristalización destructiva y favorece una disolución rápida con agua bacteriostática. En envíos durante la temporada de calor o para compuestos delicados, aplicamos embalaje térmico especial para mantener la cadena de custodia y la integridad del lote.</>
                ) : isAlaska ? (
                  <>Para resguardar la estructura molecular durante el secado, añadimos Manitol como crioprotector. Esto previene daños por cristales y facilita la disolución al reconstituir con agua bacteriostática. Para envíos destinados a zonas no contiguas o de tránsito complejo, nuestro sistema logístico incorpora protección térmica reforzada para asegurar que el compuesto llegue en perfectas condiciones.</>
                ) : isArizona ? (
                  <>Para evitar la degradación estructural en el secado, empleamos Manitol de grado médico como protector. El manitol evita la formación de cristales que dañen el péptido y asegura una reconstitución inmediata con agua bacteriostática. En los envíos a Arizona durante los meses de verano, incluimos de forma automática aislamiento térmico y acumuladores de frío para contrarrestar las temperaturas extremas en ruta.</>
                ) : (
                  <>Para proteger aún más la frágil estructura molecular durante las fases de congelación y secado, utilizamos Manitol de grado médico como lio-protector y agente de carga. El manitol forma una matriz amorfa alrededor del péptido, evitando la formación de cristales de hielo dañinos y garantizando una disolución rápida y completa cuando el investigador reconstituye el compuesto con <Link href="/products/bac-water" className="text-[#0B6F7B] hover:underline font-semibold">agua bacteriostática</Link>. Para compuestos especialmente frágiles o rutas de tránsito extremas durante los meses de verano, nuestra red logística nacional devuelve automáticamente los envíos a protocolos especializados de cadena de frío, utilizando embalajes isotérmicos y regulación térmica focalizada para garantizar que la integridad molecular nunca se vea comprometida.</>
                )}
              </p>
            </div>
          </FadeIn>
        </section>

        {/* Strict "Research Use Only" (RUO) Compliance - ES */}
        <section className="bg-white border border-black/5 rounded-[1.75rem] p-8 md:p-12 shadow-sm">
          <FadeIn>
            <h2 className="text-3xl font-dm-sans font-light text-black tracking-[-0.03em] mb-6">
              Cumplimiento Estricto de &quot;Solo para Uso en Investigación&quot; (RUO) y Normativa Federal
            </h2>
            <div className="prose prose-lg max-w-none text-black/70 leading-relaxed">
              <p className="mb-4">
                {isAlabama ? (
                  <>El entorno regulatorio sobre la distribución de reactivos químicos en EE. UU. es complejo y estricto. Es fundamental que los compradores entiendan la diferencia entre principios activos clínicos (API) y productos exclusivos para investigación (RUO). Operamos únicamente bajo la categoría RUO.</>
                ) : isAlaska ? (
                  <>Las normas que regulan los reactivos bioquímicos en los Estados Unidos son estrictas y supervisadas. Las entidades de compra deben diferenciar entre principios activos farmacéuticos (API) para uso clínico y sustancias clasificadas exclusivamente para uso en investigación (RUO). 99 Purity Wholesale comercializa sus productos bajo esta última norma.</>
                ) : isArizona ? (
                  <>La distribución de reactivos de investigación en EE. UU. se rige por marcos regulatorios estrictos. Los departamentos de compras deben reconocer la diferencia entre compuestos activos farmacéuticos clínicos (API) y materiales destinados únicamente para investigación (RUO). 99 Purity Wholesale opera exclusivamente dentro del canal RUO.</>
                ) : (
                  <>El <Link href="/compliance" className="text-[#0B6F7B] hover:underline font-semibold">marco regulatorio</Link> que rige la distribución bioquímica en los Estados Unidos es complejo y de estricta aplicación. Es imperativo que los compradores institucionales comprendan la distinción entre los principios activos farmacéuticos (API) destinados al uso clínico y los productos químicos clasificados como &quot;Solo para Uso en Investigación&quot; (RUO). 99 Purity Wholesale opera exclusivamente bajo el marco de RUO.</>
                )}
              </p>
              <p className="mb-4">
                {isAlabama ? (
                  <>Las directrices federales establecen que los compuestos RUO se destinan exclusivamente a ensayos in vitro de laboratorio y estudios analíticos. No están autorizados para consumo humano, aplicaciones terapéuticas ni diagnósticos clínicos. Son materias primas bioquímicas que no han pasado por las fases de ensayos clínicos necesarios para su aprobación farmacéutica.</>
                ) : isAlaska ? (
                  <>Conforme a las reglas de la FDA y reguladores federales, los péptidos RUO se suministran para análisis in vitro, pruebas de calibración y docencia en laboratorios. Queda excluido su uso para consumo humano, diagnóstico médico o ensayos clínicos. Se trata de compuestos crudos no formulados que no cuentan con aprobación para fines terapéuticos.</>
                ) : isArizona ? (
                  <>Las pautas de la FDA especifican que los productos RUO se venden para pruebas de laboratorio in vitro y desarrollo científico. No están aprobados para consumo humano o veterinario, diagnóstico clínico ni tratamiento médico. Son reactivos bioquímicos sin formular y no deben ser utilizados como medicamentos terminados.</>
                ) : (
                  <>Conforme a las directrices establecidas por la Administración de Alimentos y Medicamentos (FDA) y otros organismos reguladores federales, los productos químicos RUO están destinados estrictamente a la investigación de laboratorio in vitro, pruebas analíticas y fines educativos. NO están diseñados para el consumo humano, uso diagnóstico, aplicaciones terapéuticas ni ensayos clínicos con sujetos humanos. Nuestros compuestos son productos bioquímicos puros sin formular que no han sido sometidos a los extensos ensayos clínicos de varios años requeridos para la aprobación de la FDA como medicamento o dispositivo médico.</>
                )}
              </p>
              <p className="mb-4">
                {isAlabama ? (
                  <>Por cumplimiento normativo, no vendemos a particulares. Nuestro proceso de registro B2B exige verificación de EIN, dirección comercial y una declaración firmada del uso en investigación. Cualquier indicio de uso clínico o comercial indebido causará el cierre inmediato y permanente de la cuenta mayorista. Así protegemos a nuestros socios institucionales y a la comunidad científica.</>
                ) : isAlaska ? (
                  <>Para garantizar el cumplimiento de la ley, restringimos el acceso solo a laboratorios y profesionales verificados, excluyendo la venta al público. Solicitamos el número EIN, dirección física comercial y declaración escrita de uso científico. Si detectamos un uso ajeno a la investigación, cancelamos la cuenta del cliente de forma permanente. Este control resguarda el canal de suministro y la ética científica.</>
                ) : isArizona ? (
                  <>Por razones de cumplimiento legal, no realizamos ventas al por menor ni al público general. El registro de cuentas B2B requiere un número de EIN corporativo, dirección verificable y una declaración firmada de intención de investigación. El uso no autorizado de estos productos causa la suspensión definitiva de la cuenta de compras. Así protegemos la integridad de las investigaciones y a nuestra red de distribución.</>
                ) : (
                  <>Debido a nuestro compromiso absoluto con el cumplimiento normativo, no vendemos al público general. Nuestro <Link href="/wholesale-application" className="text-[#0B6F7B] hover:underline font-semibold">proceso de incorporación B2B</Link> requiere la verificación rigurosa de todos los clientes potenciales: solicitamos un Número de Identificación de Empleador (EIN) comercial válido, direcciones corporativas verificables y declaraciones juradas que confirmen el uso exclusivo en investigación. Cualquier indicio de uso indebido dará lugar a la cancelación inmediata y permanente de la cuenta mayorista. Al mantener este estándar inquebrantable, protegemos nuestra cadena de suministro, a nuestros socios institucionales y a la comunidad científica en general.</>
                )}
              </p>
            </div>
          </FadeIn>
        </section>
      </>
    );
  }

  return (
    <>
      {/* Solid-Phase Peptide Synthesis (SPPS) - EN */}
      <section className="bg-white border border-black/5 rounded-[1.75rem] p-8 md:p-12 shadow-sm">
        <FadeIn>
          <h2 className="text-3xl font-dm-sans font-light text-black tracking-[-0.03em] mb-6">
            Advanced Solid-Phase Peptide Synthesis (SPPS)
          </h2>
          <div className="prose prose-lg max-w-none text-black/70 leading-relaxed">
            <p className="mb-4">
              {isAlabama ? (
                <>The structural integrity of a research peptide relies fundamentally on its synthesis. At 99 Purity Wholesale, our compounds are produced using state-of-the-art Solid-Phase Peptide Synthesis (SPPS) with FMOC (Fluorenylmethyloxycarbonyl) chemistry. This method is the premier standard in biochemical engineering, enabling the rapid and tightly controlled construction of complex amino acid chains without unwanted side reactions or structural folding errors.</>
              ) : isAlaska ? (
                <>For research peptides to yield reproducible data, their structural integrity must be guaranteed at the atomic level during synthesis. We manufacture our compounds using advanced Solid-Phase Peptide Synthesis (SPPS) with FMOC (Fluorenylmethyloxycarbonyl) chemistry. This method serves as the standard in modern biochemical engineering, allowing us to build precise amino acid chains while eliminating synthesis errors or improper folding.</>
              ) : isArizona ? (
                <>Securing consistent experimental outcomes requires research peptides with perfect structural integrity from the start of synthesis. 99 Purity Wholesale utilizes state-of-the-art Solid-Phase Peptide Synthesis (SPPS) governed by FMOC (Fluorenylmethyloxycarbonyl) chemistry protocols. This technique is recognized as the leading standard in biochemical synthesis, permitting the highly controlled and rapid assembly of peptide sequences without secondary reactions or structural anomalies.</>
              ) : (
                <>The structural integrity of a research peptide is determined entirely by the precision of its synthesis. At 99 Purity Wholesale, our compounds are manufactured utilizing state-of-the-art Solid-Phase Peptide Synthesis (SPPS) employing FMOC (Fluorenylmethyloxycarbonyl) chemistry. This methodology represents the gold standard in biochemical engineering, allowing for the rapid, highly controlled assembly of long amino acid chains without the risk of unwanted side reactions or structural folding errors.</>
              )}
            </p>
            <p className="mb-4">
              {isAlabama ? (
                <>Unlike older liquid-phase synthesis techniques, SPPS secures the C-terminus of the growing peptide chain to an insoluble resin support. With the introduction of each subsequent amino acid, the FMOC protecting group is briefly removed, allowing a highly precise covalent bond to form. This process repeats meticulously until the exact molecular sequence is realized. For sophisticated sequences like Tirzepatide, this structured environment is essential for a flawless molecular profile.</>
              ) : isAlaska ? (
                <>Unlike legacy liquid-phase methodologies, SPPS anchors the C-terminus of the developing peptide sequence directly to a solid, insoluble resin. As each new amino acid is added, the FMOC protecting group is selectively cleared to allow a precise covalent bond to form. Repeating this cycle with absolute control yields the exact sequence required. For complex compounds like Tirzepatide, this rigid and structured environment is vital to maintaining a pristine molecular blueprint.</>
              ) : isArizona ? (
                <>In contrast to outdated liquid-phase methods, the SPPS process covalently anchors the growing peptide chain&apos;s C-terminus to an insoluble solid support. The temporary removal of the FMOC group before each addition ensures that each subsequent amino acid forms a highly specific peptide bond. We repeat this cycle meticulously to construct the exact sequence desired, which is critical for complex 39-amino-acid sequences like Tirzepatide to ensure a zero-defect purity profile.</>
              ) : (
                <>Unlike outdated liquid-phase synthesis methods, SPPS anchors the C-terminus of the growing peptide chain to an insoluble resin support. As each subsequent amino acid is introduced, the FMOC protecting group is temporarily removed, allowing for a highly specific covalent bond to form. This cycle is repeated with painstaking precision until the desired molecular sequence is achieved. For complex sequences like <Link href="/products/tirzepatide" className="text-[#0B6F7B] hover:underline font-semibold">Tirzepatide</Link> (which consists of 39 distinct amino acids), this controlled environment is the only way to guarantee a flawless molecular profile.</>
              )}
            </p>
            <p className="mb-4">
              {isAlabama ? (
                <>Additionally, stereochemistry is vital for cellular binding affinity. Biological receptors react strongly to the spatial arrangement of atoms. Our protocols strictly apply the biologically active L-isomers (unless a D-isomer is specified), ensuring the final compound accurately mimics endogenous biological signals. Following synthesis, the peptide is cleaved from the resin and undergoes stringent purification to eliminate incomplete chains, free amino acids, and synthesis byproducts. The final result is a sterile, ultra-pure compound prepared for in-vitro research.</>
              ) : isAlaska ? (
                <>Furthermore, cellular binding affinity depends heavily on proper molecular stereochemistry, as biological receptors are highly sensitive to spatial configurations. Our synthesis protocols utilize only active L-isomers (unless a sequence calls for a D-isomer), ensuring the resulting peptide mimics native signals. Once synthesized, the peptide is cleaved from the resin support and purified to remove truncated chains, unreacted reagents, and byproducts, delivering a sterile, high-purity compound ready for lab research.</>
              ) : isArizona ? (
                <>Stereochemical accuracy is also a key determinant of cellular receptor binding, where target pathways are sensitive to spatial configuration. We strictly incorporate active L-isomers in our synthesis (unless a D-isomer is explicitly required), allowing our research peptides to match endogenous biological signaling. After assembly, the peptide undergoes cleavage and multi-step purification to remove incomplete sequences, free residues, and synthesis salts, yielding a sterile, ≥99% pure compound optimized for laboratory assays.</>
              ) : (
                <>Furthermore, stereochemistry plays a crucial role in cellular binding affinity. Biological receptors are highly sensitive to the arrangement of atoms. Our synthesis protocols strictly utilize the biologically active L-isomers (unless a specific D-isomer is required by the sequence), ensuring that the resulting compound perfectly mimics endogenous biological signals. Post-synthesis, the peptide is cleaved from the resin and subjected to rigorous purification to remove incomplete chains, free amino acids, and synthesis byproducts like trifluoroacetic acid (TFA) salts. The result is a sterile, highly pure compound ready for in-vitro experimentation.</>
              )}
            </p>
          </div>
        </FadeIn>
      </section>

      {/* Lyophilization & Cold Chain Integrity - EN */}
      <section className="bg-[#F3F5FA] border border-black/5 rounded-[1.75rem] p-8 md:p-12 shadow-sm">
        <FadeIn>
          <h2 className="text-3xl font-dm-sans font-light text-black tracking-[-0.03em] mb-6">
            Lyophilization & Molecular Stabilization Protocols
          </h2>
          <div className="prose prose-lg max-w-none text-black/70 leading-relaxed">
            <p className="mb-4">
              {isAlabama ? (
                <>A peptide&apos;s initial purity is compromised if it degrades during shipping. Aqueous peptide solutions are highly vulnerable to hydrolysis, oxidation, and rapid enzymatic breakdown. To completely halt these processes, every compound supplied by 99 Purity Wholesale undergoes a thorough lyophilization (freeze-drying) procedure before leaving the lab.</>
              ) : isAlaska ? (
                <>A peptide&apos;s high purity at synthesis is lost if molecular degradation occurs during transport. In liquid form, peptides degrade quickly through oxidation, hydrolysis, and enzymatic activity. To prevent this, all compounds distributed by 99 Purity Wholesale undergo a strict, vacuum-sealed lyophilization (freeze-drying) cycle prior to outbound transit.</>
              ) : isArizona ? (
                <>Achieving ≥99% purity at the synthesizer is meaningless if the peptide degrades in transit. Because aqueous solutions leave peptides vulnerable to rapid hydrolysis and thermal breakdown, 99 Purity Wholesale subjects every compound to an advanced lyophilization (freeze-drying) process before dispatch.</>
              ) : (
                <>A peptide&apos;s purity at the point of synthesis is irrelevant if it degrades during transit. Peptides in aqueous solutions are highly susceptible to hydrolysis, oxidation, and rapid enzymatic degradation. To completely arrest these processes, all compounds distributed by 99 Purity Wholesale undergo an exhaustive lyophilization (freeze-drying) process before they ever leave the laboratory.</>
              )}
            </p>
            <p className="mb-4">
              {isAlabama ? (
                <>Lyophilization is a specialized thermodynamic process. The purified peptide solution is first frozen at extreme low temperatures, turning the water content into solid ice. A deep vacuum is subsequently applied, and the temperature is gradually increased. This causes the ice to sublimate—transitioning directly from solid to gas without entering the liquid phase. The resulting product is a stable, porous &quot;cake&quot; completely free of moisture. Since biological degradation relies on water, this dehydrated state places the peptide in suspended animation, keeping it highly stable for long durations, even at room temperature.</>
              ) : isAlaska ? (
                <>This process is a precise thermodynamic operation where the purified peptide solution is frozen to extreme temperatures, converting water into structured ice. Under a deep vacuum, the temperature is carefully adjusted to cause sublimation—turning ice directly into gas and bypassing the liquid phase. The result is a stable, moisture-free porous cake. Because water is required for degradation, this dry state holds the peptide in stable suspension, preserving it for long periods without refrigeration.</>
              ) : isArizona ? (
                <>This thermodynamic procedure involves freezing the purified peptide solution at ultra-low temperatures to solidify all water content. We then apply a deep vacuum and gradually raise the temperature, causing the ice to sublimate directly into gas without liquifying. This yields a moisture-free, porous cake. Without water to act as a chemical catalyst, the peptide is placed in a stable, dehydrated state of suspended animation, allowing it to withstand ambient temperatures during transit.</>
              ) : (
                <>Lyophilization is a complex thermodynamic process. The purified peptide solution is first frozen to ultra-low temperatures, converting the water content into solid ice. A deep vacuum is then applied, and the temperature is carefully raised. This allows the ice to sublimate—transitioning directly from a solid to a gas without passing through the liquid phase. The resulting product is a stable, porous, solid &quot;cake&quot; completely devoid of moisture. Because biological degradation requires water as a catalyst, this dehydrated state effectively places the peptide in suspended animation, allowing it to remain highly stable for extended periods, even at room temperature.</>
              )}
            </p>
            <p className="mb-4">
              {isAlabama ? (
                <>To provide extra protection during freezing and drying, we use medical-grade Mannitol as a lyoprotectant and bulking agent. Mannitol creates an amorphous matrix around the peptide, preventing harmful ice crystals and ensuring rapid dissolution when researchers reconstitute the compound with bacteriostatic water. For especially delicate compounds or during intense summer transit, our logistics network automatically applies specialized cold-chain protocols, utilizing insulated packaging and targeted thermal control to maintain complete molecular integrity.</>
              ) : isAlaska ? (
                <>To safeguard the molecular framework during freeze-drying, we add medical-grade Mannitol as a lyoprotectant. This creates a protective matrix that prevents crystal formation and supports quick reconstitution with bacteriostatic water. For transit to remote or non-contiguous destinations, our shipping protocols automatically utilize upgraded thermal packaging and monitoring to ensure the peptide&apos;s integrity is preserved throughout its journey.</>
              ) : isArizona ? (
                <>To protect the delicate peptide structure during freeze-drying, we introduce medical-grade Mannitol as a lyoprotectant and bulking agent. Mannitol forms a protective matrix that prevents crystalline damage and ensures immediate solubility upon reconstitution with bacteriostatic water. For Arizona shipments during high-temperature months, we automatically upgrade transit packaging to include thermal insulation and phase-change cooling packs to counter desert heat.</>
              ) : (
                <>To further protect the fragile molecular structure during the freezing and drying phases, we utilize medical-grade Mannitol as a lyoprotectant and bulking agent. Mannitol forms an amorphous matrix around the peptide, preventing the formation of damaging ice crystals and ensuring rapid, complete dissolution when the researcher eventually reconstitutes the compound with <Link href="/products/bac-water" className="text-[#0B6F7B] hover:underline font-semibold">bacteriostatic water</Link>. For particularly fragile compounds or extreme transit routes during peak summer months, our nationwide logistics network automatically upgrades shipments to specialized cold-chain protocols, utilizing insulated packaging and targeted thermal regulation to guarantee that molecular integrity is never compromised.</>
              )}
            </p>
          </div>
        </FadeIn>
      </section>

      {/* Strict "Research Use Only" (RUO) Compliance - EN */}
      <section className="bg-white border border-black/5 rounded-[1.75rem] p-8 md:p-12 shadow-sm">
        <FadeIn>
          <h2 className="text-3xl font-dm-sans font-light text-black tracking-[-0.03em] mb-6">
            Strict &quot;Research Use Only&quot; (RUO) & Federal Compliance
          </h2>
          <div className="prose prose-lg max-w-none text-black/70 leading-relaxed">
            <p className="mb-4">
              {isAlabama ? (
                <>The regulatory landscape surrounding biochemical distribution in the United States is complex and rigidly enforced. It is imperative that institutional buyers understand the distinction between active pharmaceutical ingredients (APIs) intended for clinical use and chemicals designated as &quot;Research Use Only&quot; (RUO). 99 Purity Wholesale operates exclusively within the RUO framework.</>
              ) : isAlaska ? (
                <>U.S. regulations governing the distribution of biochemical reagents are strict and closely monitored. Purchasing institutions must distinguish between active pharmaceutical ingredients (APIs) for human clinical use and biochemicals designated strictly as Research Use Only (RUO). 99 Purity Wholesale distributes compounds solely under this RUO classification.</>
              ) : isArizona ? (
                <>Biochemical distribution in the U.S. is subject to strict regulatory frameworks. Institutional procurement officers must recognize the regulatory boundary separating clinical-grade active pharmaceutical ingredients (APIs) from compounds designated strictly for Research Use Only (RUO). 99 Purity Wholesale distributes its catalog exclusively under this RUO designation.</>
              ) : (
                <>The <Link href="/compliance" className="text-[#0B6F7B] hover:underline font-semibold">regulatory landscape</Link> surrounding biochemical distribution in the United States is complex and rigidly enforced. It is imperative that institutional buyers understand the distinction between active pharmaceutical ingredients (APIs) intended for clinical use and chemicals designated as &quot;Research Use Only&quot; (RUO). 99 Purity Wholesale operates exclusively within the RUO framework.</>
              )}
            </p>
            <p className="mb-4">
              {isAlabama ? (
                <>According to guidelines established by the Food and Drug Administration (FDA) and other federal regulatory bodies, RUO chemicals are intended strictly for in-vitro laboratory research, analytical testing, and educational purposes. They are explicitly NOT intended for human consumption, diagnostic use, therapeutic application, or clinical trials involving human subjects. Our compounds are raw, unformulated biochemicals that have not undergone the extensive, multi-year clinical trials required for FDA approval as a drug or medical device.</>
              ) : isAlaska ? (
                <>Under guidelines from the Food and Drug Administration (FDA) and federal authorities, RUO compounds are sold exclusively for in-vitro laboratory studies, analytical assays, and educational research. They are not to be used for human consumption, diagnostics, clinical therapy, or trials with human subjects. These are unformulated, raw biochemical agents that have not undergone the multi-year trials required for clinical drug approval.</>
              ) : isArizona ? (
                <>FDA and federal guidelines specify that RUO chemicals are intended solely for in-vitro laboratory research, calibration assays, and educational trials. They are not approved for human or veterinary consumption, medical diagnostics, clinical therapeutics, or human subject testing. Our products are raw, unformulated materials, not clinical drugs, and have not undergone the multi-phase trials required for medical approval.</>
              ) : (
                <>According to guidelines established by the Food and Drug Administration (FDA) and other federal regulatory bodies, RUO chemicals are intended strictly for in-vitro laboratory research, analytical testing, and educational purposes. They are explicitly NOT intended for human consumption, diagnostic use, therapeutic application, or clinical trials involving human subjects. Our compounds are raw, unformulated biochemicals that have not undergone the extensive, multi-year clinical trials required for FDA approval as a drug or medical device.</>
              )}
            </p>
            <p className="mb-4">
              {isAlabama ? (
                <>Because we take regulatory compliance incredibly seriously, we do not sell to the general public. Our B2B onboarding process involves rigorous vetting of all prospective clients. We require valid Business Employer Identification Numbers (EIN), verifiable corporate addresses, and signed declarations affirming the intended research use of the compounds. Any indication that a buyer intends to misuse these chemicals will result in the immediate and permanent termination of their wholesale account. By maintaining this unwavering standard of compliance, we protect our supply chain, our institutional partners, and the broader scientific community.</>
              ) : isAlaska ? (
                <>To maintain compliance, we limit accounts strictly to qualified organizations and do not sell to the general public. Vetting during B2B onboarding requires a valid Employer Identification Number (EIN), corporate address verification, and a signed declaration of research intent. If we detect that a buyer intends to use these compounds for non-research purposes, their account is permanently suspended. This compliance program safeguards our supply chain, our clients, and scientific standards.</>
              ) : isArizona ? (
                <>We enforce compliance protocols strictly and do not sell to individual consumers. Our B2B onboarding process requires all accounts to provide a valid Employer Identification Number (EIN), verifiable business addresses, and a signed declaration of research intent. Any indication of intended non-laboratory use leads to immediate, permanent account closure. These standards protect our operations, our clients, and the integrity of scientific research.</>
              ) : (
                <>Because we take regulatory compliance incredibly seriously, we do not sell to the general public. Our <Link href="/wholesale-application" className="text-[#0B6F7B] hover:underline font-semibold">B2B onboarding process</Link> involves rigorous vetting of all prospective clients. We require valid Business Employer Identification Numbers (EIN), verifiable corporate addresses, and signed declarations affirming the intended research use of the compounds. Any indication that a buyer intends to misuse these chemicals will result in the immediate and permanent termination of their wholesale account. By maintaining this unwavering standard of compliance, we protect our supply chain, our institutional partners, and the broader scientific community.</>
              )}
            </p>
          </div>
        </FadeIn>
      </section>

      {/* The Criticality of Longitudinal Batch Consistency - EN */}
      <section className="bg-[#0B0D10] text-white border border-black/5 rounded-[1.75rem] p-8 md:p-12 shadow-sm">
        <FadeIn>
          <h2 className="text-3xl font-dm-sans font-light text-white tracking-[-0.03em] mb-6">
            The Criticality of Longitudinal Batch Consistency
          </h2>
          <div className="prose prose-lg max-w-none text-white/70 leading-relaxed">
            <p className="mb-4">
              In the realm of rigorous scientific inquiry, variability is the enemy of progress. When a university laboratory or private research firm embarks on a multi-year longitudinal study — whether modeling metabolic pathways with <Link href="/products/retatrutide" className="text-[#1ed4e8] hover:underline font-semibold">Retatrutide</Link> or tissue-repair assays with <Link href="/products/bpc-157" className="text-[#1ed4e8] hover:underline font-semibold">BPC-157</Link> — the chemical compounds they utilize must remain absolutely identical from day one to year five. Even a fractional change in peptide purity, or the introduction of a new synthesis byproduct, can introduce confounding variables that skew assay results, invalidate data sets, and ultimately jeopardize years of expensive research and peer-reviewed publication.
            </p>
            <p className="mb-4">
              Unfortunately, researchers sourcing compounds through fragmented, international supply chains frequently encounter the &quot;batch roulette&quot; phenomenon. Because overseas brokers constantly switch manufacturers based on cost, the peptide received in January may have a completely different impurity profile than the one received in June. 99 Purity Wholesale eliminates this variable entirely.
            </p>
            <p className="mb-4">
              Our domestic distribution network is built on the foundational principle of strict batch consistency. We maintain direct, unbroken oversight over the synthesis protocols, ensuring that the FMOC chemistry parameters remain completely static across manufacturing runs. Furthermore, because every single batch is independently verified by third-party US laboratories before entering our inventory, we catch and reject any microscopic deviations before they ever reach your facility. When you establish a supply partnership with us, you are guaranteed that the chemical baseline of your experiment will remain an unwavering constant.
            </p>
          </div>
        </FadeIn>
      </section>

      {/* Quality Control Protocols - EN */}
      <section className="space-y-8">
        <FadeIn>
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="text-3xl font-dm-sans font-light text-black tracking-[-0.03em] mb-6">
              The 99% Purity Mandate: Our Testing Protocol
            </h2>
            <p className="text-black/60 leading-relaxed">
              We do not rely on manufacturer claims. Every compound that enters our national distribution network is subjected to rigorous, independent third-party testing within the United States. Our multi-tiered validation process guarantees that you receive exactly what you ordered, at the highest possible purity — browse our published{' '}
              <Link href="/certificates-of-analysis" className="text-[#0B6F7B] underline underline-offset-2 hover:text-black transition-colors">
                Certificate of Analysis library
              </Link>{' '}
              to verify a specific batch before you order.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white border border-black/5 p-8 rounded-[1.25rem] relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-6 text-[100px] font-dm-sans font-medium text-black/5 group-hover:text-[#0B6F7B]/10 transition-colors pointer-events-none leading-none -mt-4 -mr-4">01</div>
              <h3 className="text-xl font-dm-sans font-light text-black tracking-[-0.03em] mb-4 relative z-10">HPLC Analysis</h3>
              <p className="text-black/60 text-sm leading-relaxed relative z-10">
                {isAlaska ? (
                  <>HPLC testing separates, identifies, and measures each component in the peptide batch, verifying that the active compound&apos;s concentration meets our strict 99% purity benchmark before release.</>
                ) : isArizona ? (
                  <>High-performance liquid chromatography separates and quantifies the compound&apos;s chemical profile, ensuring the active peptide concentration exceeds our strict 99% purity mandate.</>
                ) : isArkansas ? (
                  <>We use reversed-phase HPLC to isolate and analyze the chemical components of each peptide batch, confirming that active compound purity levels exceed our 99% threshold.</>
                ) : (
                  <>High-Performance Liquid Chromatography is utilized to precisely separate, identify, and quantify the chemical components of the peptide batch, ensuring the concentration of the active compound strictly exceeds our 99% threshold.</>
                )}
              </p>
            </div>

            <div className="bg-white border border-black/5 p-8 rounded-[1.25rem] relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-6 text-[100px] font-dm-sans font-medium text-black/5 group-hover:text-[#0B6F7B]/10 transition-colors pointer-events-none leading-none -mt-4 -mr-4">02</div>
              <h3 className="text-xl font-dm-sans font-light text-black tracking-[-0.03em] mb-4 relative z-10">Mass Spectrometry</h3>
              <p className="text-black/60 text-sm leading-relaxed relative z-10">
                {isAlaska ? (
                  <>Mass spectrometry validates the synthesized compound&apos;s molecular weight and chain structure, confirming there are no sequence mutations or truncated chains in the final batch.</>
                ) : isArizona ? (
                  <>MS testing confirms molecular weight and structural integrity, verifying that the synthesized peptide chain matches the desired sequence without deletion mutations.</>
                ) : isArkansas ? (
                  <>Mass spectrometry verifies the molecular mass and sequence integrity of the synthesized peptide, ensuring there are no incomplete chains or structural anomalies in the batch.</>
                ) : (
                  <>Mass Spectrometry (MS) confirms the exact molecular weight and structural integrity of the synthesized sequence. This eliminates the possibility of incomplete chains or structural mutations during the synthesis process.</>
                )}
              </p>
            </div>

            <div className="bg-white border border-black/5 p-8 rounded-[1.25rem] relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-6 text-[100px] font-dm-sans font-medium text-black/5 group-hover:text-[#0B6F7B]/10 transition-colors pointer-events-none leading-none -mt-4 -mr-4">03</div>
              <h3 className="text-xl font-dm-sans font-light text-black tracking-[-0.03em] mb-4 relative z-10">Batch Documentation</h3>
              <p className="text-black/60 text-sm leading-relaxed relative z-10">
                {isAlaska ? (
                  <>All analytical testing data is compiled into a batch-specific Certificate of Analysis (COA). We permanently archive these files and include the matching COA with every order.</>
                ) : isArizona ? (
                  <>We compile all analytical test results into a detailed Certificate of Analysis. Every bulk shipment includes this batch-matched COA, and copies are archived permanently in our database.</>
                ) : isArkansas ? (
                  <>Analytical measurements are compiled into a comprehensive Certificate of Analysis (COA). We archive every report permanently and supply the batch-matched document with each order.</>
                ) : (
                  <>The resulting analytical data is compiled into a transparent Certificate of Analysis (COA). We archive these records permanently and provide the specific batch COA alongside every bulk shipment we deploy.</>
                )}
              </p>
            </div>
          </div>
        </FadeIn>
      </section>
    </>
  );
}
