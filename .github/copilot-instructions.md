# Copilot Instructions for web_service_template

## Project Overview

A static website template built with Vite and vanilla JavaScript/CSS/HTML, designed to be forked as a starting point for new static site projects. It includes a multi-stage Docker setup (development, build, production via a Node/Express server that enforces Cloudflare Access JWT validation), GitHub Actions CI/CD for automated deployment to Cloud Run, and PR preview environments.

## Security — The Single Most Important Principle

**Security is the single most important concern in this application. It overrides all other considerations, including convenience, brevity, or backwards compatibility.**

### JWT Enforcement

The Express production server validates a Cloudflare Access JWT on **every incoming request** via the `verifyAccessJwt` middleware (`app/middleware/cloudflareAccess.js`). This is non-negotiable:

- **Missing token → HTTP 403.** If the `Cf-Access-Jwt-Assertion` header is absent, the request is rejected immediately with `403 Forbidden`.
- **Invalid token → HTTP 403.** If the JWT signature verification fails for any reason (wrong key, tampered payload, audience mismatch, issuer mismatch), the request is rejected with `403 Forbidden`.
- **Expired token → HTTP 403.** An expired JWT is treated the same as an invalid one and is rejected with `403 Forbidden`.
- **No bypass paths.** There must be no route, middleware, or configuration that allows a request to reach application logic without first passing JWT validation. Health-check endpoints or static asset routes are not exemptions unless explicitly approved and documented.
- **Fail closed.** Any error during token verification must result in rejection (HTTP 403), never in granting access. Do not silently swallow errors.

When making any change to the server, middleware, routing, or Docker configuration, verify that JWT enforcement remains intact for every reachable endpoint.

## Key Principles

These principles override all other considerations except the Security principle above. When in doubt, follow them literally.

1. **One canonical way.** There must be exactly one supported way to do anything. No fallback options, optional feature toggles, or backwards-compatible alternative code paths. No if/else branches that switch between two implementations.
2. **No migration logic.** Do not write custom migration scripts or state-import logic. Assume either a clean-slate deployment or already-properly-deployed state. If a change requires manual intervention, leave a PR comment telling the developer exactly what manual steps to perform.
3. **No backwards compatibility.** When changing approaches, remove the old way entirely. Never leave old code as a fallback.
4. **Minimal dependencies.** Only add what is strictly necessary. Do not introduce libraries or tools unless there is a clear, immediate need. The project currently has only one dependency (Vite) — keep it lean.
5. **If something doesn't make sense, say so.** The repository owner relies on expert guidance. Push back on requests that would violate these principles or introduce unnecessary complexity.
6. **Static-only.** This is a static website template. Do not add backend logic, server-side rendering, or API endpoints.
7. **Template-friendly.** Changes should keep the project easy to fork and adapt. Avoid hard-coded project-specific values — use environment variables or Vite config for anything deployment-specific.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│           GitHub Pages (Static Hosting)              │
│  - Main branch: /{repo-name}/                        │
│  - PR previews: /{repo-name}/pr-preview/pr-{N}/     │
└─────────────────────────────────────────────────────┘
                         ▲
                         │ peaceiris/actions-gh-pages@v4
                         │
              ┌──────────┴──────────┐
              │   GitHub Actions    │
              │  deploy-main.yml    │
              │  deploy-pr-preview  │
              └──────────┬──────────┘
                         │ npm run build
                         │
              ┌──────────▼──────────┐
              │     Vite Build      │
              │  BASE_URL dynamic   │
              │  Output: dist/      │
              └──────────┬──────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
   ┌────▼────┐     ┌────▼────┐     ┌────▼──────┐
   │ src/    │     │ public/ │     │index.html │
   │ JS/CSS  │     │ assets  │     │ (entry)   │
   └─────────┘     └─────────┘     └───────────┘
```

**Components:**

- **Entry point** (`index.html`): HTML document with `<div id="app">` populated by JavaScript.
- **Source code** (`src/`): `main.js` (app logic, renders content to `#app`) and `style.css` (global styles with CSS variables, dark/light mode support).
- **Static assets** (`public/`): Files served as-is at the root path.
- **Build config** (`vite.config.js`): Minimal config — only sets `base` from `BASE_URL` environment variable.
- **Docker** (`Dockerfile`): Three stages — `development` (Vite dev server), `build` (npm ci + vite build), `production` (Node/Express server serving dist/ with Cloudflare Access JWT middleware).
- **CI/CD** (`.github/workflows/`): Two workflows — main branch deployment and PR preview deployment, both to GitHub Pages.
- **Dev container** (`.devcontainer/`): VS Code devcontainer using the Docker development stage with Prettier auto-format.

## Logging

