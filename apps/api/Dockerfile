FROM node:22-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@10.33.4 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/qr/package.json packages/qr/package.json
COPY packages/schemas/package.json packages/schemas/package.json
COPY packages/tokens/package.json packages/tokens/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile
COPY packages packages
COPY apps/api apps/api
RUN pnpm --filter @eventia/qr build && pnpm --filter @eventia/schemas build && pnpm --filter api build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@10.33.4 --activate \
  && useradd --create-home --uid 10001 eventia
COPY --from=build /app /app
USER eventia
EXPOSE 3001
CMD ["sh", "-c", "pnpm --filter api exec prisma migrate deploy && pnpm --filter api start"]
