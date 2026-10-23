FROM node:22-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@10.33.4 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/qr/package.json packages/qr/package.json
COPY packages/schemas/package.json packages/schemas/package.json
COPY packages/tokens/package.json packages/tokens/package.json
RUN pnpm install --frozen-lockfile
COPY packages packages
COPY apps/web apps/web
RUN pnpm --filter @eventia/qr build && pnpm --filter web build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321 API_PROXY=http://api:3001
RUN useradd --create-home --uid 10001 eventia
COPY --from=build /app /app
USER eventia
EXPOSE 4321
CMD ["node", "apps/web/dist/server/entry.mjs"]
