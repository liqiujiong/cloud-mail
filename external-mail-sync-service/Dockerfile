FROM node:22-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --prod --frozen-lockfile

COPY src ./src

ENV PORT=8788
EXPOSE 8788

CMD ["node", "src/index.js"]
