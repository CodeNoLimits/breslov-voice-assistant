FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm install -g typescript tsx

# Copy source code
COPY src ./src

# Build TypeScript
RUN tsc

# Create data directories
RUN mkdir -p data/extracted data/indexes data/chunks logs

# Expose port
EXPOSE 3000

# Start application
CMD ["node", "dist/index.js"]