**Log extensively.** This application is under heavy development and is primarily developed using AI agents that have access to application logs through an MCP server. The more information in the logs, the better — verbose logging helps AI agents diagnose issues, understand runtime behavior, and make better decisions.

- Log all significant operations: incoming requests, outgoing responses, errors, state changes, decisions made, and external service calls.
- Include context in log entries: relevant IDs, parameters, timing, and trace information.
- Use appropriate severity levels (DEBUG, INFO, WARNING, ERROR) but err on the side of logging more rather than less.
- Do not worry about log volume — there is currently a single developer and zero users, so log storage/cost is not a concern.
- Use `@google-cloud/logging` `LogSync` directly for structured JSON logging on Cloud Run (no custom wrappers).

## Coding Conventions

### General

- **No backwards compatibility.** When changing approaches, remove the old way entirely.
- **No fallback logic.** If something fails, let it fail cleanly rather than adding defensive workarounds.
- **Never hide missing configuration.** If a deployment or build fails because a required secret, environment variable, or configuration value is missing, let it fail loudly. Do not insert placeholder values, defaults, or workarounds that mask the problem. The failure is the signal that tells the developer what action is needed.
- **Minimal dependencies.** Only add what is strictly necessary.
- **If something doesn't make sense, say so.** The repository owner relies on expert guidance.

### JavaScript

- ES6 modules (`"type": "module"` in package.json).
- camelCase for variables and functions.
- Template literals for HTML rendering.
- No TypeScript — vanilla JavaScript only.
- No framework — vanilla DOM manipulation.

### CSS

- Vanilla CSS with CSS variables (`:root` custom properties).
- kebab-case for class names.
- Support both dark and light color schemes via `prefers-color-scheme`.
- System font stack.

### HTML

- Semantic HTML5.
- Single `<div id="app">` container for JavaScript-rendered content.
- Module scripts: `<script type="module" src="/src/main.js">`.

### Formatting

- Prettier with default settings (configured in devcontainer, format on save).
- No explicit `.prettierrc` — uses Prettier defaults.

### Docker

- Multi-stage builds with named stages (`development`, `build`, `production`).
- `node:22-bookworm` for Node stages, `node:22-bookworm-slim` for production.
- Use `npm ci` for reproducible builds in CI and Docker build stages.
- Use `npm install` only in development stage.

### GitHub Actions

- Use `npm ci` for dependency installation.
- Set `BASE_URL` environment variable for builds to support path-based deployments.
- Use concurrency groups to cancel in-progress PR deployments on new pushes.

## Repository Structure

```
.
├── .devcontainer/
│   └── devcontainer.json         # VS Code dev container (Docker, Prettier, port 5173)
├── .github/
│   ├── copilot-instructions.md   # This file
│   └── workflows/
│       ├── deploy-main.yml       # Push to main → build and deploy to GitHub Pages
│       └── deploy-pr-preview.yml # PR → build and deploy preview to GitHub Pages subdirectory
├── public/
│   └── vite.svg                  # Static asset served at root
├── src/
│   ├── main.js                   # App entry point — renders content to #app
│   └── style.css                 # Global styles with CSS variables, dark/light mode
├── .dockerignore                 # Excludes node_modules, dist, .git from Docker context
├── .gitignore                    # Excludes node_modules, dist, build artifacts
├── Dockerfile                    # Multi-stage: development, build, production (Node/Express)
├── README.md                     # Getting started, prerequisites, project structure
├── index.html                    # HTML entry point with <div id="app">
├── package-lock.json             # Locked dependency versions
├── package.json                  # Project config — only devDependency is Vite
└── vite.config.js                # Vite config — dynamic BASE_URL for deployments
```

## Configuration & Secrets

| Name | Where | Purpose |
|------|-------|---------|
| `GITHUB_TOKEN` | Auto-provided by GitHub Actions | Used by `peaceiris/actions-gh-pages@v4` to push built files to GitHub Pages |
| `BASE_URL` | Set in GitHub Actions workflow as env var | Path prefix for the built site (e.g., `/{repo-name}/` or `/{repo-name}/pr-preview/pr-{N}/`). Defaults to `/` in local development |

No other secrets, API keys, or external service credentials are required.

## When Making Changes

- Always remove old code when replacing an approach — never leave it as a fallback.
- If a change requires manual cleanup, document the exact steps in a PR comment instead of writing migration code.
- Keep components independent — changes in one area should not require changes in another unless absolutely necessary.
- Test locally with `npm run dev` before pushing.
- PR preview environments are automatically deployed — use them to verify changes visually before merging.
- Build locally with `npm run build` and preview with `npm run preview` to catch build issues before CI.
- Keep the template generic and forkable — avoid hard-coding project-specific values.
