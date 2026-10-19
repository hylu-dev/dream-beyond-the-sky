// Vite's base includes the repository path on GitHub Pages. The fallback
// keeps modules importable by the Node-based asset checks.
export function assetUrl(path) {
  return `${import.meta.env?.BASE_URL ?? '/'}assets/${path.replace(/^\/+/, '')}`;
}
