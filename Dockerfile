FROM node:26.7.0-bookworm-slim AS build
WORKDIR /app
RUN npm install --global npm@11.19.0
COPY package.json package-lock.json .npmrc cms-release.json ./
COPY admin/package.json ./admin/package.json
COPY packages/addon-contracts/package.json ./packages/addon-contracts/package.json
COPY packages/retained-contracts ./packages/retained-contracts
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY packages ./packages
COPY admin ./admin
COPY scripts/build.mjs ./scripts/build.mjs
RUN npm run build

FROM build AS cloudflare
COPY migrations ./migrations
COPY scripts/verify-image-imports.mjs ./scripts/verify-image-imports.mjs
USER node
RUN node scripts/verify-image-imports.mjs cloudflare
WORKDIR /work
CMD ["node", "/app/dist/deployment-executor.js"]

FROM node:26.7.0-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN npm install --global npm@11.19.0
COPY package.json package-lock.json .npmrc cms-release.json ./
COPY admin/package.json ./admin/package.json
COPY packages/addon-contracts/package.json ./packages/addon-contracts/package.json
COPY packages/retained-contracts ./packages/retained-contracts
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/packages/addon-contracts/dist ./packages/addon-contracts/dist
COPY --from=build /app/admin/dist ./admin/dist
COPY migrations ./migrations
COPY scripts ./scripts
RUN mkdir -p /app/artifacts /app/data /app/sites /app/dumps \
    && chown node:node /app/artifacts /app/data /app/sites /app/dumps
USER node
RUN node scripts/verify-image-imports.mjs runtime
CMD ["node", "dist/main.js"]
