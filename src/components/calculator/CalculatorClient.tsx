'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { Info, PhoneCall, AlertTriangle } from 'lucide-react';

export default function CalculatorClient() {
  const t = useTranslations('Calculator');

  // Input States
  const [vialSize, setVialSize] = useState<number>(5); // in mg
  const [bacWater, setBacWater] = useState<number>(2); // in mL
  const [syringeSize, setSyringeSize] = useState<number>(100); // 30, 50, 100 units
  const [targetDoseInput, setTargetDoseInput] = useState<string>('250'); // in mcg (as string for editing safety)

  // Presets
  const vialPresets = [2, 5, 10, 15];
  const waterPresets = [1, 2, 2.5, 3];
  const dosePresets = [100, 250, 500, 1000];

  // Total vial capacity in micrograms
  const totalMcg = vialSize * 1000;

  // Single-layer validation for targetDoseInput
  const trimmedInput = targetDoseInput.trim();
  const rawDose = parseFloat(trimmedInput);
  const isValidDose = trimmedInput !== '' && !isNaN(rawDose) && isFinite(rawDose) && rawDose > 0;
  const isDoseExceedingVial = isValidDose && rawDose > totalMcg;
  const numericDose = isValidDose ? rawDose : 0;

  // Mathematical Calculations
  // Concentration = totalMcg / bacWater (mcg/mL)
  // 1 unit = 0.01 mL
  // mcg per unit = Concentration * 0.01 = totalMcg / (bacWater * 100)
  const mcgPerUnit = bacWater > 0 ? totalMcg / (bacWater * 100) : 0;
  
  // Units required = targetDose / mcgPerUnit
  const unitsRequiredRaw = isValidDose && mcgPerUnit > 0 ? numericDose / mcgPerUnit : 0;
  const unitsRequired = isValidDose && mcgPerUnit > 0 ? Math.round(unitsRequiredRaw * 10) / 10 : 0;
  
  // Total doses per vial
  const dosesPerVial = isValidDose && numericDose > 0 ? Math.floor(totalMcg / numericDose) : 0;

  // Validate if unitsRequired exceeds syringe capacity
  const isOverCapacity = isValidDose && unitsRequired > syringeSize;
  const fillFraction = isValidDose && syringeSize > 0 ? Math.min(1, Math.max(0, unitsRequired / syringeSize)) : 0;

  // Handler to update vialSize and clamp targetDoseInput synchronously if needed (no useEffect side-effect)
  const handleVialSizeChange = (newVialSize: number) => {
    setVialSize(newVialSize);
    const newTotalMcg = newVialSize * 1000;
    if (isValidDose && rawDose > newTotalMcg) {
      setTargetDoseInput(newTotalMcg.toString());
    }
  };

  // Handler for targetDose number input change
  const handleTargetDoseChange = (valStr: string) => {
    setTargetDoseInput(valStr);
    const parsed = parseFloat(valStr);
    if (!isNaN(parsed) && isFinite(parsed) && parsed > totalMcg) {
      setTargetDoseInput(totalMcg.toString());
    }
  };

  // Generate SVG tick marks for syringe based on selected size
  const renderTicks = () => {
    const ticks = [];
    const totalUnits = syringeSize;
    // Determine tick mark increments
    // U-100: major ticks every 10 units, minor every 2 units
    // U-50: major ticks every 5 units, minor every 1 unit
    // U-30: major ticks every 5 units, minor every 1 unit
    const majorStep = totalUnits === 100 ? 10 : 5;
    const minorStep = totalUnits === 100 ? 2 : 1;

    for (let u = 0; u <= totalUnits; u += minorStep) {
      const isMajor = u % majorStep === 0;
      const fraction = u / totalUnits;
      const y = 70 + fraction * 260; // Starts at y=70, spans 260px to y=330

      ticks.push(
        <g key={u} className="transition-all duration-300">
          <line
            x1="80"
            y1={y}
            x2={isMajor ? "92" : "86"}
            y2={y}
            stroke="#1E293B"
            strokeWidth={isMajor ? "1.5" : "1"}
            opacity={isMajor ? "0.8" : "0.4"}
          />
          {isMajor && u > 0 && (
            <text
              x="72"
              y={y + 3}
              textAnchor="end"
              fontSize="10"
              fontWeight="bold"
              fontFamily="monospace"
              fill="#1E293B"
              opacity="0.8"
            >
              {u}
            </text>
          )}
        </g>
      );
    }
    return ticks;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Input Controls Column (Left) */}
      <div className="lg:col-span-7 flex flex-col gap-6">
        {/* Card 1: Reconstitution Parameters */}
        <div className="bg-white border border-[#E6EAF1] rounded-[1.25rem] p-8 shadow-sm relative overflow-hidden">
          <div className="relative z-10 flex flex-col gap-8">
            {/* Vial size input */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div>
                  <label id="vial-size-label" htmlFor="vial-size-slider" className="text-[15px] font-medium text-[#0B0F14] block">
                    {t('vialSizeLabel')}
                  </label>
                  <span id="vial-size-desc" className="text-[13px] text-black/50">
                    {t('vialSizeSub')}
                  </span>
                </div>
                <div className="flex items-baseline gap-1 self-start sm:self-auto bg-black/[0.03] px-4 py-1.5 rounded-xl border border-[#E6EAF1]">
                  <span className="text-2xl font-light tracking-[-0.04em] text-black">{vialSize}</span>
                  <span className="text-sm font-medium text-black/50">mg</span>
                </div>
              </div>

              {/* Slider */}
              <input
                id="vial-size-slider"
                type="range"
                min="1"
                max="30"
                step="1"
                value={vialSize}
                onChange={(e) => handleVialSizeChange(Number(e.target.value))}
                aria-labelledby="vial-size-label"
                aria-describedby="vial-size-desc"
                aria-valuemin={1}
                aria-valuemax={30}
                aria-valuenow={vialSize}
                aria-valuetext={`${vialSize} mg`}
                className="w-full h-1 bg-black/10 rounded-lg appearance-none cursor-pointer accent-[#0B6F7B] mb-4"
              />

              {/* Presets */}
              <div className="flex flex-wrap gap-2">
                {vialPresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleVialSizeChange(preset)}
                    aria-label={`Select ${preset} milligram vial preset`}
                    className={`px-4 py-2 text-[10px] font-medium font-dm-mono uppercase tracking-widest rounded-xl transition-all border ${
                      vialSize === preset
                        ? 'bg-[#0B0F14] text-white border-[#0B0F14]'
                        : 'bg-black/[0.02] text-black/60 border-[#E6EAF1] hover:border-black/20 hover:bg-black/[0.04]'
                    }`}
                  >
                    {preset} mg
                  </button>
                ))}
              </div>
            </div>

            <div className="w-full h-px bg-black/5" />

            {/* BAC Water volume input */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div>
                  <label id="water-volume-label" htmlFor="water-volume-slider" className="text-[15px] font-medium text-[#0B0F14] block">
                    {t('waterVolumeLabel')}
                  </label>
                  <span id="water-volume-desc" className="text-[13px] text-black/50">
                    {t('waterVolumeSub')}
                  </span>
                </div>
                <div className="flex items-baseline gap-1 self-start sm:self-auto bg-black/[0.03] px-4 py-1.5 rounded-xl border border-[#E6EAF1]">
                  <span className="text-2xl font-light tracking-[-0.04em] text-black">{bacWater}</span>
                  <span className="text-sm font-medium text-black/50">mL</span>
                </div>
              </div>

              {/* Slider */}
              <input
                id="water-volume-slider"
                type="range"
                min="0.5"
                max="10"
                step="0.5"
                value={bacWater}
                onChange={(e) => setBacWater(Number(e.target.value))}
                aria-labelledby="water-volume-label"
                aria-describedby="water-volume-desc"
                aria-valuemin={0.5}
                aria-valuemax={10}
                aria-valuenow={bacWater}
                aria-valuetext={`${bacWater} mL`}
                className="w-full h-1 bg-black/10 rounded-lg appearance-none cursor-pointer accent-[#0B6F7B] mb-4"
              />

              {/* Presets */}
              <div className="flex flex-wrap gap-2">
                {waterPresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setBacWater(preset)}
                    aria-label={`Select ${preset} milliliter diluent volume preset`}
                    className={`px-4 py-2 text-[10px] font-medium font-dm-mono uppercase tracking-widest rounded-xl transition-all border ${
                      bacWater === preset
                        ? 'bg-[#0B0F14] text-white border-[#0B0F14]'
                        : 'bg-black/[0.02] text-black/60 border-[#E6EAF1] hover:border-black/20 hover:bg-black/[0.04]'
                    }`}
                  >
                    {preset} mL
                  </button>
                ))}
              </div>
            </div>

            <div className="w-full h-px bg-black/5" />

            {/* Syringe Type input */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div>
                  <label id="syringe-size-label" className="text-[15px] font-medium text-[#0B0F14] block">
                    {t('syringeSizeLabel')}
                  </label>
                  <span id="syringe-size-desc" className="text-[13px] text-black/50">
                    {t('syringeSizeSub')}
                  </span>
                </div>
              </div>

              {/* Select Options grid */}
              <div 
                role="radiogroup" 
                aria-labelledby="syringe-size-label"
                aria-describedby="syringe-size-desc"
                className="grid grid-cols-1 sm:grid-cols-3 gap-3"
              >
                {[
                  { value: 100, label: '1.0 mL', desc: 'U-100 Syringe' },
                  { value: 50, label: '0.5 mL', desc: 'U-50 Syringe' },
                  { value: 30, label: '0.3 mL', desc: 'U-30 Syringe' },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={syringeSize === option.value}
                    aria-label={`${option.desc} - ${option.label} capacity`}
                    onClick={() => setSyringeSize(option.value)}
                    className={`p-4 flex flex-col items-center justify-center text-center rounded-2xl transition-all border ${
                      syringeSize === option.value
                        ? 'bg-[#0B0F14] text-white border-[#0B0F14] shadow-none'
                        : 'bg-black/[0.02] text-black border-[#E6EAF1] hover:border-black/20 hover:bg-black/[0.04]'
                    }`}
                  >
                    <span className="text-base font-light tracking-[-0.04em]">{option.desc}</span>
                    <span className={`text-xs font-medium mt-1 ${syringeSize === option.value ? 'text-white/60' : 'text-black/40'}`}>
                      {option.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="w-full h-px bg-black/5" />

            {/* Target Dose input */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div>
                  <label id="target-dose-label" htmlFor="target-dose-input" className="text-[15px] font-medium text-[#0B0F14] block">
                    {t('targetDoseLabel')}
                  </label>
                  <span id="target-dose-desc" className="text-[13px] text-black/50">
                    {t('targetDoseSub')}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 self-start sm:self-auto bg-black/[0.03] px-4 py-1.5 rounded-xl border border-[#E6EAF1]">
                  <input
                    id="target-dose-input"
                    type="number"
                    min="1"
                    max={totalMcg}
                    step="any"
                    value={targetDoseInput}
                    onChange={(e) => handleTargetDoseChange(e.target.value)}
                    aria-labelledby="target-dose-label"
                    aria-describedby="target-dose-desc"
                    className="w-28 bg-transparent text-2xl font-light tracking-[-0.04em] text-black outline-none border-none text-right"
                  />
                  <span className="text-sm font-medium text-black/50">mcg</span>
                </div>
              </div>

              {/* Input Validation Feedback */}
              {!isValidDose && trimmedInput !== '' && (
                <p className="text-xs text-amber-700 mb-3">
                  Please enter a valid positive dosage amount in micrograms (mcg).
                </p>
              )}

              {/* Slider (Synchronized up to totalMcg) */}
              <input
                id="target-dose-slider"
                type="range"
                min="10"
                max={totalMcg}
                step="10"
                value={isValidDose ? Math.min(numericDose, totalMcg) : 10}
                onChange={(e) => handleTargetDoseChange(e.target.value)}
                aria-label="Target dose adjustment slider"
                aria-valuemin={10}
                aria-valuemax={totalMcg}
                aria-valuenow={isValidDose ? numericDose : 0}
                aria-valuetext={`${isValidDose ? numericDose : 0} mcg`}
                className="w-full h-1 bg-black/10 rounded-lg appearance-none cursor-pointer accent-[#0B6F7B] mb-4"
              />

              {/* Presets */}
              <div className="flex flex-wrap gap-2">
                {dosePresets.map((preset) => {
                  const isAvailable = preset <= totalMcg;
                  return (
                    <button
                      key={preset}
                      type="button"
                      disabled={!isAvailable}
                      onClick={() => handleTargetDoseChange(preset.toString())}
                      aria-label={`Select ${preset} microgram target dose preset`}
                      className={`px-4 py-2 text-[10px] font-medium font-dm-mono uppercase tracking-widest rounded-xl transition-all border ${
                        !isAvailable
                          ? 'opacity-30 cursor-not-allowed border-[#E6EAF1] text-black/40 bg-black/[0.01]'
                          : isValidDose && numericDose === preset
                          ? 'bg-[#0B0F14] text-white border-[#0B0F14]'
                          : 'bg-black/[0.02] text-black/60 border-[#E6EAF1] hover:border-black/20 hover:bg-black/[0.04]'
                      }`}
                    >
                      {preset} mcg
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: B2B Procurement Ancillaries */}
        <div className="bg-[#0B0D10] text-white border border-white/5 rounded-[1.25rem] p-8 shadow-none relative overflow-hidden">
          <div className="relative z-10">
            <h3 className="text-xl font-light tracking-[-0.04em] tracking-[-0.005em] mb-3">
              {t('procureCta')}
            </h3>
            <p className="text-white/60 text-sm leading-relaxed mb-6 font-medium">
              {t('procureDesc')}
            </p>
            <a 
              href={`https://wa.me/18433307365?text=${encodeURIComponent(t('procureMsg'))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 rounded-full bg-[#4FC3D0] px-6 py-3 text-[13px] font-medium text-[#0B0F14] transition-colors hover:bg-[#6fd2dd]"
            >
              <PhoneCall className="h-4 w-4" />
              {t('procureCta')}
            </a>
          </div>
        </div>
      </div>

      {/* Syringe Visualizer & Specifications (Right) */}
      <div className="lg:col-span-5 flex flex-col gap-6">
        {/* Result values Panel with ARIA Live Region */}
        <div 
          role="status" 
          aria-live="polite" 
          aria-atomic="true"
          className="bg-white border border-[#E6EAF1] rounded-[1.25rem] p-8 shadow-sm relative overflow-hidden flex flex-col gap-6"
        >
          <div className="relative z-10">
            <h3 className="text-sm font-medium text-black/40 uppercase tracking-widest mb-6">
              {t('results.title')}
            </h3>

            <div className="flex flex-col gap-5">
              {/* Target draw result (The Big Highlight) */}
              <div className="p-6 bg-black/[0.02] border border-[#E6EAF1] rounded-2xl flex flex-col relative overflow-hidden">
                <span className="text-xs font-medium text-black/50 uppercase tracking-widest mb-1">{t('results.unitsRequired')}</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-6xl md:text-7xl font-light tracking-[-0.04em] text-black leading-none">
                    {isValidDose ? unitsRequired : '—'}
                  </span>
                  <span className="text-base font-medium text-black/50 tracking-[-0.005em]">Units</span>
                </div>
                <p className="text-[13px] text-black/50 mt-3">
                  {t('results.unitsRequiredDesc')}
                </p>
              </div>

              {/* Grid with other calculations */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-5 border border-[#E6EAF1] rounded-2xl flex flex-col">
                  <span className="text-[10px] font-medium text-black/40 tracking-[-0.005em] mb-2">{t('results.mcgPerUnit')}</span>
                  <span className="text-2xl font-light tracking-[-0.04em] text-black leading-none">
                    {Math.round(mcgPerUnit * 100) / 100} mcg
                  </span>
                  <p className="text-[10px] text-black/40 mt-2 leading-normal font-medium">
                    {t('results.mcgPerUnitDesc')}
                  </p>
                </div>
 
                <div className="p-5 border border-[#E6EAF1] rounded-2xl flex flex-col">
                  <span className="text-[10px] font-medium text-black/40 tracking-[-0.005em] mb-2">{t('results.dosesPerVial')}</span>
                  <span className="text-2xl font-light tracking-[-0.04em] text-black leading-none">
                    {isValidDose ? dosesPerVial : '—'}
                  </span>
                  <p className="text-[10px] text-black/40 mt-2 leading-normal font-medium">
                    {t('results.dosesPerVialDesc')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Syringe SVG Artboard */}
        <div className="bg-white border border-[#E6EAF1] rounded-[1.25rem] p-8 shadow-sm flex flex-col items-center justify-center relative overflow-hidden min-h-[580px]">
          <div className="relative z-10 w-full flex flex-col items-center">
            {/* SVG Visualizer */}
            <svg
              role="img"
              aria-label={`Interactive syringe visualizer displaying ${isValidDose ? unitsRequired : 0} units drawn for a ${syringeSize} unit syringe`}
              viewBox="0 0 200 620"
              className="w-44 h-auto overflow-visible"
            >
              {/* Syringe Needle Bevel Tip */}
              <polygon
                points="99.4,12 100.6,10 100.6,14"
                fill="#94A3B8"
              />

              {/* Syringe Needle Shaft */}
              <line
                x1="100"
                y1="10"
                x2="100"
                y2="45"
                stroke="url(#needle-grad)"
                strokeWidth="1.2"
              />

              {/* Needle Hub (Insulin Orange Hub) */}
              <polygon
                points="95,45 105,45 107,60 93,60"
                fill="url(#orange-hub-grad)"
                stroke="#C2410C"
                strokeWidth="0.5"
              />

              {/* Luer Lock Collar at Top of Barrel */}
              <rect
                x="91"
                y="60"
                width="18"
                height="6"
                rx="1"
                fill="#F1F5F9"
                stroke="#E2E8F0"
                strokeWidth="0.5"
              />

              {/* Glass Barrel Inner Chamber Background */}
              <rect
                x="80"
                y="60"
                width="40"
                height="260"
                fill="url(#barrel-glass-grad)"
              />

              {/* Dynamic Fluid Fill (only when valid dose > 0) */}
              {isValidDose && unitsRequired > 0 && (
                <motion.path
                  initial={{ d: `M 80.5,70 Q 100,62 119.5,70 L 119.5,70 L 80.5,70 Z` }}
                  animate={{ 
                    d: `M 80.5,70 Q 100,62 119.5,70 L 119.5,${70 + fillFraction * 260} L 80.5,${70 + fillFraction * 260} Z` 
                  }}
                  transition={{ type: 'spring', damping: 25, stiffness: 120 }}
                  fill="url(#fluid-grad)"
                  opacity="0.85"
                />
              )}

              {/* Dynamic Plunger Stopper, Rod and Thumb Press Assembly */}
              <motion.g
                initial={{ y: 0 }}
                animate={{ y: fillFraction * 260 }}
                transition={{ type: 'spring', damping: 25, stiffness: 120 }}
              >
                {/* Rubber Stopper Conical Tip */}
                <polygon
                  points="81,70 100,62 119,70"
                  fill="#1E293B"
                />

                {/* Rubber Stopper Main Body */}
                <rect
                  x="81"
                  y="70"
                  width="38"
                  height="18"
                  rx="1"
                  fill="#1E293B"
                />
                
                {/* Rubber Stopper Rib Highlights */}
                <line
                  x1="81"
                  y1="75"
                  x2="119"
                  y2="75"
                  stroke="#0F172A"
                  strokeWidth="1.5"
                />
                <line
                  x1="81"
                  y1="83"
                  x2="119"
                  y2="83"
                  stroke="#0F172A"
                  strokeWidth="1.5"
                />

                {/* Plunger Rod (Cross-rib design) */}
                <rect
                  x="96"
                  y="88"
                  width="8"
                  height="260"
                  fill="url(#plunger-rod-grad)"
                />
                <rect
                  x="90"
                  y="88"
                  width="20"
                  height="260"
                  fill="url(#plunger-rib-grad)"
                  opacity="0.35"
                />
                <line
                  x1="100"
                  y1="88"
                  x2="100"
                  y2="348"
                  stroke="#CBD5E1"
                  strokeWidth="1"
                />

                {/* Plunger Base Thumb Press */}
                <ellipse
                  cx="100"
                  cy="348"
                  rx="24"
                  ry="6"
                  fill="url(#thumb-press-grad)"
                  stroke="#94A3B8"
                  strokeWidth="1"
                />
              </motion.g>

              {/* Ticks & Numbers Layer */}
              {renderTicks()}

              {/* Glass Barrel Finger Flange Grips (Wings at Base) */}
              <path
                d="M 52,328 C 52,326 148,326 148,328 L 144,336 C 144,338 56,338 56,336 Z"
                fill="url(#flange-grad)"
                stroke="#CBD5E1"
                strokeWidth="1.5"
                opacity="0.9"
              />

              {/* Glass Barrel Outer Walls (Overlaid) */}
              <rect
                x="79.5"
                y="60"
                width="41"
                height="262"
                rx="3"
                fill="none"
                stroke="url(#barrel-highlight-grad)"
                strokeWidth="1.5"
                opacity="0.85"
                pointerEvents="none"
              />

              {/* Glass Reflection Highlight */}
              <rect
                x="82"
                y="60"
                width="6"
                height="258"
                fill="url(#glass-shine-grad)"
                opacity="0.5"
                pointerEvents="none"
              />

              {/* DEFINITIONS FOR GRADIENTS */}
              <defs>
                <linearGradient id="needle-grad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#64748B" />
                  <stop offset="50%" stopColor="#E2E8F0" />
                  <stop offset="100%" stopColor="#475569" />
                </linearGradient>

                <linearGradient id="orange-hub-grad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#FB923C" stopOpacity="0.95" />
                  <stop offset="40%" stopColor="#F97316" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#EA580C" stopOpacity="0.95" />
                </linearGradient>
                
                <linearGradient id="barrel-glass-grad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#F1F5F9" stopOpacity="0.4" />
                  <stop offset="15%" stopColor="#FFFFFF" stopOpacity="0.75" />
                  <stop offset="40%" stopColor="#F8FAFC" stopOpacity="0.1" />
                  <stop offset="85%" stopColor="#F1F5F9" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#E2E8F0" stopOpacity="0.6" />
                </linearGradient>

                <linearGradient id="barrel-highlight-grad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#94A3B8" stopOpacity="0.8" />
                  <stop offset="15%" stopColor="#FFFFFF" stopOpacity="0.9" />
                  <stop offset="50%" stopColor="#CBD5E1" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#64748B" stopOpacity="0.7" />
                </linearGradient>

                <linearGradient id="glass-shine-grad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
                </linearGradient>

                <linearGradient id="flange-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
                  <stop offset="50%" stopColor="#F1F5F9" stopOpacity="0.7" />
                  <stop offset="100%" stopColor="#CBD5E1" stopOpacity="0.95" />
                </linearGradient>

                <linearGradient id="fluid-grad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#0EA5E9" stopOpacity="0.35" />
                  <stop offset="40%" stopColor="#38BDF8" stopOpacity="0.25" />
                  <stop offset="80%" stopColor="#0284C7" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#0369A1" stopOpacity="0.5" />
                </linearGradient>

                <linearGradient id="plunger-rod-grad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#E2E8F0" />
                  <stop offset="50%" stopColor="#F8FAFC" />
                  <stop offset="100%" stopColor="#CBD5E1" />
                </linearGradient>

                <linearGradient id="plunger-rib-grad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#E2E8F0" stopOpacity="0.1" />
                </linearGradient>

                <linearGradient id="thumb-press-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F8FAFC" />
                  <stop offset="100%" stopColor="#94A3B8" />
                </linearGradient>
              </defs>
            </svg>

            {/* Over capacity warning banner */}
            <AnimatePresence>
              {isOverCapacity && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="mt-6 flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl w-full"
                >
                  <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div className="flex flex-col">
                    <span className="text-xs font-medium tracking-[-0.005em]">Warning</span>
                    <span className="text-[11px] leading-normal mt-1 font-medium">
                      Calculated dose of <strong className="font-medium">{unitsRequired} units</strong> exceeds selected syringe capacity ({syringeSize} units). Consider drawing multiple smaller volumes or using a higher concentration.
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Syringe size label details */}
            <div className="mt-4 text-xs font-dm-mono uppercase tracking-[0.2em] text-black/40 text-center">
              Active Display: {syringeSize} Unit Syringe
            </div>
          </div>
        </div>

        {/* Warning card disclaimer */}
        <div className="bg-white border border-[#E6EAF1] rounded-[1.25rem] p-6 flex gap-4">
          <Info className="w-5 h-5 text-black/40 flex-shrink-0 mt-0.5" />
          <div className="flex flex-col">
            <span className="text-xs font-medium text-black tracking-[-0.005em] mb-1">
              {t('warningTitle')}
            </span>
            <span className="text-xs text-black/50 leading-relaxed">
              {t('warningText')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
