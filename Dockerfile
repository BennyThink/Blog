FROM node:24-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG EMDASH_SITE_URL=http://localhost:4321
ENV EMDASH_SITE_URL=$EMDASH_SITE_URL ASTRO_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev
RUN rm -rf node_modules/.astro && find node_modules/echarts -type f -name '*.map' -delete

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/seed ./seed
COPY scripts/container-entrypoint.sh /usr/local/bin/emdash-entrypoint
COPY scripts/migrate-post-urls.mjs ./scripts/migrate-post-urls.mjs
RUN mkdir -p data/sqlite data/uploads data/sessions && chown -R node:node data \
    && chmod +x /usr/local/bin/emdash-entrypoint
USER node
EXPOSE 4321
ENTRYPOINT ["emdash-entrypoint"]
CMD ["node", "./dist/server/entry.mjs"]
