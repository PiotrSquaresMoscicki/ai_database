# static_web_service_template

This repository is meant to be forked and used as base for creating static webpage with no backend meant to be hosted on github pages or other similar environment.

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm

### Installation

```bash
npm install
```

### Development

Start the development server with hot reload:

```bash
npm run dev
```

The site will be available at `http://localhost:5173`

### Build

Build for production:

```bash
npm run build
```

The built files will be in the `dist` directory.

### Preview

Preview the production build:

```bash
npm run preview
```

## Project Structure

```
app/
├── index.html              # Entry HTML file
├── vite.config.js          # Vite build configuration
├── Dockerfile              # Multi-stage build (development, build, production)
├── server.js               # Express production server entry
├── logger.js               # Shared Cloud Logging (LogSync) setup
├── middleware/
│   └── cloudflareAccess.js # Cloudflare Access JWT validation
├── routes/                 # Backend HTTP routes
│   ├── clientConfig.js     # GET /api/client-config (runtime config for SPA)
│   ├── chat.js             # Chat router (re-exports the chat/ modules)
│   └── chat/               # Chat feature, split into focused modules
│       ├── schema.js       # Structured-output schema
│       ├── instructions.js # Model system instruction
│       ├── history.js      # Sliding-window history helper
│       ├── store.js        # In-memory nutrition ledger
│       └── geminiClient.js # Gemini client factory + model id
└── src/                    # Frontend (Vite)
    ├── main.js             # Bootstrap entry
    ├── api.js              # fetch wrappers for the backend API
    ├── markdown.js         # Markdown rendering + sanitization
    ├── style.css           # Imports the styles/ partials
    ├── styles/             # CSS split by concern (base, layout, chat, form, table)
    ├── telemetry.js        # Barrel re-exporting the telemetry/ modules
    ├── telemetry/          # sanitize.js, report.js, init.js
    └── ui/                 # DOM rendering (app, template, chatPanel, databasePanel)
```


[//]: # (No-op change to trigger CI workflow)
