import { motion } from 'motion/react';
import { landingContent } from '../content';

export function TrustSection() {
  return (
    <>
      <motion.section
        id="trust"
        className="trust-shell"
        aria-labelledby="trust-title"
        initial={{ opacity: 0, y: 36 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.25 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
      >
        <div className="section-heading">
          <p className="section-kicker">Built for real moments</p>
          <h2 id="trust-title">Built for meetings, interviews, travel, classrooms, and multilingual daily life.</h2>
        </div>
        <div className="trust-signals">
          {landingContent.trustSignals.map((signal) => (
            <span key={signal} className="signal-pill">
              {signal}
            </span>
          ))}
        </div>
        <div className="use-case-row" aria-label="Supported use cases">
          {landingContent.useCases.map((useCase) => (
            <span key={useCase} className="use-case-pill">
              {useCase}
            </span>
          ))}
        </div>
      </motion.section>

      <motion.section
        className="final-cta-shell"
        aria-labelledby="final-cta-title"
        initial={{ opacity: 0, y: 36 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
      >
        <p className="section-kicker">Ready to try it</p>
        <h2 id="final-cta-title">Start hearing the whole conversation.</h2>
        <a className="primary-cta" href="#demo">
          Try the Demo
        </a>
      </motion.section>
    </>
  );
}
