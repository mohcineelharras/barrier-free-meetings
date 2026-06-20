import { motion } from 'motion/react';
import { landingContent } from '../content';

export function StorySection() {
  return (
    <>
      <motion.section
        id="problem"
        className="story-shell"
        aria-labelledby="problem-title"
        initial={{ opacity: 0, y: 36 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.35 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
      >
        <div className="section-heading">
          <p className="section-kicker">The problem</p>
          <h2 id="problem-title">Live multilingual moments move too fast for fragmented tools.</h2>
        </div>
        <div className="story-points">
          {landingContent.problemPoints.map((point) => (
            <p key={point}>{point}</p>
          ))}
        </div>
      </motion.section>

      <motion.section
        id="solution"
        className="feature-shell"
        aria-labelledby="feature-title"
        initial={{ opacity: 0, y: 36 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
      >
        <div className="section-heading">
          <p className="section-kicker">The solution</p>
          <h2 id="feature-title">A calm bridge between spoken language and understanding.</h2>
        </div>
        <div className="feature-list">
          {landingContent.features.map((feature, index) => (
            <article key={feature.title} className="feature-card">
              <span className="feature-index">{`0${index + 1}`}</span>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </article>
          ))}
        </div>
      </motion.section>
    </>
  );
}
