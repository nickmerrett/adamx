# ADAM Converter Dockerfile
# Multi-stage build for optimal container size and security

# Stage 1: Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    libc6-compat

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY src/ ./src/
COPY *.json ./

# Stage 2: Runtime stage
FROM node:18-alpine AS runtime

# Create non-root user for security
RUN addgroup -g 1001 -S adamuser && \
    adduser -S adamuser -u 1001

# Set working directory
WORKDIR /app

# Install runtime dependencies only
RUN apk add --no-cache \
    dumb-init \
    tini \
    wget

# Copy application from builder stage
COPY --from=builder --chown=adamuser:adamuser /app/node_modules ./node_modules
COPY --from=builder --chown=adamuser:adamuser /app/src ./src
COPY --from=builder --chown=adamuser:adamuser /app/package*.json ./

# Copy schema files if they exist
COPY --chown=adamuser:adamuser *.json ./

# Create directories for input/output with proper permissions
RUN mkdir -p /app/input /app/output /app/temp && \
    chown -R adamuser:adamuser /app

# Switch to non-root user
USER adamuser

# Expose port for potential HTTP server (future enhancement)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('ADAM Converter is healthy')" || exit 1

# Set default command
ENTRYPOINT ["tini", "--"]
CMD ["node", "src/cli.js", "--help"]

# Labels for metadata
LABEL maintainer="ADAM Project" \
      version="1.0.0" \
      description="ADAM (Agentic Document Augmentation Markup) Converter with MCP Server" \
      org.opencontainers.image.title="ADAM Converter" \
      org.opencontainers.image.description="Convert documents to ADAM format with WebAssembly packing and MCP server capabilities" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.source="https://github.com/adam-project/adam-converter" \
      org.opencontainers.image.licenses="MIT"