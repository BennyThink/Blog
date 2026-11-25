FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder
COPY . .
ARG EMDASH_SITE_URL=http://localhost:4321
ENV EMDASH_SITE_URL=$EMDASH_SITE_URL ASTRO_TELEMETRY_DISABLED=1
RUN mkdir -p data/ip2region \
    && curl -fsSL https://raw.githubusercontent.com/lionsoul2014/ip2region/c6fabeda4715a7400f36ad9091eea662204b1937/data/ip2region_v4.xdb -o data/ip2region/ip2region_v4.xdb \
    && curl -fsSL https://raw.githubusercontent.com/lionsoul2014/ip2region/d0eb5b3ea98589c8b6ad77e9e7d5fd5afe600971/data/ip2region_v6.xdb -o data/ip2region/ip2region_v6.xdb
RUN npm run build

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev
RUN rm -rf node_modules/.astro node_modules/typescript && find node_modules -type f -name '*.map' -delete && rolldown_binary=node_modules/@rolldown/binding-linux-x64-gnu/rolldown-binding.linux-x64-gnu.node && vite_binary=node_modules/vite/$rolldown_binary && astro_binary=node_modules/@astrojs/vite-plugin-astro/$rolldown_binary && if cmp -s "$vite_binary" "$astro_binary"; then ln -sfr "$vite_binary" "$astro_binary"; fi

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/LICENSE ./LICENSE
COPY --from=builder /app/LICENSES ./LICENSES
COPY --from=builder /app/data/ip2region ./data/ip2region
COPY --from=builder /app/seed ./seed
COPY scripts/container-entrypoint.sh /usr/local/bin/emdash-entrypoint
COPY scripts/migrate-post-urls.mjs ./scripts/migrate-post-urls.mjs
RUN mkdir -p data/sqlite data/uploads data/sessions && chown -R node:node data \
    && chmod +x /usr/local/bin/emdash-entrypoint
COPY scripts/start.mjs scripts/prewarm-listener.mjs ./scripts/
COPY --from=builder /app/dist ./dist
USER node
EXPOSE 4321
ENTRYPOINT ["emdash-entrypoint"]
CMD ["node", "./scripts/start.mjs"]
