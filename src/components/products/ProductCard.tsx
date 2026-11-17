import Image from 'next/image';
import { ArrowUpRight, FlaskConical } from 'lucide-react';
import { Link } from '@/i18n/routing';
import AddToInquiryButton from '@/components/products/AddToInquiryButton';
import { productImageSrc } from '@/components/products/product-images';

interface ProductCardProps {
  product: { name: string; slug: string; category: string; specs: string[] };
  description: string;
  /** Overrides the image from the shared slug map (used by related products). */
  imageSrc?: string | null;
  sizes?: string;
  /** Marks the card as a reveal target for RevealGroup. */
  reveal?: boolean;
}

/** Catalog card shared by the directory, category pages and related-product rows. */
export default function ProductCard({ product, description, imageSrc, sizes = '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw', reveal = true }: ProductCardProps) {
  const src = imageSrc === undefined ? productImageSrc(product.slug) : imageSrc;
  const [spec, kitSizeStr] = (product.specs[0] || '10mg×10').split('×');
  const kitSize = parseInt(kitSizeStr) || 10;

  return (
    <div
      {...(reveal ? { 'data-reveal': true } : {})}
      className="group flex h-full flex-col overflow-hidden rounded-[1.25rem] border border-[#E6EAF1] bg-white p-2 transition-shadow duration-500 hover:shadow-[0_24px_60px_rgba(11,15,20,0.08)]"
    >
      <Link href={`/products/${product.slug}`} className="flex flex-1 flex-col outline-none focus-visible:ring-2 focus-visible:ring-[#4FC3D0]">
        <div className="relative aspect-square w-full overflow-hidden rounded-[0.9rem] bg-[#F3F5FA]">
          {src ? (
            <Image
              src={src}
              alt={`${product.name} High Purity Wholesale Research Peptide`}
              fill
              sizes={sizes}
              className="object-contain p-[6%] mix-blend-multiply transition-transform duration-[900ms] ease-out group-hover:scale-[1.05]"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-4 text-center">
              <FlaskConical className="mb-2 h-9 w-9 text-[#0B0F14]/15" />
              <span className="font-dm-mono text-[9px] uppercase tracking-[0.18em] text-[#0B0F14]/35">Research Only</span>
            </div>
          )}
          <span className="absolute left-2.5 top-2.5 max-w-[85%] truncate rounded-full bg-white/90 px-2.5 py-1 font-dm-mono text-[8px] uppercase tracking-[0.14em] backdrop-blur sm:text-[9px]">
            {product.category.replace(/-/g, ' ')}
          </span>
        </div>
        <div className="flex flex-1 flex-col px-2.5 pb-2 pt-4 sm:px-3">
          <h3 className="mb-1.5 text-[15px] font-normal leading-snug tracking-[-0.025em] sm:text-lg">{product.name}</h3>
          <p className="line-clamp-2 text-[12px] leading-relaxed text-[#0B0F14]/55 sm:text-[13px]">{description}</p>
        </div>
      </Link>

      <div className="mt-auto flex flex-col gap-3 px-2.5 pb-2.5 pt-3 sm:px-3">
        <AddToInquiryButton
          productId={product.slug}
          productName={product.name}
          category={product.category}
          spec={spec}
          kitSize={kitSize}
          categoryPage={`/products/${product.category}`}
        />
        <div className="flex items-center justify-between border-t border-[#E6EAF1] pt-3 font-dm-mono text-[10px] uppercase tracking-[0.14em] text-[#0B0F14]/50">
          <span>{product.specs.length} Specs</span>
          <Link href={`/products/${product.slug}`} className="flex items-center gap-1.5 text-[#0B0F14] hover:text-[#0B6F7B]">
            Details
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:rotate-45" />
          </Link>
        </div>
      </div>
    </div>
  );
}
