"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { MessageCircle, Mail, CheckCircle2 } from "lucide-react";
import FaqSection from "@/components/shared/FaqSection";
import { submitContactForm } from "@/app/actions/formActions";

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
    <main className="min-h-screen bg-[#F8F8F6] text-[#101827] -mt-24 md:-mt-32 selection:bg-[#13a7b7]/20">
      
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-52 pb-24 md:pt-64 md:pb-32 border-b border-black/5 bg-[#F8F8F6]">
        {/* Grain Noise Texture */}
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[url('/images/noise.svg')]" />
        
        <div className="container mx-auto px-6 max-w-5xl relative z-10 text-center">
          <div>
            <div className="inline-block bg-black/5 border border-black/5 px-5 py-2 rounded-full text-[10px] font-bold font-dm-sans uppercase tracking-widest text-black/60 mb-6">
              {isEs ? "Soporte de Adquisición" : "Procurement Assistance"}
            </div>
            <h1 className="reveal-text text-4xl sm:text-6xl md:text-7xl font-bold font-absans text-black uppercase tracking-tight leading-none mb-6 break-words w-full">
              {t("Hero.title")}
            </h1>
            <p className="reveal-text text-lg md:text-xl font-archia font-semibold text-black/75 mb-8 max-w-3xl mx-auto leading-relaxed">
              {t("Hero.subtitle")}
            </p>
          </div>
        </div>
      </section>

      {/* Main Grid Content */}
      <section className="py-24 bg-[#F8F8F6] relative z-10">
        <div className="container mx-auto px-6 max-w-7xl">
          <div className="reveal-grid grid grid-cols-1 lg:grid-cols-12 gap-16 items-start">
            
            {/* Left Column: Contact Cards */}
            <div className="lg:col-span-5 space-y-8">
              
              {/* WhatsApp Procurement Card */}
              <div className="reveal-card bg-white border border-emerald-500/20 rounded-[2rem] p-8 shadow-[0_22px_70px_rgba(16,185,129,0.03)] hover:border-emerald-500/40 transition-all duration-300">
                <div className="flex items-center space-x-4 mb-6">
                  <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center shrink-0">
                    <MessageCircle className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-black font-absans uppercase leading-none">
                      {isEs ? "WhatsApp Directo" : "Direct WhatsApp"}
                    </h3>
                    <p className="text-black/55 font-archia text-xs font-medium mt-1">
                      {t("Methods.whatsapp.title")}
                    </p>
                  </div>
                </div>
                <p className="text-black/65 font-archia text-sm mb-6 leading-relaxed font-medium">
                  {t("Methods.whatsapp.description")}
                </p>
                <button
                  onClick={handleWhatsAppClick}
                  className="w-full bg-[#25D366] hover:bg-[#20ba5a] text-white font-bold py-4 px-8 rounded-xl transition-all flex items-center justify-center space-x-2 text-xs font-archia tracking-wider uppercase shadow-[0_10px_30px_rgba(37,211,102,0.2)] cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>{t("Methods.whatsapp.cta")}</span>
                </button>
              </div>

              {/* Email Procurement Card */}
              <div className="reveal-card bg-white border border-black/5 rounded-[2rem] p-8 shadow-[0_22px_70px_rgba(19,32,52,0.04)] hover:border-black/15 transition-all duration-300 mt-8">
                <div className="flex items-center space-x-4 mb-6">
                  <div className="w-12 h-12 bg-black/5 rounded-full flex items-center justify-center shrink-0">
                    <Mail className="w-6 h-6 text-black/80" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-black font-absans uppercase leading-none">
                      {isEs ? "Correo Electrónico" : "Email Sourcing"}
                    </h3>
                    <p className="text-black/55 font-archia text-xs font-medium mt-1">
                      {t("Methods.email.title")}
                    </p>
                  </div>
                </div>
                <p className="text-black/65 font-archia text-sm mb-6 leading-relaxed font-medium">
                  {t("Methods.email.description")}
                </p>
                <a
                  href="mailto:sales@99puritywholesale.com"
                  className="w-full bg-black/5 hover:bg-black/10 text-black border border-black/10 font-bold py-4 px-8 rounded-xl transition-all flex items-center justify-center space-x-2 text-xs font-archia tracking-wider uppercase"
                >
                  <Mail className="w-4 h-4" />
                  <span>{t("Methods.email.cta")}</span>
                </a>
              </div>

              {/* checklist Card */}
              <div className="reveal-card bg-white border border-black/5 rounded-[2rem] p-8 shadow-[0_22px_70px_rgba(19,32,52,0.04)] mt-8">
                <h3 className="text-lg font-bold text-black mb-6 font-absans uppercase">
                  {t("Methods.checklist.title")}
                </h3>
                <ul className="space-y-4">
                  {[0, 1, 2, 3].map((index) => (
                    <li key={index} className="flex items-start space-x-3">
                      <CheckCircle2 className="w-5 h-5 text-[#13a7b7] mt-0.5 shrink-0" />
                      <span className="text-black/75 font-archia text-sm font-medium">
                        {t(`Methods.checklist.items.${index}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

            </div>

            {/* Right Column: Account Request Form */}
            <div className="reveal-card lg:col-span-7 bg-white border border-black/5 rounded-[2rem] p-8 md:p-12 shadow-[0_22px_70px_rgba(19,32,52,0.05)]">
              <div>
                <div className="mb-10">
                  <h2 className="reveal-text text-2xl font-bold text-black mb-2 font-absans uppercase">
                    {t("Form.title")}
                  </h2>
                  <p className="reveal-text text-black/50 font-archia text-sm font-medium">
                    {t("Form.subtitle")}
                  </p>
                </div>

                {isSuccess && (
                  <div className="p-6 bg-emerald-50 border border-emerald-200/50 text-emerald-800 rounded-2xl flex items-start gap-3.5 mb-6">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-sm uppercase tracking-wider">{isEs ? "¡Inscripción Recibida!" : "Inquiry Received!"}</h4>
                      <p className="text-xs text-emerald-700/90 font-medium mt-1 leading-relaxed">
                        {isEs ? "Gracias por contactarnos. Nuestro equipo revisará sus datos y se comunicará con usted a la brevedad." : "Thank you for reaching out. Our team will review your credentials and follow up with you shortly."}
                      </p>
                    </div>
                  </div>
                )}

                {errorMessage && (
                  <div className="p-6 bg-rose-50 border border-rose-200/50 text-rose-800 rounded-2xl flex items-start gap-3.5 mb-6">
                    <div className="w-5 h-5 bg-rose-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-rose-700 font-bold text-xs">!</span>
                    </div>
                    <div>
                      <h4 className="font-bold text-sm uppercase tracking-wider">{isEs ? "Error al Enviar" : "Submission Failed"}</h4>
                      <p className="text-xs text-rose-700/90 font-medium mt-1 leading-relaxed">{errorMessage}</p>
                    </div>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <label className="block text-black/40 font-dm-mono text-[10px] font-bold uppercase tracking-widest">
                      {isEs ? "Nombre Completo" : "Full Name"}
                    </label>
                    <input
                      type="text"
                      name="name"
                      required
                      disabled={isPending}
                      className="w-full bg-[#F8F8F6] border border-black/5 rounded-xl px-4 py-3.5 text-black placeholder-slate-400 focus:outline-none focus:border-[#13a7b7] focus:ring-1 focus:ring-[#13a7b7] transition-all font-archia text-sm font-medium disabled:opacity-50"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="block text-black/40 font-dm-mono text-[10px] font-bold uppercase tracking-widest">
                        {t("Form.fields.email")}
                      </label>
                      <input
                        type="email"
                        name="email"
                        required
                        disabled={isPending}
                        className="w-full bg-[#F8F8F6] border border-black/5 rounded-xl px-4 py-3.5 text-black placeholder-slate-400 focus:outline-none focus:border-[#13a7b7] focus:ring-1 focus:ring-[#13a7b7] transition-all font-archia text-sm font-medium disabled:opacity-50"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-black/40 font-dm-mono text-[10px] font-bold uppercase tracking-widest">
                        {t("Form.fields.phone")}
                      </label>
                      <input
                        type="tel"
                        name="phone"
                        disabled={isPending}
                        className="w-full bg-[#F8F8F6] border border-black/5 rounded-xl px-4 py-3.5 text-black placeholder-slate-400 focus:outline-none focus:border-[#13a7b7] focus:ring-1 focus:ring-[#13a7b7] transition-all font-archia text-sm font-medium disabled:opacity-50"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-black/40 font-dm-mono text-[10px] font-bold uppercase tracking-widest">
                      {isEs ? "Mensaje" : "Message"}
                    </label>
                    <textarea
                      name="message"
                      rows={5}
                      required
                      disabled={isPending}
                      placeholder={isEs ? "¿En qué podemos ayudarle?" : "How can we help you?"}
                      className="w-full bg-[#F8F8F6] border border-black/5 rounded-xl px-4 py-3.5 text-black placeholder-slate-400 focus:outline-none focus:border-[#13a7b7] focus:ring-1 focus:ring-[#13a7b7] transition-all resize-none font-archia text-sm font-medium disabled:opacity-50"
                    ></textarea>
                  </div>

                  <button
                    type="submit"
                    disabled={isPending}
                    className="w-full bg-black hover:bg-black/85 text-white font-bold py-4 px-8 rounded-xl transition-all shadow-[0_10px_30px_rgba(0,0,0,0.15)] font-archia tracking-wider uppercase text-xs mt-4 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isPending ? (isEs ? "Enviando..." : "Sending...") : t("Form.fields.submit")}
                  </button>
                </form>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <FaqSection
        title={t("FAQ.title")}
        items={faqs}
        theme="white"
      />
    </main>
  );
}
