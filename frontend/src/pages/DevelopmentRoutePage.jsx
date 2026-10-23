import { ArrowRight, Construction } from "lucide-react";
import { Link } from "react-router-dom";

export default function DevelopmentRoutePage({ page }) {
  return (
    <section className="development-route-page" aria-labelledby="development-route-title">
      <div className="development-route-icon" aria-hidden="true">
        <Construction size={22} />
      </div>
      <p className="development-route-eyebrow">Navigation ready · Workflow not implemented</p>
      <h1 id="development-route-title">{page.title}</h1>
      <p className="development-route-summary">{page.summary}</p>
      <div className="development-route-detail">
        <h2>Backend status</h2>
        <p>{page.backend}</p>
      </div>
      <div className="development-route-detail">
        <h2>Implementation boundary</h2>
        <p>{page.nextStep}</p>
      </div>
      {page.relatedPath && (
        <Link className="development-route-link" to={page.relatedPath}>
          {page.relatedLabel}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      )}
    </section>
  );
}
