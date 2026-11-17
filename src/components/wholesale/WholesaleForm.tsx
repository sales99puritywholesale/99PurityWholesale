"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { submitWholesaleForm } from "@/app/actions/formActions";

export default function WholesaleForm() {
  const t = useTranslations("WholesaleApplication");
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
    const result = await submitWholesaleForm(null, formData);

    setIsPending(false);
    if (result.success) {
      setIsSuccess(true);
      (e.target as HTMLFormElement).reset();
    } else {
      setErrorMessage(result.error || (isEs ? "Ocurrió un error al enviar el formulario." : "An error occurred while submitting the form."));
    }
  };

  // Get raw items safely
  const businessTypesRaw = t.raw("form.fields.businessTypes");
  const businessTypes = Array.isArray(businessTypesRaw) ? businessTypesRaw : [];

  const volumeTiersRaw = t.raw("form.fields.volumeTiers");
  const volumeTiers = Array.isArray(volumeTiersRaw) ? volumeTiersRaw : [];

  return (
    <div>
      {isSuccess && (
        <div className="p-6 bg-emerald-50 border border-emerald-200/50 text-emerald-800 rounded-[1.25rem] flex items-start gap-3.5 mb-6">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-sm">{isEs ? "¡Solicitud Recibida!" : "Application Received!"}</h4>
            <p className="text-xs text-emerald-700/90 font-medium mt-1 leading-relaxed">
              {isEs 
                ? "Gracias por registrar su interés. Evaluaremos sus credenciales comerciales y le enviaremos la confirmación del portal por correo electrónico." 
                : "Thank you for registering your interest. We will evaluate your business credentials and email you details regarding portal confirmation."}
            </p>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="p-6 bg-rose-50 border border-rose-200/50 text-rose-800 rounded-[1.25rem] flex items-start gap-3.5 mb-6">
          <div className="w-5 h-5 bg-rose-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-rose-700 font-bold text-xs">!</span>
          </div>
          <div>
            <h4 className="font-medium text-sm">{isEs ? "Error al Enviar" : "Submission Failed"}</h4>
            <p className="text-xs text-rose-700/90 font-medium mt-1 leading-relaxed">{errorMessage}</p>
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="rounded-[1.25rem] border border-[#E6EAF1] bg-white p-6 md:p-10 space-y-6"
      >
        {/* Attestation disclaimer banner */}
        <div className="bg-[#F3F5FA] border border-[#E6EAF1] rounded-2xl p-6 md:p-8">
          <h3 className="font-dm-sans text-[1.15rem] font-medium tracking-[-0.02em] text-[#0B0F14] mb-3">
            {t('form.attestation.title')}
          </h3>
          <p className="text-[13.5px] leading-relaxed text-[#0B0F14]/60 mb-6">
            {t('form.attestation.content')}
          </p>
          <label className="flex items-start gap-3 cursor-pointer">
            <input 
              type="checkbox" 
              name="attestation" 
              value="yes"
              required 
              disabled={isPending}
              className="mt-1 w-4 h-4 accent-[#0B6F7B] rounded cursor-pointer disabled:opacity-50" 
            />
            <span className="text-[13px] font-medium text-[#0B0F14] select-none">
              {t('form.attestation.label')}
            </span>
          </label>
        </div>

        {/* Form Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="wf-businessName" className="mb-2 block font-dm-mono text-[10px] uppercase tracking-[0.16em] text-[#0B0F14]/55">
              {t('form.fields.businessName')}
            </label>
            <input 
              type="text" 
              id="wf-businessName" name="businessName" 
              required 
              disabled={isPending}
              className="w-full rounded-xl border border-[#E6EAF1] bg-white px-4 py-3.5 text-[14px] text-[#0B0F14] outline-none transition-colors placeholder:text-[#0B0F14]/35 focus:border-[#4FC3D0] focus:ring-2 focus:ring-[#4FC3D0]/30 disabled:opacity-50" 
              placeholder={t('form.fields.businessNamePlaceholder')} 
            />
          </div>
          <div>
            <label htmlFor="wf-businessType" className="mb-2 block font-dm-mono text-[10px] uppercase tracking-[0.16em] text-[#0B0F14]/55">
              {t('form.fields.businessType')}
            </label>
            <select 
              id="wf-businessType" name="businessType" 
              required 
              disabled={isPending}
              className="w-full rounded-xl border border-[#E6EAF1] bg-white px-4 py-3.5 text-[14px] text-[#0B0F14] outline-none transition-colors placeholder:text-[#0B0F14]/35 focus:border-[#4FC3D0] focus:ring-2 focus:ring-[#4FC3D0]/30 disabled:opacity-50"
            >
              <option value="">{t('form.fields.businessTypeDefault')}</option>
              {businessTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="wf-fullName" className="mb-2 block font-dm-mono text-[10px] uppercase tracking-[0.16em] text-[#0B0F14]/55">
              {t('form.fields.fullName')}
            </label>
            <input 
              type="text" 
              id="wf-fullName" name="fullName" 
              required 
              disabled={isPending}
              className="w-full rounded-xl border border-[#E6EAF1] bg-white px-4 py-3.5 text-[14px] text-[#0B0F14] outline-none transition-colors placeholder:text-[#0B0F14]/35 focus:border-[#4FC3D0] focus:ring-2 focus:ring-[#4FC3D0]/30 disabled:opacity-50" 
              placeholder={t('form.fields.fullNamePlaceholder')} 
            />
          </div>
          <div>
            <label htmlFor="wf-email" className="mb-2 block font-dm-mono text-[10px] uppercase tracking-[0.16em] text-[#0B0F14]/55">
              {t('form.fields.email')}
            </label>
            <input 
              type="email" 
              id="wf-email" name="email" 
              required 
              disabled={isPending}
              className="w-full rounded-xl border border-[#E6EAF1] bg-white px-4 py-3.5 text-[14px] text-[#0B0F14] outline-none transition-colors placeholder:text-[#0B0F14]/35 focus:border-[#4FC3D0] focus:ring-2 focus:ring-[#4FC3D0]/30 disabled:opacity-50" 
              placeholder={t('form.fields.emailPlaceholder')} 
            />
          </div>
          <div>
            <label htmlFor="wf-phone" className="mb-2 block font-dm-mono text-[10px] uppercase tracking-[0.16em] text-[#0B0F14]/55">
              {t('form.fields.phone')}
            </label>
            <input 
              type="tel" 
              id="wf-phone" name="phone" 
              required 
              disabled={isPending}
              className="w-full rounded-xl border border-[#E6EAF1] bg-white px-4 py-3.5 text-[14px] text-[#0B0F14] outline-none transition-colors placeholder:text-[#0B0F14]/35 focus:border-[#4FC3D0] focus:ring-2 focus:ring-[#4FC3D0]/30 disabled:opacity-50" 
              placeholder={t('form.fields.phonePlaceholder')} 
            />
          </div>
          <div>
            <label htmlFor="wf-state" className="mb-2 block font-dm-mono text-[10px] uppercase tracking-[0.16em] text-[#0B0F14]/55">
              {t('form.fields.state')}
            </label>
            <input 
              type="text" 
              id="wf-state" name="state" 
              required 
              disabled={isPending}
              className="w-full rounded-xl border border-[#E6EAF1] bg-white px-4 py-3.5 text-[14px] text-[#0B0F14] outline-none transition-colors placeholder:text-[#0B0F14]/35 focus:border-[#4FC3D0] focus:ring-2 focus:ring-[#4FC3D0]/30 disabled:opacity-50" 
              placeholder={t('form.fields.statePlaceholder')} 
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="wf-monthlyVolume" className="mb-2 block font-dm-mono text-[10px] uppercase tracking-[0.16em] text-[#0B0F14]/55">
              {t('form.fields.volume')}
            </label>
            <select 
              id="wf-monthlyVolume" name="monthlyVolume" 
              required 
              disabled={isPending}
              className="w-full rounded-xl border border-[#E6EAF1] bg-white px-4 py-3.5 text-[14px] text-[#0B0F14] outline-none transition-colors placeholder:text-[#0B0F14]/35 focus:border-[#4FC3D0] focus:ring-2 focus:ring-[#4FC3D0]/30 disabled:opacity-50"
            >
              <option value="">{t('form.fields.volumeDefault')}</option>
              {volumeTiers.map(tier => (
                <option key={tier} value={tier}>{tier}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="wf-products" className="mb-2 block font-dm-mono text-[10px] uppercase tracking-[0.16em] text-[#0B0F14]/55">
            {t('form.fields.products')}
          </label>
          <textarea 
            id="wf-products" name="products" 
            required 
            rows={3} 
            disabled={isPending}
            className="w-full rounded-xl border border-[#E6EAF1] bg-white px-4 py-3.5 text-[14px] text-[#0B0F14] outline-none transition-colors placeholder:text-[#0B0F14]/35 focus:border-[#4FC3D0] focus:ring-2 focus:ring-[#4FC3D0]/30 disabled:opacity-50" 
            placeholder={t('form.fields.productsPlaceholder')} 
          />
        </div>

        <div>
          <span id="wf-contactMethod-label" className="mb-2 block font-dm-mono text-[10px] uppercase tracking-[0.16em] text-[#0B0F14]/55">
            {t('form.fields.contactMethod')}
          </span>
          <div role="radiogroup" aria-labelledby="wf-contactMethod-label" className="flex gap-6 mt-1">
            {['WhatsApp', 'Email'].map((m) => (
              <label key={m} className="flex items-center gap-2 cursor-pointer select-none">
                <input 
                  type="radio" 
                  name="contactMethod" 
                  value={m} 
                  defaultChecked={m === 'WhatsApp'}
                  disabled={isPending}
                  className="accent-[#0B6F7B] w-4 h-4 cursor-pointer disabled:opacity-50" 
                />
                <span className="text-[13px] font-medium text-[#0B0F14]/75">{m}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="wf-notes" className="mb-2 block font-dm-mono text-[10px] uppercase tracking-[0.16em] text-[#0B0F14]/55">
            {t('form.fields.notes')}
          </label>
          <textarea 
            id="wf-notes" name="notes" 
            rows={3} 
            disabled={isPending}
            className="w-full rounded-xl border border-[#E6EAF1] bg-white px-4 py-3.5 text-[14px] text-[#0B0F14] outline-none transition-colors placeholder:text-[#0B0F14]/35 focus:border-[#4FC3D0] focus:ring-2 focus:ring-[#4FC3D0]/30 disabled:opacity-50" 
            placeholder={t('form.fields.notesPlaceholder')} 
          />
        </div>

        <button 
          type="submit" 
          disabled={isPending}
          className="w-full rounded-full bg-[#0B0F14] py-4 text-[13px] font-medium text-white transition-colors hover:bg-[#1b232d] cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isPending ? (isEs ? "Enviando..." : "Sending...") : t('form.fields.submit')}
        </button>

        <p className="text-[#0B0F14]/45 text-[11px] text-center leading-relaxed max-w-lg mx-auto">
          {t('form.footer')}
        </p>
      </form>
    </div>
  );
}
