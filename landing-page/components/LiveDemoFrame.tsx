import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { landingContent } from '../content';
import { buildDemoTimeline } from './demoTimeline';

export function LiveDemoFrame() {
  const [scenarioId, setScenarioId] = useState<(typeof landingContent.demoScenarios)[number]['id']>(
    landingContent.demoScenarios[0].id,
  );
  const scenario =
    landingContent.demoScenarios.find((item) => item.id === scenarioId) ??
    landingContent.demoScenarios[0];
  const timeline = useMemo(() => buildDemoTimeline(scenario.lines), [scenario]);
  const [visibleCount, setVisibleCount] = useState(1);

  useEffect(() => {
    setVisibleCount(1);

    const timers = timeline.slice(1).map((item, index) =>
      window.setTimeout(() => {
        setVisibleCount(index + 2);
      }, item.delayMs),
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [timeline]);

  return (
    <section id="demo" className="demo-shell" aria-label="SpeechBridge demo">
      <div className="demo-topline">
        <div>
          <p className="demo-kicker">Product experience</p>
          <h2 className="demo-title">Live translation that stays readable while the conversation moves.</h2>
        </div>
        <span className="recording-pill">
          <span className="recording-dot" aria-hidden="true" />
          Live
        </span>
      </div>

      <div className="demo-toolbar" role="tablist" aria-label="Demo scenarios">
        {landingContent.demoScenarios.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === scenarioId ? 'scenario-pill active' : 'scenario-pill'}
            onClick={() => setScenarioId(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="demo-grid">
        <div className="demo-panel">
          <div className="demo-panel-header">
            <p className="demo-label">Transcription</p>
            <p className="demo-language">ZH-CN</p>
          </div>
          {timeline.slice(0, visibleCount).map((line) => (
            <motion.p
              key={`${scenario.id}-${line.delayMs}-o`}
              className="demo-line"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
            >
              {line.original}
            </motion.p>
          ))}
        </div>

        <div className="demo-panel">
          <div className="demo-panel-header">
            <p className="demo-label">Translation</p>
            <p className="demo-language">FR</p>
          </div>
          {timeline.slice(0, visibleCount).map((line) => (
            <motion.p
              key={`${scenario.id}-${line.delayMs}-t`}
              className="demo-line demo-line--translated"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.12, ease: 'easeOut' }}
            >
              {line.translated}
            </motion.p>
          ))}
        </div>
      </div>
    </section>
  );
}
