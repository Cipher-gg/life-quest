FROM node:20-alpine

# better-sqlite3 needs build tools at install time
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY server.js ./

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/data/users.db

EXPOSE 3000

# /data is mounted as a volume from compose so state survives container rebuilds
RUN mkdir -p /data

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/api/healthz || exit 1

CMD ["node", "server.js"]
