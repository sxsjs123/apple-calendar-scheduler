FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY pnpm-lock.yaml ./
RUN corepack enable && pnpm install --prod --frozen-lockfile

COPY server.js ./
COPY public ./public
COPY data ./data

ENV PORT=3000
ENV CALENDAR_TZ=Asia/Shanghai

EXPOSE 3000
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/bookings >/dev/null || exit 1

CMD ["node", "server.js"]
