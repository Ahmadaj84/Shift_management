# Portable image for any Docker host (Railway, Fly.io, a hospital server, ...)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --include=dev
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev -w server && npm cache clean --force
COPY server/src server/src
COPY --from=build /app/client/dist client/dist
VOLUME /data
EXPOSE 3000
CMD ["node", "server/src/index.js"]
