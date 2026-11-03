# Backend Dockerfile — Node.js API Server
FROM node:20-alpine

WORKDIR /app

# Copy package files first for layer caching
COPY package*.json ./

# Prisma CLI is a dev dependency and is needed to generate the client.
RUN npm ci

# Copy Prisma schema and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Remove build-only dependencies from the runtime image.
RUN npm prune --omit=dev

# Copy source code
COPY . .

# Expose the API port
EXPOSE 3000

# Use a single worker in Docker (container orchestration handles scaling)
ENV WEB_CONCURRENCY=1

# Start the server
CMD ["node", "server.js"]
