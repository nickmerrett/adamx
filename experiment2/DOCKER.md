# ADAM Converter Docker Guide

This guide covers containerized deployment of the ADAM Converter with Docker and Docker Compose.

## Quick Start

### Build and Run

```bash
# Build the container
docker build -t adam-converter .

# Create input/output directories
mkdir -p input output temp

# Convert a document
docker run --rm \
  -v $(pwd)/input:/app/input:ro \
  -v $(pwd)/output:/app/output:rw \
  adam-converter \
  node src/cli.js convert /app/input/document.pdf

# Using Docker Compose
docker-compose up adam-converter
```

## Container Features

### Security Features
- **Non-root user**: Runs as `adamuser` (UID 1001) for security
- **Read-only filesystem**: Root filesystem is read-only except for mounted volumes
- **Resource limits**: Memory and CPU limits configured
- **No new privileges**: Prevents privilege escalation
- **Minimal attack surface**: Alpine-based with only essential packages

### Performance Optimizations
- **Multi-stage build**: Separates build and runtime environments
- **Layer caching**: Optimized layer order for faster builds
- **Minimal dependencies**: Only production dependencies in final image
- **Efficient copying**: Uses specific COPY commands to leverage cache

## Usage Examples

### Basic Document Conversion

```bash
# Place your PDF/DOCX files in the input directory
cp document.pdf input/

# Convert to ADAM format
docker run --rm \
  -v $(pwd)/input:/app/input:ro \
  -v $(pwd)/output:/app/output:rw \
  adam-converter \
  node src/cli.js convert /app/input/document.pdf --output /app/output/document.adam.json --verbose
```

### WASM Packing

```bash
# Convert and pack to WASM
docker run --rm \
  -v $(pwd)/input:/app/input:ro \
  -v $(pwd)/output:/app/output:rw \
  adam-converter \
  sh -c "
    node src/cli.js convert /app/input/document.pdf --output /app/temp/document.adam.json &&
    node src/cli.js pack /app/temp/document.adam.json --output /app/output/document.wasm --verbose
  "
```

### MCP-Enhanced WASM

```bash
# Create MCP-enabled WASM binary
docker run --rm \
  -v $(pwd)/input:/app/input:ro \
  -v $(pwd)/output:/app/output:rw \
  adam-converter \
  sh -c "
    node src/cli.js convert /app/input/document.pdf --output /app/temp/document.adam.json &&
    node src/cli.js pack-mcp /app/temp/document.adam.json --output /app/output/document-mcp.wasm --verbose
  "
```

### Batch Processing

```bash
# Process multiple documents
docker run --rm \
  -v $(pwd)/input:/app/input:ro \
  -v $(pwd)/output:/app/output:rw \
  adam-converter \
  node src/cli.js batch /app/input/*.pdf --output-dir /app/output --parallel --verbose
```

### Interactive Query

```bash
# Query a document interactively
docker run --rm -it \
  -v $(pwd)/input:/app/input:ro \
  adam-converter \
  node src/cli.js mcp-query /app/input/document-mcp.wasm --query "search term" --limit 5
```

## Docker Compose Usage

### Production Deployment

```bash
# Start the service
docker-compose up -d adam-converter

# View logs
docker-compose logs -f adam-converter

# Execute commands
docker-compose exec adam-converter node src/cli.js convert /app/input/document.pdf

# Stop the service
docker-compose down
```

### Development Mode

```bash
# Start development environment
docker-compose --profile dev up adam-dev

# This provides:
# - Live source code mounting
# - Development dependencies
# - Interactive debugging
# - Auto-restart on changes
```

## Environment Variables

Configure the container behavior with environment variables:

```bash
# Production environment
docker run -e NODE_ENV=production -e LOG_LEVEL=info adam-converter

# Development environment  
docker run -e NODE_ENV=development -e LOG_LEVEL=debug adam-converter

# Custom configuration
docker run -e ADAM_MAX_MEMORY=4096 -e ADAM_WORKERS=4 adam-converter
```

## Volume Mounts

### Required Mounts

- **Input**: `/app/input` - Mount your source documents (read-only)
- **Output**: `/app/output` - Mount for generated files (read-write)
- **Temp**: `/app/temp` - Temporary processing space (read-write)

### Example Directory Structure

```
project/
├── input/
│   ├── document1.pdf
│   ├── document2.docx
│   └── batch/
├── output/
│   ├── document1.adam.json
│   ├── document1.wasm
│   └── processed/
└── temp/
    └── (processing files)
```

## Container Management

### Resource Limits

```bash
# Custom resource limits
docker run --memory=2g --cpus=1.0 \
  -v $(pwd)/input:/app/input:ro \
  -v $(pwd)/output:/app/output:rw \
  adam-converter \
  node src/cli.js convert /app/input/large-document.pdf
```

### Health Monitoring

