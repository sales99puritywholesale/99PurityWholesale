"use client";

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useCart } from '@/context/CartContext';
import { generateCartId } from '@/lib/cartUtils';

interface AddToInquiryButtonProps {
  productId: string;
  productName: string;
  category: string;
  spec: string;
  kitSize: number;
  moq?: number;
  categoryPage: string;
}

export default function AddToInquiryButton({
  productId,
  productName,
  category,
  spec,
  kitSize,
  moq = 10,
  categoryPage,
}: AddToInquiryButtonProps) {
  const t = useTranslations('Components.AddToInquiry');
  const { state, dispatch } = useCart();
  const [showAdded, setShowAdded] = useState(false);

  const itemId = generateCartId(productId, spec, kitSize);
  const isInCart = state.items.some(item => item.id === itemId);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (showAdded) {
      timeout = setTimeout(() => {
        setShowAdded(false);
      }, 1500);
    }
    return () => clearTimeout(timeout);
  }, [showAdded]);

  const handleAdd = () => {
    if (!isInCart) {
      dispatch({
        type: 'ADD_ITEM',
        payload: {
          id: itemId,
          productId,
          productName,
          category,
          spec,
          kitSize,
          moq,
          categoryPage,
        },
      });
      setShowAdded(true);
    }
    dispatch({ type: 'OPEN_DRAWER' });
  };

  // Determine button styles based on state
  let buttonClasses = "w-full font-dm-sans font-medium text-[12px] sm:text-[13px] tracking-[-0.01em] py-3 sm:py-3.5 px-5 rounded-full transition-colors duration-300 border flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-[#4FC3D0] focus-visible:ring-offset-2 ";
  let buttonText = t('add');

  if (showAdded) {
    buttonClasses += "bg-[#4FC3D0]/15 border-[#4FC3D0]/50 text-[#0B6F7B]";
    buttonText = t('added');
  } else if (isInCart) {
    buttonClasses += "bg-transparent border-[#0B0F14]/15 text-[#0B0F14] hover:bg-[#0B0F14] hover:text-white hover:border-[#0B0F14]";
    buttonText = t('inInquiry');
  } else {
    buttonClasses += "bg-[#0B0F14] border-[#0B0F14] text-white hover:bg-[#4FC3D0] hover:border-[#4FC3D0] hover:text-[#0B0F14]";
  }

  return (
    <button
      onClick={handleAdd}
      className={buttonClasses}
    >
      {buttonText}
    </button>
  );
}
