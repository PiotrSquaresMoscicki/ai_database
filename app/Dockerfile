# Development stage - used by devcontainer
FROM node:22-bookworm AS development

# Set working directory
WORKDIR /app

# Install Google Cloud CLI, SOPS, and jq
# (Terraform is injected automatically by the devcontainer feature)
RUN apt-get update && apt-get install -y apt-transport-https ca-certificates gnupg curl jq wget && \
    curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" > /etc/apt/sources.list.d/google-cloud-sdk.list && \
    apt-get update && apt-get install -y google-cloud-cli && \
    wget -qO /usr/local/bin/sops https://github.com/getsops/sops/releases/download/v3.9.0/sops-v3.9.0.linux.amd64 && \
    chmod +x /usr/local/bin/sops && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy package files for dependency installation
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Expose Vite dev server port
EXPOSE 5173

# Default command for development
CMD ["npm", "run", "dev", "--", "--host"]

# Build stage - builds the static assets
FROM node:22-bookworm AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (npm ci for faster, reproducible builds)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Move source maps out of dist/ so they don't ship in the production image but
# are still recoverable from this build stage by CI (which can `docker cp`
# from a temporarily-tagged build container, or by switching to a multi-stage
# COPY into a published debug bucket). GCP Error Reporting does not
# auto-symbolicate web source maps; this is for manual lookup only.
RUN mkdir -p /app/sourcemaps && find /app/dist -name '*.map' -exec mv {} /app/sourcemaps/ \;

# Production stage - serves built assets from a Node/Express server
# that enforces Cloudflare Access JWT validation on every request.
FROM node:22-bookworm-slim AS production

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=80

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy server code and the built static assets
COPY server.js ./server.js
COPY logger.js ./logger.js
COPY middleware ./middleware
COPY routes ./routes
COPY --from=build /app/dist ./dist

EXPOSE 80

CMD ["node", "server.js"]