import express from 'express';
import multer from 'multer';
import cors from 'cors';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { ADAMPipeline } from '../pipeline.js';
import { SimpleADAMPacker } from '../wasm/simple-packer.js';
import { ADAMMCPPacker } from '../wasm/adam-mcp-packer.js';
import { Logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * ADAM Converter Web Server
 * 
 * Provides HTTP API for document conversion with support for:
 * - PDF/DOCX upload and conversion
 * - Multiple output formats (JSON, WASM, MCP-WASM)
 * - Real-time processing status
 * - Download endpoints for results
 */
export class ADAMWebServer {
  constructor(options = {}) {
    this.options = {
      port: options.port || process.env.PORT || 3000,
      host: options.host || process.env.HOST || '0.0.0.0',
      maxFileSize: options.maxFileSize || '50mb',
      tempDir: options.tempDir || '/tmp/adam-converter',
      corsEnabled: options.corsEnabled !== false,
      logLevel: options.logLevel || 'info',
      ...options
    };

    this.app = express();
    this.logger = new Logger();
    this.logger.setLevel(this.options.logLevel);
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    // CORS support
    if (this.options.corsEnabled) {
      this.app.use(cors({
        origin: true,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
      }));
    }

    // Body parsing
    this.app.use(express.json({ limit: this.options.maxFileSize }));
    this.app.use(express.urlencoded({ extended: true, limit: this.options.maxFileSize }));

    // Static files
    this.app.use('/static', express.static(path.join(__dirname, 'static')));

    // Request logging
    this.app.use((req, res, next) => {
      this.logger.info(`${req.method} ${req.path} - ${req.ip}`);
      next();
    });

    // File upload configuration
    this.upload = multer({
      dest: this.options.tempDir,
      limits: {
        fileSize: this.parseSize(this.options.maxFileSize)
      },
      fileFilter: (req, file, cb) => {
        const allowedTypes = ['.pdf', '.docx'];
        const ext = path.extname(file.originalname).toLowerCase();
        
        if (allowedTypes.includes(ext)) {
          cb(null, true);
        } else {
          cb(new Error(`Unsupported file type: ${ext}. Allowed: ${allowedTypes.join(', ')}`));
        }
      }
    });
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        capabilities: ['convert', 'pack', 'mcp', 'batch']
      });
    });

    // API information
    this.app.get('/api', (req, res) => {
      res.json({
        name: 'ADAM Converter API',
        version: '1.0.0',
        description: 'Convert documents to ADAM format with WebAssembly packing and MCP server capabilities',
        endpoints: {
          'POST /api/convert': 'Convert document to ADAM format',
          'GET /api/status/:jobId': 'Check conversion status',
          'GET /api/download/:jobId': 'Download converted document',
          'GET /health': 'Health check',
          'GET /': 'Web interface'
        },
        formats: ['json', 'wasm', 'wasm-mcp'],
        maxFileSize: this.options.maxFileSize
      });
    });

    // Main conversion endpoint
    this.app.post('/api/convert', this.upload.single('document'), async (req, res) => {
      try {
        await this.handleConversion(req, res);
      } catch (error) {
        this.logger.error(`Conversion error: ${error.message}`);
        res.status(500).json({
          error: 'Conversion failed',
          message: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Status check endpoint
    this.app.get('/api/status/:jobId', async (req, res) => {
      try {
        const status = await this.getJobStatus(req.params.jobId);
        res.json(status);
      } catch (error) {
        res.status(404).json({
          error: 'Job not found',
          message: error.message
        });
      }
    });

    // Download endpoint
    this.app.get('/api/download/:jobId', async (req, res) => {
      try {
        await this.handleDownload(req, res);
      } catch (error) {
        res.status(404).json({
          error: 'File not found',
          message: error.message
        });
      }
    });

    // Batch conversion endpoint
    this.app.post('/api/batch', this.upload.array('documents', 10), async (req, res) => {
      try {
        await this.handleBatchConversion(req, res);
      } catch (error) {
        this.logger.error(`Batch conversion error: ${error.message}`);
        res.status(500).json({
          error: 'Batch conversion failed',
          message: error.message
        });
      }
    });

    // Web interface
    this.app.get('/', (req, res) => {
      res.send(this.generateWebInterface());
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not found',
        message: `Endpoint ${req.method} ${req.originalUrl} not found`,
        availableEndpoints: ['/api', '/health', '/api/convert', '/']
      });
    });
  }

  /**
   * Setup error handling
   */
  setupErrorHandling() {
    // Multer error handling
    this.app.use((error, req, res, next) => {
      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            error: 'File too large',
            message: `Maximum file size is ${this.options.maxFileSize}`,
            maxSize: this.options.maxFileSize
          });
        }
      }
      
      this.logger.error(`Server error: ${error.message}`);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    });

    // Global error handler
    process.on('uncaughtException', (error) => {
      this.logger.error(`Uncaught exception: ${error.message}`);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error(`Unhandled rejection at: ${promise}, reason: ${reason}`);
    });
  }

  /**
   * Handle document conversion
   */
  async handleConversion(req, res) {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Please upload a PDF or DOCX file'
      });
    }

    const jobId = this.generateJobId();
    const format = req.body.format || 'wasm-mcp'; // Default to MCP-enabled WASM
    const options = {
      removeEmbeddings: req.body.removeEmbeddings === 'true',
      verbose: req.body.verbose === 'true'
    };

    this.logger.info(`Starting conversion job ${jobId}: ${req.file.originalname} -> ${format}`);

    // Start conversion asynchronously
    this.processConversion(jobId, req.file, format, options).catch(error => {
      this.logger.error(`Conversion job ${jobId} failed: ${error.message}`);
    });

    // Return job ID immediately
    res.json({
      jobId,
      status: 'processing',
      filename: req.file.originalname,
      format,
      estimatedTime: this.estimateProcessingTime(req.file.size),
      statusUrl: `/api/status/${jobId}`,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Process document conversion asynchronously
   */
  async processConversion(jobId, file, format, options) {
    const statusFile = path.join(this.options.tempDir, `${jobId}.status`);
    const outputFile = path.join(this.options.tempDir, `${jobId}.output`);

    try {
      // Update status
      await this.updateJobStatus(jobId, {
        status: 'processing',
        stage: 'parsing',
        progress: 10
      });

      // Convert to ADAM
      const pipeline = new ADAMPipeline({
        embeddingModel: 'text-embedding-ada-002',
        validateOutput: true
      });

      const adamDocument = await pipeline.convert(file.path, {}, file.originalname);

      await this.updateJobStatus(jobId, {
        status: 'processing',
        stage: 'generating',
        progress: 70
      });

      let result;
      let outputExtension;
      let mimeType;

      // Generate output based on format
      switch (format) {
        case 'json':
          result = JSON.stringify(adamDocument, null, 2);
          outputExtension = '.adam.json';
          mimeType = 'application/json';
          break;

        case 'wasm':
          const packer = new SimpleADAMPacker({
            compression: 'gzip',
            removeEmbeddings: options.removeEmbeddings,
            optimizeMetadata: true
          });
          
          // Save temp JSON
          const tempJson = path.join(this.options.tempDir, `${jobId}.temp.json`);
          await fs.writeFile(tempJson, JSON.stringify(adamDocument));
          
          // Pack to WASM
          const wasmResult = await packer.pack(tempJson, outputFile + '.wasm');
          result = await fs.readFile(outputFile + '.wasm');
          outputExtension = '.wasm';
          mimeType = 'application/wasm';
          
          // Cleanup temp file
          await fs.unlink(tempJson);
          break;

        case 'wasm-mcp':
        default:
          const mcpPacker = new ADAMMCPPacker({
            compression: 'gzip',
            removeEmbeddings: options.removeEmbeddings,
            optimizeMetadata: true,
            enableMCP: true,
            mcpOptions: {
              includeSearchIndex: true,
              cacheRelationships: true
            }
          });
          
          // Save temp JSON
          const tempMcpJson = path.join(this.options.tempDir, `${jobId}.temp.json`);
          await fs.writeFile(tempMcpJson, JSON.stringify(adamDocument));
          
          // Pack to MCP WASM
          const mcpResult = await mcpPacker.packWithMCP(tempMcpJson, outputFile + '.wasm');
          result = await fs.readFile(outputFile + '.wasm');
          outputExtension = '.adam.wasm';
          mimeType = 'application/wasm';
          
          // Cleanup temp file
          await fs.unlink(tempMcpJson);
          break;
      }

      // Save result
      await fs.writeFile(outputFile, result);

      // Update final status
      await this.updateJobStatus(jobId, {
        status: 'completed',
        stage: 'done',
        progress: 100,
        outputFile: outputFile,
        outputExtension: outputExtension,
        mimeType: mimeType,
        originalSize: file.size,
        outputSize: result.length,
        sections: adamDocument.sections?.length || 0,
        compressionRatio: format !== 'json' ? 
          ((file.size - result.length) / file.size * 100).toFixed(1) + '%' : 'N/A',
        downloadUrl: `/api/download/${jobId}`
      });

      this.logger.info(`Conversion job ${jobId} completed successfully`);

    } catch (error) {
      await this.updateJobStatus(jobId, {
        status: 'failed',
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      this.logger.error(`Conversion job ${jobId} failed: ${error.message}`);
    } finally {
      // Cleanup uploaded file
      try {
        await fs.unlink(file.path);
      } catch (cleanupError) {
        this.logger.warn(`Failed to cleanup uploaded file: ${cleanupError.message}`);
      }
    }
  }

  /**
   * Handle batch conversion
   */
  async handleBatchConversion(req, res) {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: 'No files uploaded',
        message: 'Please upload one or more PDF or DOCX files'
      });
    }

    const batchId = this.generateJobId();
    const format = req.body.format || 'wasm-mcp';
    const jobs = [];

    // Create individual jobs for each file
    for (const file of req.files) {
      const jobId = this.generateJobId();
      jobs.push({
        jobId,
        filename: file.originalname,
        statusUrl: `/api/status/${jobId}`
      });

      // Start conversion asynchronously
      this.processConversion(jobId, file, format, {
        removeEmbeddings: req.body.removeEmbeddings === 'true',
        verbose: req.body.verbose === 'true'
      }).catch(error => {
        this.logger.error(`Batch job ${jobId} failed: ${error.message}`);
      });
    }

    res.json({
      batchId,
      status: 'processing',
      jobs,
      totalFiles: req.files.length,
      format,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Handle file downloads
   */
  async handleDownload(req, res) {
    const jobId = req.params.jobId;
    const status = await this.getJobStatus(jobId);

    if (status.status !== 'completed') {
      return res.status(400).json({
        error: 'Job not completed',
        status: status.status,
        message: 'Job must be completed before downloading'
      });
    }

    const outputFile = status.outputFile;
    const stats = await fs.stat(outputFile);
    
    const filename = `${jobId}${status.outputExtension}`;
    
    res.setHeader('Content-Type', status.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', stats.size);
    
    const stream = await fs.readFile(outputFile);
    res.send(stream);

    this.logger.info(`Downloaded file for job ${jobId}: ${filename}`);
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId) {
    const statusFile = path.join(this.options.tempDir, `${jobId}.status`);
    
    try {
      const statusData = await fs.readFile(statusFile, 'utf-8');
      return JSON.parse(statusData);
    } catch (error) {
      throw new Error(`Job ${jobId} not found`);
    }
  }

  /**
   * Update job status
   */
  async updateJobStatus(jobId, status) {
    const statusFile = path.join(this.options.tempDir, `${jobId}.status`);
    
    const statusData = {
      jobId,
      timestamp: new Date().toISOString(),
      ...status
    };
    
    await fs.writeFile(statusFile, JSON.stringify(statusData, null, 2));
  }

  /**
   * Generate unique job ID
   */
  generateJobId() {
    return `adam_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Estimate processing time based on file size
   */
  estimateProcessingTime(fileSize) {
    // Rough estimate: 1MB = 10 seconds processing
    const estimatedSeconds = Math.max(10, Math.ceil(fileSize / (1024 * 1024)) * 10);
    return `${estimatedSeconds} seconds`;
  }

  /**
   * Parse size string (e.g., "50mb") to bytes
   */
  parseSize(sizeStr) {
    const units = { b: 1, kb: 1024, mb: 1024 * 1024, gb: 1024 * 1024 * 1024 };
    const match = sizeStr.toLowerCase().match(/^(\d+)(b|kb|mb|gb)$/);
    
    if (!match) return 50 * 1024 * 1024; // Default 50MB
    
    const [, size, unit] = match;
    return parseInt(size) * units[unit];
  }

  /**
   * Generate web interface HTML
   */
  generateWebInterface() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ADAM Converter</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; margin-bottom: 40px; }
        .upload-area { border: 2px dashed #ccc; padding: 40px; text-align: center; margin: 20px 0; }
        .upload-area.dragover { border-color: #007cba; background-color: #f0f8ff; }
        .format-options { margin: 20px 0; }
        .format-options label { display: block; margin: 10px 0; }
        .progress { display: none; margin: 20px 0; }
        .progress-bar { width: 100%; height: 20px; background: #f0f0f0; border-radius: 10px; overflow: hidden; }
        .progress-fill { height: 100%; background: #007cba; transition: width 0.3s; }
        .result { display: none; margin: 20px 0; padding: 20px; background: #f9f9f9; border-radius: 5px; }
        .error { color: #d73502; }
        .success { color: #0f5132; }
        button { background: #007cba; color: white; border: none; padding: 12px 24px; border-radius: 5px; cursor: pointer; }
        button:hover { background: #005a8b; }
        button:disabled { background: #ccc; cursor: not-allowed; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🤖 ADAM Converter</h1>
        <p>Convert documents to ADAM (Agentic Document Augmentation Markup) format</p>
    </div>

    <div class="upload-area" id="uploadArea">
        <p>📄 Drop your PDF or DOCX file here, or <strong>click to browse</strong></p>
        <input type="file" id="fileInput" accept=".pdf,.docx" style="display: none;">
    </div>

    <div class="format-options">
        <h3>Output Format:</h3>
        <label><input type="radio" name="format" value="wasm-mcp" checked> 🚀 WASM with MCP Server (Recommended)</label>
        <label><input type="radio" name="format" value="wasm"> 📦 WASM Binary</label>
        <label><input type="radio" name="format" value="json"> 📋 JSON Document</label>
    </div>

    <div>
        <label><input type="checkbox" id="removeEmbeddings"> Remove embeddings (smaller file size)</label>
    </div>

    <div style="margin: 20px 0;">
        <button id="convertBtn" disabled>Convert Document</button>
    </div>

    <div class="progress" id="progress">
        <p>Processing... <span id="stage">Uploading</span></p>
        <div class="progress-bar">
            <div class="progress-fill" id="progressFill"></div>
        </div>
    </div>

    <div class="result" id="result"></div>

    <script>
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        const convertBtn = document.getElementById('convertBtn');
        const progress = document.getElementById('progress');
        const result = document.getElementById('result');
        let selectedFile = null;

        // File upload handling
        uploadArea.addEventListener('click', () => fileInput.click());
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            handleFiles(e.dataTransfer.files);
        });

        fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

        function handleFiles(files) {
            if (files.length > 0) {
                selectedFile = files[0];
                uploadArea.innerHTML = \`<p>✅ Selected: \${selectedFile.name}</p>\`;
                convertBtn.disabled = false;
            }
        }

        // Conversion handling
        convertBtn.addEventListener('click', async () => {
            if (!selectedFile) return;

            const formData = new FormData();
            formData.append('document', selectedFile);
            formData.append('format', document.querySelector('input[name="format"]:checked').value);
            formData.append('removeEmbeddings', document.getElementById('removeEmbeddings').checked);

            convertBtn.disabled = true;
            progress.style.display = 'block';
            result.style.display = 'none';

            try {
                const response = await fetch('/api/convert', {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();

                if (response.ok) {
                    pollStatus(data.jobId);
                } else {
                    showError(data.message || 'Conversion failed');
                }
            } catch (error) {
                showError('Network error: ' + error.message);
            }
        });

        async function pollStatus(jobId) {
            try {
                const response = await fetch(\`/api/status/\${jobId}\`);
                const status = await response.json();

                document.getElementById('stage').textContent = status.stage || status.status;
                document.getElementById('progressFill').style.width = (status.progress || 0) + '%';

                if (status.status === 'completed') {
                    showSuccess(status, jobId);
                } else if (status.status === 'failed') {
                    showError(status.error || 'Conversion failed');
                } else {
                    setTimeout(() => pollStatus(jobId), 2000);
                }
            } catch (error) {
                showError('Status check failed: ' + error.message);
            }
        }

        function showSuccess(status, jobId) {
            progress.style.display = 'none';
            result.style.display = 'block';
            result.className = 'result success';
            result.innerHTML = \`
                <h3>✅ Conversion Completed!</h3>
                <p><strong>Sections:</strong> \${status.sections}</p>
                <p><strong>Compression:</strong> \${status.compressionRatio}</p>
                <p><strong>Output Size:</strong> \${formatBytes(status.outputSize)}</p>
                <p><a href="/api/download/\${jobId}" download>📥 Download Result</a></p>
            \`;
            convertBtn.disabled = false;
        }

        function showError(message) {
            progress.style.display = 'none';
            result.style.display = 'block';
            result.className = 'result error';
            result.innerHTML = \`<h3>❌ Error</h3><p>\${message}</p>\`;
            convertBtn.disabled = false;
        }

        function formatBytes(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }
    </script>
</body>
</html>`;
  }

  /**
   * Start the web server
   */
  async start() {
    // Ensure temp directory exists
    try {
      await fs.mkdir(this.options.tempDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    return new Promise((resolve, reject) => {
      const server = this.app.listen(this.options.port, this.options.host, (error) => {
        if (error) {
          reject(error);
        } else {
          this.logger.success(`🚀 ADAM Converter Web Server running on http://${this.options.host}:${this.options.port}`);
          this.logger.info(`📁 Temporary directory: ${this.options.tempDir}`);
          this.logger.info(`📊 Max file size: ${this.options.maxFileSize}`);
          this.logger.info(`🔗 API Documentation: http://${this.options.host}:${this.options.port}/api`);
          resolve(server);
        }
      });

      // Handle server shutdown gracefully
      process.on('SIGTERM', () => {
        this.logger.info('Received SIGTERM, shutting down gracefully');
        server.close(() => {
          this.logger.info('Server closed');
          process.exit(0);
        });
      });
    });
  }
}

// Export for use as module
export default ADAMWebServer;

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new ADAMWebServer();
  server.start().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}