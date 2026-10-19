# GitHub Pages hosting

The game is live at https://hylu-dev.github.io/jst-2-demo/.

Release `7718cea` was published to `main` from the separate release checkout
at `/tmp/splat-pages-release-20261019`. The active development checkout was
left on `cinematic-and-flight` with its uncommitted work preserved.
[Deployment run](https://github.com/hylu-dev/jst-2-demo/actions/runs/39216573034)
succeeded. Live checks returned HTTP 200 for the page and 48 asset URLs,
confirmed both bilingual titles, and matched the favicon to the approved Dawn PNG.
GitHub Pages is enabled with GitHub Actions and HTTPS. The user made the
repository public, resolving the earlier private-repository plan restriction.
The release workflow publishes the game when changes reach `main`.

## Enable deployment

1. [Repository Pages settings](https://github.com/hylu-dev/jst-2-demo/settings/pages)
   already use **GitHub Actions** as the build source.
2. Commit the game source and assets that should ship, then merge/push them
   to `main`. Development can continue on `cinematic-and-flight`; publish a
   reviewed snapshot so unfinished edits stay in the development checkout.
3. Watch **Deploy game to GitHub Pages** in the Actions tab. Future pushes to
   `main` redeploy automatically. The workflow also supports manual runs.

The site and its downloadable game assets are public when hosted through
ordinary GitHub Pages, even when the source repository stays private.

## Build and paths

`.github/workflows/pages.yml` installs the lockfile with Node 22, builds with
Vite, uploads `dist`, and deploys using the `github-pages` environment.
The workflow reads the site's base path from GitHub's Pages configuration.
`vite.config.js` passes that path to Vite; `src/assetUrl.js` applies it to
runtime requests for splats, animation, cliff textures, leaves and audio.
Development still uses `/` by default. Only the game entry point is published;
the standalone asset-review HTML pages remain development tools.

To preview the repository-path build locally:

```sh
PAGES_BASE_PATH=/jst-2-demo npm run build
PAGES_BASE_PATH=/jst-2-demo npm run preview
```

Open `http://localhost:4173/jst-2-demo/`.

Validation completed: production build under `/jst-2-demo/`, 19 runtime asset
references present in the output, generated HTML bundle links, root and
repository-prefix URL handling, lockfile dry run, and cliff/cloud checks.
The workflow checks deployment status. Final GPU rendering still requires
review in a browser; the automated asset checks use a null graphics device.

References: [Vite Pages deployment](https://vite.dev/guide/static-deploy.html#github-pages)
and [GitHub Pages availability](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).
