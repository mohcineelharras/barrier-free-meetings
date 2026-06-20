import { HeroSection } from './components/HeroSection';
import { LiveDemoFrame } from './components/LiveDemoFrame';
import { StorySection } from './components/StorySection';
import { TrustSection } from './components/TrustSection';

export default function App() {
  return (
    <div className="landing-root">
      <header className="site-header">
        <a className="brand-lockup" href="#top" aria-label="SpeechBridge home">
          <span className="brand-mark" aria-hidden="true">
            <span className="brand-mark-rail" />
            <span className="brand-mark-arch" />
            <span className="brand-mark-center" />
          </span>
          <span className="brand-wordmark">SpeechBridge</span>
        </a>

        <nav className="site-nav" aria-label="Primary">
          <a className="nav-link" href="#problem">
            Problem
          </a>
          <a className="nav-link" href="#solution">
            Solution
          </a>
          <a className="nav-link" href="#trust">
            Trust
          </a>
          <a className="header-cta" href="#demo">
            Try the Demo
          </a>
        </nav>
      </header>

      <main id="top">
        <HeroSection demo={<LiveDemoFrame />} />
        <StorySection />
        <TrustSection />
      </main>
    </div>
  );
}
