# Backend Dockerfile — Node.js API Server
FROM node:20-alpine

WORKDIR /app

# Copy package files first for layer caching
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy source code
COPY . .

# Expose the API port
EXPOSE 3000

# Use a single worker in Docker (container orchestration handles scaling)
ENV WEB_CONCURRENCY=1

# Start the server
CMD ["node", "server.js"]
