import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

/**
 * HTTP Bridge for stdio-based MCP servers
 * 
 * Provides HTTP API endpoints that bridge to stdio MCP server processes,
 * allowing web clients to interact with MCP servers via HTTP instead of WebSocket.
 */
export class MCPHttpBridge extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      port: options.port || 8080,
      host: options.host || 'localhost',
      corsEnabled: options.corsEnabled !== false,
      timeout: options.timeout || 30000,
      maxConcurrentRequests: options.maxConcurrentRequests || 10,
      ...options
    };
    
    this.app = express();
    this.mcpProcess = null;
    this.isConnected = false;
    this.requestQueue = new Map();
    this.requestCounter = 0;
    this.activeRequests = 0;
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }
  
  setupMiddleware() {
    // CORS support
    if (this.options.corsEnabled) {
      this.app.use(cors({
        origin: true,
        credentials: true,
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
      }));
    }
    
    // JSON parsing
    this.app.use(express.json({ limit: '10mb' }));
    
    // Request logging
    this.app.use((req, res, next) => {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
      next();
    });
  }
  
  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        mcpConnected: this.isConnected,
        activeRequests: this.activeRequests,
        timestamp: new Date().toISOString()
      });
    });
    
    // Start MCP server
    this.app.post('/mcp/start', async (req, res) => {
      try {
        const { command, args = [], adamFile } = req.body;
        
        if (!command) {
          return res.status(400).json({
            error: 'Missing command',
            message: 'MCP server command is required'
          });
        }
        
        await this.startMCPServer(command, args, adamFile);
        
        res.json({
          status: 'started',
          command,
          args,
          adamFile,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        res.status(500).json({
          error: 'Failed to start MCP server',
          message: error.message
        });
      }
    });
    
    // Stop MCP server
    this.app.post('/mcp/stop', async (req, res) => {
      try {
        await this.stopMCPServer();
        res.json({
          status: 'stopped',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          error: 'Failed to stop MCP server',
          message: error.message
        });
      }
    });
    
    // MCP server status
    this.app.get('/mcp/status', (req, res) => {
      res.json({
        connected: this.isConnected,
        activeRequests: this.activeRequests,
        queuedRequests: this.requestQueue.size,
        serverRunning: this.mcpProcess !== null && !this.mcpProcess.killed
      });
    });
    
    // Send MCP request
    this.app.post('/mcp/request', async (req, res) => {
      try {
        if (!this.isConnected) {
          return res.status(503).json({
            error: 'MCP server not connected',
            message: 'Start MCP server first using /mcp/start'
          });
        }
        
        if (this.activeRequests >= this.options.maxConcurrentRequests) {
          return res.status(429).json({
            error: 'Too many requests',
            message: `Maximum ${this.options.maxConcurrentRequests} concurrent requests allowed`
          });
        }
        
        const mcpRequest = req.body;
        
        // Validate MCP request format
        if (!mcpRequest.jsonrpc || !mcpRequest.method) {
          return res.status(400).json({
            error: 'Invalid MCP request',
            message: 'jsonrpc and method fields are required'
          });
        }
        
        // Assign ID if not provided
        if (!mcpRequest.id) {
          mcpRequest.id = ++this.requestCounter;
        }
        
        const response = await this.sendMCPRequest(mcpRequest);
        res.json(response);
        
      } catch (error) {
        res.status(500).json({
          error: 'MCP request failed',
          message: error.message
        });
      }
    });
    
    // Convenience endpoints for common MCP operations
    this.app.get('/mcp/tools', async (req, res) => {
      try {
        const response = await this.sendMCPRequest({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: ++this.requestCounter
        });
        res.json(response);
      } catch (error) {
        res.status(500).json({
          error: 'Failed to list tools',
          message: error.message
        });
      }
    });
    
    this.app.post('/mcp/tools/:toolName', async (req, res) => {
      try {
        const { toolName } = req.params;
        const args = req.body || {};
        
        const response = await this.sendMCPRequest({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: args
          },
          id: ++this.requestCounter
        });
        res.json(response);
      } catch (error) {
        res.status(500).json({
          error: `Failed to call tool ${req.params.toolName}`,
          message: error.message
        });
      }
    });
    
    this.app.get('/mcp/resources', async (req, res) => {
      try {
        const response = await this.sendMCPRequest({
          jsonrpc: '2.0',
          method: 'resources/list',
          id: ++this.requestCounter
        });
        res.json(response);
      } catch (error) {
        res.status(500).json({
          error: 'Failed to list resources',
          message: error.message
        });
      }
    });
  }
  
  setupErrorHandling() {
    // Global error handler
    this.app.use((error, req, res, next) => {
      console.error(`HTTP Bridge error: ${error.message}`);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    });
    
    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not found',
        message: `Endpoint ${req.method} ${req.originalUrl} not found`,
        availableEndpoints: [
          'POST /mcp/start',
          'POST /mcp/stop', 
          'GET /mcp/status',
          'POST /mcp/request',
          'GET /mcp/tools',
          'POST /mcp/tools/:toolName',
          'GET /mcp/resources',
          'GET /health'
        ]
      });
    });
  }
  
  async startMCPServer(command, args = [], adamFile) {
    if (this.mcpProcess) {
      throw new Error('MCP server already running');
    }
    
    console.log(`Starting MCP server: ${command} ${args.join(' ')}`);
    
    // Add ADAM file to args if provided
    const finalArgs = adamFile ? [...args, adamFile] : args;
    
    this.mcpProcess = spawn(command, finalArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });
    
    this.mcpProcess.on('error', (error) => {
      console.error(`MCP server error: ${error.message}`);
      this.isConnected = false;
      this.emit('error', error);
    });
    
    this.mcpProcess.on('exit', (code, signal) => {
      console.log(`MCP server exited with code ${code}, signal ${signal}`);
      this.isConnected = false;
      this.mcpProcess = null;
      this.emit('disconnect');
    });
    
    // Handle MCP responses
    let buffer = '';
    this.mcpProcess.stdout.on('data', (data) => {
      buffer += data.toString();
      
      // Process complete JSON-RPC messages
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const response = JSON.parse(line.trim());
            this.handleMCPResponse(response);
          } catch (error) {
            console.warn(`Failed to parse MCP response: ${line}`);
          }
        }
      }
    });
    
    this.mcpProcess.stderr.on('data', (data) => {
      console.error(`MCP server stderr: ${data.toString()}`);
    });
    
    // Send initialization
    console.log('Sending MCP initialization...');
    try {
      await this.initializeMCP();
      this.isConnected = true;
      console.log('MCP server started and initialized');
    } catch (error) {
      console.error('MCP initialization failed:', error.message);
      throw error;
    }
  }
  
  async stopMCPServer() {
    if (!this.mcpProcess) {
      return;
    }
    
    console.log('Stopping MCP server...');
    
    // Clear pending requests
    for (const [id, { reject }] of this.requestQueue) {
      reject(new Error('MCP server stopping'));
    }
    this.requestQueue.clear();
    
    // Terminate process
    this.mcpProcess.kill('SIGTERM');
    
    // Force kill after timeout
    setTimeout(() => {
      if (this.mcpProcess && !this.mcpProcess.killed) {
        this.mcpProcess.kill('SIGKILL');
      }
    }, 5000);
    
    this.mcpProcess = null;
    this.isConnected = false;
  }
  
  async initializeMCP() {
    const initRequest = {
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '1.0',
        clientInfo: {
          name: 'mcp-http-bridge',
          version: '1.0.0'
        }
      },
      id: ++this.requestCounter
    };
    
    await this.sendMCPRequest(initRequest);
  }
  
  async sendMCPRequest(request) {
    return new Promise((resolve, reject) => {
      if (!this.mcpProcess) {
        reject(new Error('MCP server not running'));
        return;
      }
      
      // Allow initialization requests even when not yet connected
      if (!this.isConnected && request.method !== 'initialize') {
        reject(new Error('MCP server not connected'));
        return;
      }
      
      this.activeRequests++;
      
      // Store request in queue
      this.requestQueue.set(request.id, {
        resolve,
        reject,
        timestamp: Date.now()
      });
      
      // Set timeout
      const timeout = setTimeout(() => {
        if (this.requestQueue.has(request.id)) {
          this.requestQueue.delete(request.id);
          this.activeRequests--;
          reject(new Error(`MCP request timeout after ${this.options.timeout}ms`));
        }
      }, this.options.timeout);
      
      // Update stored reject to clear timeout
      this.requestQueue.get(request.id).reject = (error) => {
        clearTimeout(timeout);
        this.activeRequests--;
        reject(error);
      };
      
      // Update stored resolve to clear timeout
      this.requestQueue.get(request.id).resolve = (response) => {
        clearTimeout(timeout);
        this.activeRequests--;
        resolve(response);
      };
      
      // Send request to MCP server
      const requestLine = JSON.stringify(request) + '\n';
      this.mcpProcess.stdin.write(requestLine);
    });
  }
  
  handleMCPResponse(response) {
    if (response.id !== undefined && this.requestQueue.has(response.id)) {
      const { resolve } = this.requestQueue.get(response.id);
      this.requestQueue.delete(response.id);
      resolve(response);
    } else {
      // Notification or unmatched response
      console.log('MCP notification:', JSON.stringify(response, null, 2));
      this.emit('notification', response);
    }
  }
  
  async start() {
    return new Promise((resolve, reject) => {
      const server = this.app.listen(this.options.port, this.options.host, (error) => {
        if (error) {
          reject(error);
        } else {
          console.log(`🌉 MCP HTTP Bridge running on http://${this.options.host}:${this.options.port}`);
          console.log(`📋 Available endpoints:`);
          console.log(`   POST /mcp/start - Start MCP server`);
          console.log(`   POST /mcp/stop - Stop MCP server`);
          console.log(`   GET /mcp/status - Server status`);
          console.log(`   POST /mcp/request - Send MCP request`);
          console.log(`   GET /mcp/tools - List tools`);
          console.log(`   POST /mcp/tools/:name - Call tool`);
          console.log(`   GET /health - Health check`);
          resolve(server);
        }
      });
      
      // Graceful shutdown
      process.on('SIGTERM', async () => {
        console.log('Received SIGTERM, shutting down gracefully');
        await this.stopMCPServer();
        server.close(() => {
          console.log('HTTP Bridge closed');
          process.exit(0);
        });
      });
    });
  }
}

// Export for use as module
export default MCPHttpBridge;

// Start bridge if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const bridge = new MCPHttpBridge({
    port: process.env.BRIDGE_PORT || 8080,
    host: process.env.BRIDGE_HOST || 'localhost'
  });
  
  bridge.start().catch(error => {
    console.error('Failed to start MCP HTTP Bridge:', error);
    process.exit(1);
  });
}