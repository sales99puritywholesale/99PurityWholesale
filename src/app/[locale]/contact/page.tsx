"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { MessageCircle, Mail, CheckCircle2, ArrowRight } from "lucide-react";
import { PageShell, PageHero, Panel, RevealGroup, WRAP } from "@/components/home/page-kit";
import FaqLight from "@/components/shared/FaqLight";
import { submitContactForm } from "@/app/actions/formActions";

const LABEL = "block font-dm-mono text-[10px] uppercase tracking-[0.16em] text-[#0B0F14]/55";
const INPUT =
  "w-full rounded-xl border border-[#E6EAF1] bg-[#F3F5FA] px-4 py-3.5 text-[14px] text-[#0B0F14] outline-none transition-colors placeholder:text-[#0B0F14]/35 focus:border-[#4FC3D0] focus:bg-white focus:ring-2 focus:ring-[#4FC3D0]/30 disabled:opacity-50";

export default function ContactPage() {
  const t = useTranslations("Contact");
  const locale = useLocale();
  const isEs = locale === "es";

  const [isPending, setIsPending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsPending(true);
    setErrorMessage(null);
    setIsSuccess(false);

    const formData = new FormData(e.currentTarget);
    const result = await submitContactForm(null, formData);

    setIsPending(false);
    if (result.success) {
      setIsSuccess(true);
      (e.target as HTMLFormElement).reset();
    } else {
      setErrorMessage(result.error || (isEs ? "Ocurrió un error al enviar el formulario." : "An error occurred while submitting the form."));
    }
  };

  const faqItems = ["q1", "q2", "q3", "q4", "q5", "q6", "q7"];
  const faqs = faqItems.map((id) => ({
    q: t(`FAQ.items.${id}.q`),
    a: t(`FAQ.items.${id}.a`),
  }));

  const handleWhatsAppClick = () => {
    const phone = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "18433307365").replace(/\D/g, '');
    const message = isEs
      ? "Hola, me gustaría conocer sus precios y niveles mayoristas. Mi negocio es "
      : "Hi, I'd like to learn about your wholesale pricing and tiers. My business is a ";
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank");
  };

  return (
    <PageShell>
      <PageHero
        eyebrow={isEs ? "Soporte de Adquisición" : "Procurement Assistance"}
        title={t("Hero.title")}
        intro={t("Hero.subtitle")}
      />

      <section className="pb-16 md:pb-24">
        <div className={WRAP}>
          <RevealGroup className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
            {/* Left Column: Contact Cards */}
            <div className="space-y-4 lg:col-span-5">
              <div data-reveal>
                <Panel className="md:!p-8">
                  <div className="mb-5 flex items-center gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F3F5FA] text-[#0B6F7B]">
                      <MessageCircle className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-[1.15rem] font-medium leading-none tracking-[-0.02em]">{isEs ? "WhatsApp Directo" : "Direct WhatsApp"}</h3>
                      <p className="mt-1.5 text-[12px] text-[#0B0F14]/55">{t("Methods.whatsapp.title")}</p>
                    </div>
                  </div>
                  <p className="mb-6 text-[14px] leading-relaxed text-[#0B0F14]/60">{t("Methods.whatsapp.description")}</p>
                  <button
                    type="button"
                    onClick={handleWhatsAppClick}
                    className="group inline-flex cursor-pointer items-center gap-3 rounded-full bg-[#0B0F14] py-2 pl-5 pr-2 text-[13px] font-medium text-white transition-colors hover:bg-[#1b232d]"
                  >
                    <span>{t("Methods.whatsapp.cta")}</span>
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4FC3D0] text-[#0B0F14] transition-transform duration-300 group-hover:-rotate-45">
                      <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </button>
                </Panel>
              </div>

              <div data-reveal>
                <Panel className="md:!p-8">
                  <div className="mb-5 flex items-center gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F3F5FA] text-[#0B6F7B]">
                      <Mail className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-[1.15rem] font-medium leading-none tracking-[-0.02em]">{isEs ? "Correo Electrónico" : "Email Sourcing"}</h3>
                      <p className="mt-1.5 text-[12px] text-[#0B0F14]/55">{t("Methods.email.title")}</p>
                    </div>
                  </div>
                  <p className="mb-6 text-[14px] leading-relaxed text-[#0B0F14]/60">{t("Methods.email.description")}</p>
                  <a
                    href="mailto:sales@99puritywholesale.com"
                    className="group inline-flex items-center gap-3 rounded-full border border-[#0B0F14]/15 py-2 pl-5 pr-2 text-[13px] font-medium text-[#0B0F14] transition-colors hover:bg-[#0B0F14] hover:text-white"
                  >
                    <span>{t("Methods.email.cta")}</span>
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4FC3D0] text-[#0B0F14] transition-transform duration-300 group-hover:-rotate-45">
                      <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </a>
                </Panel>
              </div>

              <div data-reveal>
                <Panel className="md:!p-8">
                  <h3 className="mb-5 text-[1.15rem] font-medium tracking-[-0.02em]">{t("Methods.checklist.title")}</h3>
                  <ul className="space-y-4">
                    {[0, 1, 2, 3].map((index) => (
                      <li key={index} className="flex items-start gap-3">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#0B6F7B]" />
                        <span className="text-[14px] leading-relaxed text-[#0B0F14]/70">{t(`Methods.checklist.items.${index}`)}</span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              </div>
            </div>

            {/* Right Column: Account Request Form */}
            <div data-reveal className="lg:col-span-7">
              <Panel className="md:!p-10">
                <div className="mb-8">
                  <h2 className="mb-2 text-[clamp(1.5rem,2.6vw,2rem)] font-light leading-tight tracking-[-0.03em]">{t("Form.title")}</h2>
                  <p className="text-[14px] leading-relaxed text-[#0B0F14]/55">{t("Form.subtitle")}</p>
                </div>

                {isSuccess && (
                  <div role="status" className="mb-6 flex items-start gap-3.5 rounded-2xl border border-emerald-200/60 bg-emerald-50 p-5 text-emerald-800">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    <div>
                      <h4 className="text-sm font-medium">{isEs ? "¡Inscripción Recibida!" : "Inquiry Received!"}</h4>
                      <p className="mt-1 text-xs leading-relaxed text-emerald-700/90">
                        {isEs ? "Gracias por contactarnos. Nuestro equipo revisará sus datos y se comunicará con usted a la brevedad." : "Thank you for reaching out. Our team will review your credentials and follow up with you shortly."}
                      </p>
                    </div>
                  </div>
                )}

                {errorMessage && (
                  <div role="alert" className="mb-6 flex items-start gap-3.5 rounded-2xl border border-rose-200/60 bg-rose-50 p-5 text-rose-800">
                    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-100">
                      <span className="text-xs font-medium text-rose-700">!</span>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium">{isEs ? "Error al Enviar" : "Submission Failed"}</h4>
                      <p className="mt-1 text-xs leading-relaxed text-rose-700/90">{errorMessage}</p>
                    </div>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <label htmlFor="contact-name" className={LABEL}>{isEs ? "Nombre Completo" : "Full Name"}</label>
                    <input id="contact-name" type="text" name="name" required disabled={isPending} className={INPUT} />
                  </div>

                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <label htmlFor="contact-email" className={LABEL}>{t("Form.fields.email")}</label>
                      <input id="contact-email" type="email" name="email" required disabled={isPending} className={INPUT} />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="contact-phone" className={LABEL}>{t("Form.fields.phone")}</label>
                      <input id="contact-phone" type="tel" name="phone" disabled={isPending} className={INPUT} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="contact-message" className={LABEL}>{isEs ? "Mensaje" : "Message"}</label>
                    <textarea
                      id="contact-message"
                      name="message"
                      rows={5}
                      required
                      disabled={isPending}
                      placeholder={isEs ? "¿En qué podemos ayudarle?" : "How can we help you?"}
                      className={`${INPUT} resize-none`}
                    ></textarea>
                  </div>

                  <button
                    type="submit"
                    disabled={isPending}
                    className="mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-[#0B0F14] py-4 text-[13px] font-medium text-white transition-colors hover:bg-[#1b232d] disabled:opacity-50"
                  >
                    {isPending ? (isEs ? "Enviando..." : "Sending...") : t("Form.fields.submit")}
                  </button>
                </form>
              </Panel>
            </div>
          </RevealGroup>
        </div>
      </section>

      <FaqLight id="contact-faq" title={t("FAQ.title")} items={faqs} />
    </PageShell>
  );
}
