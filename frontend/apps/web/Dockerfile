# Frontend Dockerfile for Glean Web App

# Build stage
FROM node:24-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10.26.0

# Copy workspace configuration
# First step: copy only dependency description files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json ./

# Copy all package.json (for workspace recognition)
COPY packages/ui/package.json ./packages/ui/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/types/package.json ./packages/types/
COPY packages/logger/package.json ./packages/logger/
COPY packages/i18n/package.json ./packages/i18n/
COPY apps/web/package.json ./apps/web/
COPY apps/admin/package.json ./apps/admin/

# Install dependencies (this layer will be cached until lock file changes)
RUN pnpm install --frozen-lockfile

# Second step: copy source code and build
COPY packages/ packages/
COPY apps/web/ apps/web/
RUN pnpm --filter=@glean/web build
RUN pnpm --filter=@glean/web compress:assets

# Production stage
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Copy nginx configuration
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
