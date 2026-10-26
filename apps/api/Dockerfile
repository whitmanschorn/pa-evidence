# The API image: builds @pa/shared, the web app and the API, then a runtime stage with production dependencies
# only. The API serves the built web app at /ui. Build from the repository root: compose does this for `make up`.
# Base image pinned by multi-arch digest (node 24.22.1, Debian bookworm slim).
ARG NODE_IMAGE=node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205

FROM ${NODE_IMAGE} AS build
WORKDIR /app
RUN npm install --global pnpm@12.12.1
# Manifests first, so the dependency layer is cached until a package.json or the lockfile changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY scripts/package.json scripts/
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY apps/web apps/web
RUN pnpm --filter @pa/shared build && pnpm --filter @pa/web build && pnpm --filter @pa/api build

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
RUN npm install --global pnpm@12.12.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY scripts/package.json scripts/
RUN pnpm install --frozen-lockfile --prod --filter @pa/api...
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/web/dist apps/web/dist
# Data the service reads. data/policies and data/models are also mounted by compose, so a dropped-in version folder
# needs no rebuild.
COPY data/terminology data/terminology
COPY data/requests data/requests
COPY data/policies data/policies
COPY data/models data/models
COPY eval eval
RUN mkdir -p var && chown node:node var
USER node
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "apps/api/dist/main.js"]
