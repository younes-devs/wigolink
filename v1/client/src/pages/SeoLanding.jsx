import { Link, useLocation } from 'react-router-dom';
import { Icon } from '../Icons.jsx';
import { getSeoLanding } from '../../../shared/seo-landings.js';
import { useIndexable } from '../useIndexable.js';
import { usePageSeo } from '../app/Seo.jsx';
import { getSeoLandingContent } from '../../../shared/seo-landing-content.js';

export default function SeoLanding() {
  const { pathname } = useLocation();
  const locale = document.documentElement.lang || 'fr';
  const landing = getSeoLanding(locale, pathname);
  const content = getSeoLandingContent(locale);

  useIndexable();
  usePageSeo(landing ? {
    title: landing.title,
    description: landing.description,
    canonicalPath: landing.path,
    alternates: landing.alternates,
    jsonLd: landing.jsonLd,
  } : {});

  if (!landing) return null;

  return (
    <article className="seo-landing">
      <header className="seo-landing-hero">
        <span className="seo-landing-eyebrow">{landing.eyebrow}</span>
        <h1>{landing.h1}</h1>
        <p>{landing.intro}</p>
        <Link className="btn btn-primary seo-landing-cta" to="/trajets">
          {landing.cta}<Icon name="arrowRight" size={18} />
        </Link>
      </header>

      <section className="seo-landing-section" aria-labelledby="seo-how-title">
        <h2 id="seo-how-title">{landing.howTitle}</h2>
        <ol className="seo-landing-steps">
          {landing.steps.map((step, index) => (
            <li key={step}><span>{index + 1}</span><p>{step}</p></li>
          ))}
        </ol>
      </section>

      <section className="seo-landing-section seo-landing-detail">
        <Icon name="shield" size={24} />
        <div><h2>{landing.detailsTitle}</h2><p>{landing.details}</p></div>
      </section>

      <section className="seo-landing-section" aria-labelledby="seo-audience-title">
        <h2 id="seo-audience-title">{content.audienceTitle}</h2>
        <div className="seo-landing-audience">
          {content.audience.map(([title, text]) => (
            <article key={title} className="seo-landing-panel">
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="seo-landing-section" aria-labelledby="seo-preparation-title">
        <h2 id="seo-preparation-title">{content.preparationTitle}</h2>
        <ul className="seo-landing-checklist">
          {content.preparation.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>

      <section className="seo-landing-section seo-landing-trust" aria-labelledby="seo-trust-title">
        <h2 id="seo-trust-title">{content.trustTitle}</h2>
        <p>{content.trust}</p>
      </section>

      <section className="seo-landing-section" aria-labelledby="seo-faq-title">
        <h2 id="seo-faq-title">{landing.faqTitle}</h2>
        <div className="seo-landing-faq">
          {landing.faqs.map(([question, answer]) => (
            <details key={question}><summary>{question}</summary><p>{answer}</p></details>
          ))}
        </div>
      </section>

      <footer className="seo-landing-footer">
        <h2>{content.relatedTitle}</h2>
        <nav className="seo-landing-related" aria-label={content.relatedTitle}>
          {content.related.map(([label, href]) => <Link key={href} to={href}>{label}<Icon name="arrowRight" size={16} /></Link>)}
        </nav>
        <Link className="btn btn-primary seo-landing-cta" to="/trajets">
          {landing.cta}<Icon name="arrowRight" size={18} />
        </Link>
      </footer>
    </article>
  );
}
