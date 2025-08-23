#!/usr/bin/env node

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 9000;

// Serve static files from hack directory
app.use(express.static(__dirname));

// Default route serves the test harness
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'mcp-test-harness.html'));
});

app.listen(PORT, () => {
  console.log(`🧪 MCP Test Harness Server running on http://localhost:${PORT}`);
  console.log(`📝 Open http://localhost:${PORT} in your browser`);
  console.log(`🌉 Make sure MCP HTTP Bridge is running on port 8080`);
});