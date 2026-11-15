FROM node:24-alpine AS web
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:24-alpine AS server-deps
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev

FROM node:24-alpine
RUN apk add --no-cache git docker-cli docker-cli-buildx
WORKDIR /app
COPY --from=server-deps /app/server/node_modules ./server/node_modules
COPY server/ ./server/
COPY --from=web /app/web/dist ./web/dist
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000 HOME=/tmp
USER node
EXPOSE 4000
CMD ["node", "server/src/index.js"]