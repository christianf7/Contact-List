# Use official Node.js LTS image
FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Copy dependency definitions
COPY package*.json ./

# Install dependencies and build
RUN npm install \
    && npm run build \
    && npm prune --production

# Copy application source
COPY . .

# Expose application port
EXPOSE 3000

# Launch the app
CMD ["node", "dist/server.js"]
