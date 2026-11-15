'use client';

import { ReactLenis } from '@studio-freight/react-lenis';
import { useEffect, useRef, Suspense } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { usePathname, useSearchParams } from 'next/navigation';

export default function SmoothScrollProvider({ children }: { children: React.ReactNode }) {
  const lenisRef = useRef<any>(null);

  useEffect(() => {
    // Check if device is mobile or touch; use native scrolling for zero CPU overhead
    const isTouchOrMobile = typeof window !== 'undefined' && (window.innerWidth < 768 || window.matchMedia('(pointer: coarse)').matches);

    // Register ScrollTrigger
    gsap.registerPlugin(ScrollTrigger);

    const lenisInstance = lenisRef.current?.lenis;
    if (lenisInstance) {
      if (isTouchOrMobile) {
        lenisInstance.stop();
        return;
      }
      // Keep GSAP ScrollTrigger updated on Lenis scroll
      lenisInstance.on('scroll', ScrollTrigger.update);
      (window as any).lenis = lenisInstance;

      ScrollTrigger.addEventListener("refresh", () => lenisInstance.resize());
      ScrollTrigger.refresh();
    }

    if (isTouchOrMobile) return;

    // High performance frame ticker sync:
    // Drive Lenis animations via GSAP's internal requestAnimationFrame ticker loop.
    function update(time: number) {
      lenisRef.current?.lenis?.raf(time * 1000);
    }

    gsap.ticker.add(update);

    // Clean up connections on unmount
    return () => {
      gsap.ticker.remove(update);
      if (lenisInstance) {
        lenisInstance.off('scroll', ScrollTrigger.update);
        if ((window as any).lenis === lenisInstance) {
          delete (window as any).lenis;
        }
      }
    };
  }, []);

  return (
    <ReactLenis
      root
      ref={lenisRef}
      autoRaf={false}
      options={{
        duration: 1.0,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // Silky smooth premium ease-out curve
        orientation: 'vertical',
        gestureOrientation: 'vertical',
        smoothWheel: true,
        wheelMultiplier: 1.15,
        touchMultiplier: 1.5,
        infinite: false,
      }}
    >
      {children}
      <Suspense fallback={null}>
        <ScrollRevealManager />
      </Suspense>
    </ReactLenis>
  );
}

// Separate client component wrapped in Suspense to avoid build-time static de-optimization
function ScrollRevealManager() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const timer = setTimeout(() => {
      initScrollReveals();
    }, 150); // Small delay to let DOM mount completely

    return () => {
      clearTimeout(timer);
    };
  }, [pathname, searchParams]);

  return null;
}

// Core text node word splitter (keeps existing element HTML/styling nodes intact and avoids clipping italics)
function splitTextWords(element: HTMLElement) {
  const nodes = Array.from(element.childNodes);
  nodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (text.trim() === '') return;

      const wrapper = document.createDocumentFragment();
      const words = text.split(' ');

      words.forEach((word, wordIdx) => {
        if (word === '') {
          wrapper.appendChild(document.createTextNode(' '));
          return;
        }

        const wordOuter = document.createElement('span');
        wordOuter.style.display = 'inline-block';
        wordOuter.style.overflow = 'hidden';
        wordOuter.style.verticalAlign = 'bottom';
        // Add margin and padding safeguards to prevent italic slants/glyphs from clipping
        wordOuter.style.paddingLeft = '0.04em';
        wordOuter.style.paddingRight = '0.22em';
        wordOuter.style.marginLeft = '-0.04em';
        wordOuter.style.marginRight = '-0.18em';

        const wordInner = document.createElement('span');
        wordInner.textContent = word;
        wordInner.style.display = 'inline-block';
        wordInner.className = 'reveal-word-inner';

        wordOuter.appendChild(wordInner);
        wrapper.appendChild(wordOuter);

        if (wordIdx < words.length - 1) {
          wrapper.appendChild(document.createTextNode(' '));
        }
      });

      element.replaceChild(wrapper, node);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (['SPAN', 'EM', 'I', 'STRONG', 'B'].includes(el.tagName)) {
        splitTextWords(el);
      }
    }
  });
}

