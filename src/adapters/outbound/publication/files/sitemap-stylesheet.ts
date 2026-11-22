import type { IPublicationArtifact } from '../../../../domain/publication/publication-artifact.js';
import { artifact } from '../../rendering/vite/artifacts.js';

const stylesheet = `@namespace sm url("http://www.sitemaps.org/schemas/sitemap/0.9");
:root {
  display: block;
  box-sizing: border-box;
  max-width: 64rem;
  margin: 0 auto;
  padding: clamp(1rem, 4vw, 3rem);
  background: #f3f6fa;
  color: #203047;
  font: 400 1rem/1.6 system-ui, sans-serif;
  counter-reset: urls;
}
sm|urlset::before {
  content: "XML Sitemap";
  display: block;
  margin-bottom: 1.5rem;
  font-size: clamp(1.75rem, 4vw, 2.5rem);
  font-weight: 650;
  letter-spacing: -.035em;
}
sm|urlset::after {
  content: "URLs: " counter(urls);
  display: block;
  margin-top: 1.5rem;
  color: #52647b;
  font-size: .875rem;
}
sm|url {
  display: grid;
  grid-template-columns: 2.5rem minmax(0, 1fr);
  gap: .25rem .75rem;
  margin-block: .5rem;
  padding: 1rem;
  background: #fff;
  border-radius: .75rem;
  counter-increment: urls;
}
sm|url::before {
  content: counter(urls, decimal-leading-zero);
  color: #687c95;
  font-variant-numeric: tabular-nums;
}
sm|loc {
  display: block;
  overflow-wrap: anywhere;
}
sm|lastmod {
  display: block;
  grid-column: 2;
  color: #52647b;
  font-size: .875rem;
}
sm|priority, sm|changefreq {
  display: none;
}
`;

export function sitemapStylesheetArtifact(): IPublicationArtifact {
  const file = artifact('assets/styles/sitemap.css', 'text/css', stylesheet);

  return { ...file, path: 'assets/styles/sitemap.' + file.checksum.slice(0, 20) + '.css' };
}