```bash
# Check container health
docker ps --filter "name=adam-converter"

# View health check logs
docker inspect adam-converter | jq '.[0].State.Health'

# Manual health check
docker exec adam-converter node -e "console.log('Health check')"
```

### Debugging

```bash
# Interactive shell access
docker run --rm -it \
  -v $(pwd)/input:/app/input:ro \
  -v $(pwd)/output:/app/output:rw \
  --entrypoint sh \
  adam-converter

# Debug mode with verbose logging
docker run --rm \
  -e LOG_LEVEL=debug \
  -v $(pwd)/input:/app/input:ro \
  -v $(pwd)/output:/app/output:rw \
  adam-converter \
  node src/cli.js convert /app/input/document.pdf --verbose
```

## Performance Considerations

### Memory Usage

- **Minimum**: 512MB for small documents
- **Recommended**: 2GB for typical documents  
- **Large documents**: 4GB+ for complex PDFs with many images/tables

### CPU Usage

- **Single document**: 0.5-1.0 CPU for processing
- **Batch processing**: Scale CPUs with `--parallel` option
- **MCP operations**: Additional CPU for indexing and relationship detection

### Storage

- **Container size**: ~200MB (Alpine + Node.js + dependencies)
- **Runtime storage**: Varies by document size
  - Input: Original document size
  - Processing: 2-3x document size (temporary)
  - Output: Compressed WASM ~1-5% of original

## Security Best Practices

### Container Security

```bash
# Run with security options
docker run --rm \
  --security-opt no-new-privileges \
  --read-only \
  --tmpfs /tmp:noexec,nosuid,size=100m \
  -v $(pwd)/input:/app/input:ro \
  -v $(pwd)/output:/app/output:rw \
  adam-converter
```

### Network Security

```bash
# Disable network access if not needed
docker run --rm --network none \
  -v $(pwd)/input:/app/input:ro \
  -v $(pwd)/output:/app/output:rw \
  adam-converter
```

## Troubleshooting

### Common Issues

**Permission denied errors**:
```bash
# Fix ownership
sudo chown -R 1001:1001 input output temp
```

**Out of memory errors**:
```bash
# Increase memory limit
docker run --memory=4g adam-converter
```

**File not found**:
```bash
# Check volume mounts
docker run --rm -v $(pwd)/input:/app/input:ro adam-converter ls -la /app/input
```

### Logs and Debugging

```bash
# Container logs
docker logs adam-converter

# Follow logs in real-time
docker logs -f adam-converter

# Debug container contents
docker exec -it adam-converter sh
```

## Integration Examples

### CI/CD Pipeline

```yaml
# GitHub Actions example
- name: Convert Documents
  run: |
    docker run --rm \
      -v ${{ github.workspace }}/docs:/app/input:ro \
      -v ${{ github.workspace }}/output:/app/output:rw \
      adam-converter \
      node src/cli.js batch /app/input --output-dir /app/output
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: adam-converter
spec:
  replicas: 2
  selector:
    matchLabels:
      app: adam-converter
  template:
    metadata:
      labels:
        app: adam-converter
    spec:
      containers:
      - name: adam-converter
        image: adam-converter:latest
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"  
            cpu: "1000m"
        volumeMounts:
        - name: input-volume
          mountPath: /app/input
          readOnly: true
        - name: output-volume
          mountPath: /app/output
      volumes:
      - name: input-volume
        persistentVolumeClaim:
          claimName: adam-input-pvc
      - name: output-volume
        persistentVolumeClaim:
          claimName: adam-output-pvc
```

## Advanced Usage

### Custom Entrypoint Scripts

Create custom processing workflows:

```bash
# Create custom script
cat > custom-process.sh << 'EOF'
#!/bin/sh
set -e

echo "Starting ADAM processing pipeline..."

# Convert all PDFs
for file in /app/input/*.pdf; do
    if [ -f "$file" ]; then
        basename=$(basename "$file" .pdf)
        echo "Processing: $basename"
        
        # Convert to ADAM
        node src/cli.js convert "$file" --output "/app/temp/$basename.adam.json"
        
        # Create WASM
        node src/cli.js pack "/app/temp/$basename.adam.json" --output "/app/output/$basename.wasm"
        
        # Create MCP-enabled WASM
        node src/cli.js pack-mcp "/app/temp/$basename.adam.json" --output "/app/output/$basename-mcp.wasm"
        
        echo "Completed: $basename"
    fi
done

echo "Pipeline completed!"
EOF

# Run with custom script
docker run --rm \
  -v $(pwd)/custom-process.sh:/app/custom-process.sh:ro \
  -v $(pwd)/input:/app/input:ro \
  -v $(pwd)/output:/app/output:rw \
  adam-converter \
  sh /app/custom-process.sh
```

This containerized setup provides a robust, secure, and scalable deployment option for the ADAM converter with all its advanced MCP and WebAssembly capabilities.