// ScrollTrigger initialization function
function initScrollReveals() {
  // 1. Kill any existing scroll triggers from previous route to prevent memory leaks/glitches
  // Triggers owned by a page-level component (inside [data-gsap-owned], or id "keep-*") clean up
  // through their own gsap.matchMedia/context, so they must not be killed here.
  ScrollTrigger.getAll().forEach(trigger => {
    const owner = trigger.trigger instanceof Element ? trigger.trigger.closest('[data-gsap-owned]') : null;
    const keepId = typeof trigger.vars.id === 'string' && trigger.vars.id.startsWith('keep-');
    if (owner || keepId) return;
    trigger.kill();
  });

  // 2. Split-text slide-in reveals (.reveal-text)
  const textElements = document.querySelectorAll('.reveal-text');
  const isMobile = window.innerWidth < 768; // Skip heavy DOM parsing on mobile
  
  textElements.forEach((el) => {
    const htmlEl = el as HTMLElement;
    if (!htmlEl.classList.contains('is-split') && !isMobile) {
      splitTextWords(htmlEl);
      htmlEl.classList.add('is-split');
    }

    const words = htmlEl.querySelectorAll('.reveal-word-inner');
    if (words.length > 0) {
      gsap.fromTo(words,
        { yPercent: 100 },
        {
          yPercent: 0,
          duration: 0.30,
          ease: 'power3.out',
          stagger: 0.010,
          scrollTrigger: {
            trigger: htmlEl,
            start: 'top 90%',
            toggleActions: 'play none none none',
          }
        }
      );
    }
  });

  // 3. Premium Parallax elements (.reveal-parallax)
  const parallaxContainers = document.querySelectorAll('.reveal-parallax');
  parallaxContainers.forEach((container) => {
    const htmlContainer = container as HTMLElement;
    const img = htmlContainer.querySelector('img') as HTMLElement;
    if (img) {
      htmlContainer.style.overflow = 'hidden';
      if (!htmlContainer.style.position || htmlContainer.style.position === 'static') {
        htmlContainer.style.position = 'relative';
      }

      gsap.fromTo(img,
        { yPercent: -12, scale: 1.08 },
        {
          yPercent: 12,
          scale: 1.08,
          ease: 'none',
          scrollTrigger: {
            trigger: htmlContainer,
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
          }
        }
      );
    }
  });

  // 4. SVG Drawing lines (.reveal-line)
  const drawLines = document.querySelectorAll('.reveal-line path, path.reveal-line');
  drawLines.forEach((pathEl) => {
    const path = pathEl as SVGPathElement;
    let length = 0;
    try {
      length = path.getTotalLength() || 0;
    } catch (e) {
      // Fallback if browser doesn't support getTotalLength on current path
    }
    if (length === 0) return;

    gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });

    const isScrub = path.getAttribute('data-scrub') === 'true';
    if (isScrub) {
      gsap.to(path, {
        strokeDashoffset: 0,
        ease: 'none',
        scrollTrigger: {
          trigger: path,
          start: 'top 92%',
          end: 'bottom 40%',
          scrub: true,
        }
      });
    } else {
      gsap.to(path, {
        strokeDashoffset: 0,
        duration: 1.8,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: path,
          start: 'top 95%',
          toggleActions: 'play none none none',
        }
      });
    }
  });

  // 5. Staggered card grid fade-slide-in (.reveal-grid)
  const grids = document.querySelectorAll('.reveal-grid');
  grids.forEach((gridEl) => {
    const cards = gridEl.querySelectorAll('.reveal-card');
    if (cards.length > 0) {
      // Set initial hidden state of cards
      gsap.set(cards, { y: 50, opacity: 0 });

      ScrollTrigger.batch(cards, {
        start: 'top 95%',
        interval: 0.05,
        batchMax: 4, // 4 columns max on desktop grids
        onEnter: (batch) => {
          gsap.to(batch, {
            y: 0,
            opacity: 1,
            duration: 0.55,
            ease: 'power3.out',
            stagger: 0.05,
            onComplete: () => {
              // Clear transform and opacity properties so CSS hover transitions operate natively
              gsap.set(batch, { clearProps: 'transform,opacity' });
            }
          });
        },
        once: true
      });
    }
  });

  // 6. 3D card tilt/scale-reveal (.reveal-card-3d)
  const cards3d = document.querySelectorAll('.reveal-card-3d');
  cards3d.forEach((cardEl) => {
    const htmlCard = cardEl as HTMLElement;
    const parent = htmlCard.parentElement;
    if (parent) {
      parent.style.perspective = '1500px';
      parent.style.transformStyle = 'preserve-3d';
    }

    gsap.fromTo(htmlCard,
      {
        rotationX: 16,
        scale: 0.91,
        transformOrigin: 'top center',
      },
      {
        rotationX: 0,
        scale: 1,
        ease: 'none',
        scrollTrigger: {
          trigger: htmlCard,
          start: 'top bottom',
          end: 'bottom 75%',
          scrub: true,
        }
      }
    );
  });

  // 7. Refresh ScrollTrigger to recalculate positioning
  ScrollTrigger.refresh();
}

if (typeof window !== 'undefined') {
  (window as any).initScrollReveals = initScrollReveals;
}

