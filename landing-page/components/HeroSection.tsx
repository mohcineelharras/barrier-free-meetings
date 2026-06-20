import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { landingContent } from '../content';

interface HeroSectionProps {
  demo: ReactNode;
}

export function HeroSection({ demo }: HeroSectionProps) {
  return (
    <section className="hero-shell">
      <div className="hero-copy">
        <p className="hero-eyebrow">{landingContent.hero.eyebrow}</p>
        <motion.h1
          className="hero-title"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        >
          {landingContent.hero.title}
        </motion.h1>
        <motion.p
          className="hero-body"
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.08, ease: 'easeOut' }}
        >
          {landingContent.hero.description}
        </motion.p>
        <motion.div
          className="hero-actions"
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.16, ease: 'easeOut' }}
        >
          <a className="primary-cta" href="#demo">
            {landingContent.hero.ctaLabel}
          </a>
          <p className="hero-proof">{landingContent.hero.proof}</p>
        </motion.div>
      </div>

      <motion.div
        className="hero-demo"
        initial={{ opacity: 0, scale: 0.96, y: 32 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.9, delay: 0.2, ease: 'easeOut' }}
      >
        {demo}
      </motion.div>
    </section>
  );
}
