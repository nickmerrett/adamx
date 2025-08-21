#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';
import { ADAMPipeline } from './pipeline.js';
import { generateValidationReport } from './utils/validator.js';
import { Logger } from './utils/logger.js';
import { SimpleADAMPacker } from './wasm/simple-packer.js';
import { ADAMMCPPacker } from './wasm/adam-mcp-packer.js';
// import { createADAMMCPServer } from './wasm/adam-mcp-server.js'; // Requires MCP SDK

const program = new Command();
const logger = new Logger();

program
  .name('adam-converter')
  .description('Convert documents to ADAM (Agentic Document Augmentation Markup)')
  .version('1.0.0');

program
  .command('convert')
  .description('Convert a document to ADAM format')
  .argument('<input>', 'Input document file (DOCX or PDF)')
  .option('-o, --output <file>', 'Output ADAM file (default: input.adam.json)')
  .option('-m, --model <model>', 'Embedding model to use', 'text-embedding-ada-002')
  .option('-d, --dimension <dim>', 'Embedding dimension', '1536')
  .option('-c, --chunk-size <size>', 'Text chunk size', '500')
  .option('--no-images', 'Skip image processing')
  .option('--no-tables', 'Skip table processing')
  .option('--no-relationships', 'Skip relationship detection')
  .option('--no-validate', 'Skip output validation')
  .option('--compact', 'Generate compact output')
  .option('--include-stats', 'Include processing statistics')
  .option('-v, --verbose', 'Verbose logging')
  .action(async (input, options) => {
    try {
      // Setup logging
      if (options.verbose) {
        logger.setLevel('debug');
      }

      // Validate input file
      const inputPath = path.resolve(input);
      const ext = path.extname(inputPath).toLowerCase();
      
      if (!['.docx', '.pdf'].includes(ext)) {
        logger.error('Unsupported file format. Supported formats: DOCX, PDF');
        process.exit(1);
      }

      // Check if input exists
      try {
        await fs.access(inputPath);
      } catch (error) {
        logger.error(`Input file not found: ${inputPath}`);
        process.exit(1);
      }

      // Setup output path
      const outputPath = options.output || 
        path.join(path.dirname(inputPath), 
          path.basename(inputPath, ext) + '.adam.json');

      logger.info(`Converting: ${chalk.cyan(inputPath)}`);
      logger.info(`Output: ${chalk.cyan(outputPath)}`);

      // Setup pipeline options
      const pipelineOptions = {
        embeddingModel: options.model,
        embeddingDimension: parseInt(options.dimension),
        chunkSize: parseInt(options.chunkSize),
        detectImages: options.images !== false,
        detectTables: options.tables !== false,
        detectRelationships: options.relationships !== false,
        validateOutput: options.validate !== false
      };

      // Create pipeline
      const pipeline = new ADAMPipeline(pipelineOptions);
      
      // Start conversion with spinner
      const spinner = ora('Converting document...').start();
      
      try {
        const adamDocument = await pipeline.convert(inputPath);
        spinner.succeed('Document converted successfully');

        // Format output
        const outputOptions = {
          compactOutput: options.compact,
          includeStats: options.includeStats
        };

        // Write output
        const jsonOutput = options.compact ? 
          JSON.stringify(adamDocument) : 
          JSON.stringify(adamDocument, null, 2);

        await fs.writeFile(outputPath, jsonOutput, 'utf8');

        // Show results
        logger.success(`✅ Conversion completed!`);
        logger.info(`📄 Document: ${adamDocument.metadata.title}`);
        logger.info(`📊 Sections: ${adamDocument.sections.length}`);
        logger.info(`💾 Output: ${outputPath}`);

        // Show statistics if verbose
        if (options.verbose) {
          const stats = pipeline.getStats();
          console.log('\n' + chalk.blue('Processing Statistics:'));
          console.log(JSON.stringify(stats, null, 2));
        }

      } catch (error) {
        spinner.fail('Conversion failed');
        logger.error(`Conversion error: ${error.message}`);
        if (options.verbose) {
          logger.error(error.stack);
        }
        process.exit(1);
      }

    } catch (error) {
      logger.error(`CLI error: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Validate an ADAM document')
  .argument('<input>', 'ADAM document file to validate')
  .option('-r, --report', 'Generate detailed validation report')
  .option('-v, --verbose', 'Verbose output')
  .action(async (input, options) => {
    try {
      // Setup logging
      if (options.verbose) {
        logger.setLevel('debug');
      }

      const inputPath = path.resolve(input);
      
      // Check if file exists
      try {
        await fs.access(inputPath);
      } catch (error) {
        logger.error(`File not found: ${inputPath}`);
        process.exit(1);
      }

      logger.info(`Validating: ${chalk.cyan(inputPath)}`);

      // Read and parse document
      const spinner = ora('Reading document...').start();
      
      let document;
      try {
        const content = await fs.readFile(inputPath, 'utf8');
        document = JSON.parse(content);
        spinner.succeed('Document loaded');
      } catch (error) {
        spinner.fail('Failed to read document');
        logger.error(`Parse error: ${error.message}`);
        process.exit(1);
      }

      // Validate document
      spinner.start('Validating document...');
      
      try {
        const report = await generateValidationReport(document);
        
        if (report.valid) {
          spinner.succeed('Document is valid');
          logger.success('✅ Document passes ADAM schema validation');
        } else {
          spinner.fail('Document validation failed');
          logger.error('❌ Document does not conform to ADAM schema');
          
          if (report.warnings.length > 0) {
            console.log('\n' + chalk.yellow('Validation Issues:'));
            for (const warning of report.warnings) {
              console.log(chalk.yellow(`  ⚠ ${warning}`));
            }
          }
        }

        // Show detailed report if requested
        if (options.report || options.verbose) {
          console.log('\n' + chalk.blue('Validation Report:'));
          console.log(JSON.stringify(report, null, 2));
        } else if (report.statistics) {
          // Show basic statistics
          console.log('\n' + chalk.blue('Document Statistics:'));
          console.log(`  Sections: ${report.statistics.total_sections}`);
          console.log(`  With embeddings: ${report.statistics.sections_with_embeddings}`);
          console.log(`  With relationships: ${report.statistics.sections_with_relationships}`);
          
          if (Object.keys(report.statistics.sections_by_type).length > 0) {
            console.log('  Section types:');
            for (const [type, count] of Object.entries(report.statistics.sections_by_type)) {
              console.log(`    ${type}: ${count}`);
            }
          }
        }

        process.exit(report.valid ? 0 : 1);

      } catch (error) {
        spinner.fail('Validation error');
        logger.error(`Validation failed: ${error.message}`);
        process.exit(1);
      }

    } catch (error) {
      logger.error(`CLI error: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('batch')
  .description('Convert multiple documents in batch')
  .argument('<input...>', 'Input document files or directories')
  .option('-o, --output-dir <dir>', 'Output directory (default: current directory)')
  .option('-p, --parallel', 'Process documents in parallel')
  .option('-c, --concurrency <num>', 'Maximum parallel jobs', '3')
  .option('--continue-on-error', 'Continue processing even if some documents fail')
  .option('-v, --verbose', 'Verbose logging')
  .action(async (inputs, options) => {
    try {
      // Setup logging
      if (options.verbose) {
        logger.setLevel('debug');
      }

      const outputDir = options.outputDir ? path.resolve(options.outputDir) : process.cwd();
      
      // Create output directory if it doesn't exist
      await fs.mkdir(outputDir, { recursive: true });

      // Collect input files
      const inputFiles = [];
      for (const input of inputs) {
        const inputPath = path.resolve(input);
        const stats = await fs.stat(inputPath);
        
        if (stats.isDirectory()) {
          // Scan directory for supported files
          const files = await fs.readdir(inputPath);
          for (const file of files) {
            const filePath = path.join(inputPath, file);
            const ext = path.extname(file).toLowerCase();
            if (['.docx', '.pdf'].includes(ext)) {
              inputFiles.push(filePath);
            }
          }
        } else {
          // Single file
          const ext = path.extname(inputPath).toLowerCase();
          if (['.docx', '.pdf'].includes(ext)) {
            inputFiles.push(inputPath);
          } else {
            logger.warn(`Skipping unsupported file: ${inputPath}`);
          }
        }
      }

      if (inputFiles.length === 0) {
        logger.error('No supported files found');
        process.exit(1);
      }

      logger.info(`Found ${inputFiles.length} documents to process`);

      // Setup pipeline
      const pipeline = new ADAMPipeline({
        validateOutput: false // Skip validation for batch processing speed
      });

      // Process documents
      const batchOptions = {
        parallel: options.parallel,
        maxConcurrency: parseInt(options.concurrency)
      };

      const spinner = ora('Processing documents...').start();
      let processed = 0;
      let failed = 0;

      try {
        const results = await pipeline.convertBatch(inputFiles, batchOptions);
        
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const inputFile = inputFiles[i];
          const outputFile = path.join(outputDir, 
            path.basename(inputFile, path.extname(inputFile)) + '.adam.json');

          if (result.error) {
            failed++;
            logger.error(`Failed: ${inputFile} - ${result.error}`);
            
            if (!options.continueOnError) {
              spinner.fail('Batch processing failed');
              process.exit(1);
            }
          } else {
            processed++;
            
            // Write output  
            const jsonOutput = JSON.stringify(result, null, 2);
            await fs.writeFile(outputFile, jsonOutput, 'utf8');
            
            if (options.verbose) {
              logger.info(`✅ ${inputFile} -> ${outputFile}`);
            }
          }
        }

        spinner.succeed('Batch processing completed');
        logger.success(`✅ Processed ${processed} documents successfully`);
        
        if (failed > 0) {
          logger.warn(`⚠ ${failed} documents failed`);
        }

      } catch (error) {
        spinner.fail('Batch processing failed');
        logger.error(`Batch error: ${error.message}`);
        process.exit(1);
      }

    } catch (error) {
      logger.error(`CLI error: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('info')
  .description('Show information about an ADAM document')
  .argument('<input>', 'ADAM document file')
  .option('-s, --sections', 'List all sections')
  .option('-r, --relationships', 'Show relationships')
  .option('-m, --metadata', 'Show full metadata')
  .action(async (input, options) => {
    try {
      const inputPath = path.resolve(input);
      
      // Read document
      const content = await fs.readFile(inputPath, 'utf8');
      const document = JSON.parse(content);

      // Basic info
      console.log(chalk.blue.bold('ADAM Document Information'));
      console.log(chalk.blue('=========================\n'));
      
      console.log(`${chalk.bold('Title:')} ${document.metadata.title}`);
      console.log(`${chalk.bold('Format:')} ${document.format} v${document.version}`);
      console.log(`${chalk.bold('Created:')} ${document.metadata.created}`);
      console.log(`${chalk.bold('Modified:')} ${document.metadata.modified}`);
      console.log(`${chalk.bold('Sections:')} ${document.sections.length}`);

      if (document.metadata.authors && document.metadata.authors.length > 0) {
        console.log(`${chalk.bold('Authors:')} ${document.metadata.authors.map(a => a.name).join(', ')}`);
      }

      if (document.metadata.language) {
        console.log(`${chalk.bold('Language:')} ${document.metadata.language}`);
      }

      // Section breakdown
      const sectionTypes = {};
      let withEmbeddings = 0;
      let withRelationships = 0;

      for (const section of document.sections) {
        sectionTypes[section.type] = (sectionTypes[section.type] || 0) + 1;
        if (section.metadata?.embedding) withEmbeddings++;
        if (section.relationships) withRelationships++;
      }

      console.log('\n' + chalk.blue.bold('Section Types:'));
      for (const [type, count] of Object.entries(sectionTypes)) {
        console.log(`  ${type}: ${count}`);
      }

      console.log(`\n${chalk.bold('Sections with embeddings:')} ${withEmbeddings}`);
      console.log(`${chalk.bold('Sections with relationships:')} ${withRelationships}`);

      // Detailed options
      if (options.sections) {
        console.log('\n' + chalk.blue.bold('Sections:'));
        for (const section of document.sections) {
          const preview = typeof section.content === 'string' ? 
            section.content.substring(0, 100) + '...' : 
            `[${section.content.type}]`;
          console.log(`  ${chalk.cyan(section.id)} (${section.type}): ${preview}`);
        }
      }

      if (options.relationships) {
        console.log('\n' + chalk.blue.bold('Relationships:'));
        for (const section of document.sections) {
          if (section.relationships) {
            console.log(`  ${chalk.cyan(section.id)}:`);
            for (const [type, targets] of Object.entries(section.relationships)) {
              if (Array.isArray(targets)) {
                console.log(`    ${type}: [${targets.join(', ')}]`);
              } else {
                console.log(`    ${type}: ${targets}`);
              }
            }
          }
        }
      }

      if (options.metadata) {
        console.log('\n' + chalk.blue.bold('Full Metadata:'));
        console.log(JSON.stringify(document.metadata, null, 2));
      }

    } catch (error) {
      logger.error(`Failed to read document: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('pack')
  .description('Pack ADAM document into WASM binary')
  .argument('<input>', 'Input ADAM JSON file')
  .option('-o, --output <file>', 'Output WASM file (default: input.wasm)')
  .option('--no-compression', 'Disable gzip compression')
  .option('--remove-embeddings', 'Remove embeddings to reduce size')
  .option('--no-optimize', 'Skip metadata optimization')
  .option('-v, --verbose', 'Verbose output')
  .action(async (input, options) => {
    try {
      const inputPath = path.resolve(input);
      const outputPath = options.output || 
        path.join(path.dirname(inputPath), 
          path.basename(inputPath, '.json') + '.wasm');

      // Validate input
      if (!inputPath.endsWith('.adam.json') && !inputPath.endsWith('.json')) {
        logger.error('Input must be an ADAM JSON file');
        process.exit(1);
      }

      const spinner = ora('Packing ADAM document to WASM...').start();

      try {
        // Create packer
        const packer = new SimpleADAMPacker({
          compression: options.compression !== false ? 'gzip' : 'none',
          removeEmbeddings: options.removeEmbeddings || false,
          optimizeMetadata: options.optimize !== false
        });

        // Pack to WASM
        const result = await packer.pack(inputPath, outputPath);
        
        spinner.succeed('WASM packing completed');
        
        logger.success('✅ ADAM document packed successfully');
        logger.info(`📦 Input: ${path.basename(inputPath)}`);
        logger.info(`📄 Output: ${path.basename(outputPath)}`);
        
        if (options.verbose && result.stats) {
          console.log('\nPacking Statistics:');
          console.log(`  Original size: ${result.stats.originalSize} bytes`);
          console.log(`  Compressed size: ${result.stats.compressedSize} bytes`);
          console.log(`  WASM size: ${result.stats.wasmSize} bytes`);
          console.log(`  Compression ratio: ${result.stats.compressionRatio}%`);
          console.log(`  Sections: ${result.stats.sections}`);
          console.log(`  Format: ${result.stats.format}`);
        }

      } catch (error) {
        spinner.fail('WASM packing failed');
        logger.error(`Packing error: ${error.message}`);
        process.exit(1);
      }

    } catch (error) {
      logger.error(`CLI error: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('unpack')
  .description('Unpack ADAM document from WASM binary')
  .argument('<input>', 'Input WASM file')
  .option('-o, --output <file>', 'Output JSON file (default: input.adam.json)')
  .option('-v, --verbose', 'Verbose output')
  .action(async (input, options) => {
    try {
      const inputPath = path.resolve(input);
      const outputPath = options.output || 
        path.join(path.dirname(inputPath), 
          path.basename(inputPath, '.wasm') + '.adam.json');

      // Validate input
      if (!inputPath.endsWith('.wasm')) {
        logger.error('Input must be a WASM file');
        process.exit(1);
      }

      const spinner = ora('Unpacking ADAM document from WASM...').start();

      try {
        // Create packer
        const packer = new SimpleADAMPacker();

        // Unpack from WASM
        const document = await packer.unpack(inputPath);
        
        // Write output
        const jsonOutput = JSON.stringify(document, null, 2);
        await fs.writeFile(outputPath, jsonOutput, 'utf8');
        
        spinner.succeed('WASM unpacking completed');
        
        logger.success('✅ ADAM document unpacked successfully');
        logger.info(`📦 Input: ${path.basename(inputPath)}`);
        logger.info(`📄 Output: ${path.basename(outputPath)}`);
        
        if (options.verbose) {
          console.log('\nDocument Information:');
          console.log(`  Title: ${document.metadata?.title || 'Untitled'}`);
          console.log(`  Format: ${document.format} v${document.version}`);
          console.log(`  Sections: ${document.sections?.length || 0}`);
          console.log(`  Created: ${document.metadata?.created || 'Unknown'}`);
        }

      } catch (error) {
        spinner.fail('WASM unpacking failed');
        logger.error(`Unpacking error: ${error.message}`);
        process.exit(1);
      }

    } catch (error) {
      logger.error(`CLI error: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('pack-mcp')
  .description('Pack ADAM document into WASM binary with MCP server capabilities')
  .argument('<input>', 'Input ADAM JSON file')
  .option('-o, --output <file>', 'Output WASM file (default: input-mcp.wasm)')
  .option('--no-compression', 'Disable gzip compression')
  .option('--remove-embeddings', 'Remove embeddings to reduce size')
  .option('--no-optimize', 'Skip metadata optimization')
  .option('--no-search-index', 'Disable search index building')
  .option('--no-relationship-cache', 'Disable relationship caching')
  .option('-v, --verbose', 'Verbose output')
  .action(async (input, options) => {
    try {
      const inputPath = path.resolve(input);
      const outputPath = options.output || 
        path.join(path.dirname(inputPath), 
          path.basename(inputPath, '.json') + '-mcp.wasm');

      // Validate input
      if (!inputPath.endsWith('.adam.json') && !inputPath.endsWith('.json')) {
        logger.error('Input must be an ADAM JSON file');
        process.exit(1);
      }

      const spinner = ora('Packing ADAM document with MCP server...').start();

      try {
        // Create enhanced MCP packer
        const packer = new ADAMMCPPacker({
          compression: options.compression !== false ? 'gzip' : 'none',
          removeEmbeddings: options.removeEmbeddings || false,
          optimizeMetadata: options.optimize !== false,
          enableMCP: true,
          mcpOptions: {
            includeSearchIndex: options.searchIndex !== false,
            cacheRelationships: options.relationshipCache !== false
          }
        });

        // Pack to WASM with MCP
        const result = await packer.packWithMCP(inputPath, outputPath);
        
        spinner.succeed('MCP WASM packing completed');
        
        logger.success('✅ ADAM document packed with MCP server successfully');
        logger.info(`📦 Input: ${path.basename(inputPath)}`);
        logger.info(`📄 Output: ${path.basename(outputPath)}`);
        
        if (options.verbose && result.stats) {
          console.log('\nMCP Packing Statistics:');
          console.log(`  Original size: ${result.stats.originalSize} bytes`);
          console.log(`  Compressed size: ${result.stats.compressedSize} bytes`);
          console.log(`  WASM+MCP size: ${result.stats.wasmSize} bytes`);
          console.log(`  Compression ratio: ${result.stats.compressionRatio}%`);
          console.log(`  Sections: ${result.stats.sections}`);
          console.log(`  MCP enabled: ${result.stats.mcpEnabled}`);
          console.log(`  Available tools: ${result.stats.capabilities.tools.length}`);
          console.log(`  Available resources: ${result.stats.capabilities.resources.length}`);
          console.log('  Optimizations:');
          console.log(`    Search index: ${result.stats.optimizations.searchIndexBuilt}`);
          console.log(`    Relationships cached: ${result.stats.optimizations.relationshipsCached}`);
        }

      } catch (error) {
        spinner.fail('MCP WASM packing failed');
        logger.error(`Packing error: ${error.message}`);
        process.exit(1);
      }

    } catch (error) {
      logger.error(`CLI error: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('unpack-mcp')
  .description('Unpack ADAM document from MCP-enabled WASM binary')
  .argument('<input>', 'Input MCP WASM file')
  .option('-o, --output <file>', 'Output JSON file (default: input-unpacked.adam.json)')
  .option('--test-mcp', 'Test MCP bridge functionality after unpacking')
  .option('-v, --verbose', 'Verbose output')
  .action(async (input, options) => {
    try {
      const inputPath = path.resolve(input);
      const outputPath = options.output || 
        path.join(path.dirname(inputPath), 
          path.basename(inputPath, '.wasm') + '-unpacked.adam.json');

      // Validate input
      if (!inputPath.endsWith('.wasm')) {
        logger.error('Input must be a WASM file');
        process.exit(1);
      }

      const spinner = ora('Unpacking MCP-enabled ADAM document from WASM...').start();

      try {
        // Create MCP packer for unpacking
        const packer = new ADAMMCPPacker();

        // Unpack from WASM with MCP
        const result = await packer.unpackWithMCP(inputPath);
        
        // Write document output
        const jsonOutput = JSON.stringify(result.document, null, 2);
        await fs.writeFile(outputPath, jsonOutput, 'utf8');
        
        spinner.succeed('MCP WASM unpacking completed');
        
        logger.success('✅ MCP-enabled ADAM document unpacked successfully');
        logger.info(`📦 Input: ${path.basename(inputPath)}`);
        logger.info(`📄 Output: ${path.basename(outputPath)}`);
        
        if (options.verbose) {
          console.log('\nDocument Information:');
          console.log(`  Title: ${result.document.metadata?.title || 'Untitled'}`);
          console.log(`  Format: ${result.document.format} v${result.document.version}`);
          console.log(`  Sections: ${result.document.sections?.length || 0}`);
          console.log(`  Created: ${result.document.metadata?.created || 'Unknown'}`);
          
          if (result.mcpBridge) {
            console.log('\nMCP Bridge Information:');
            console.log(`  Available tools: ${result.mcpBridge.getAvailableTools().length}`);
            console.log(`  Available resources: ${result.mcpBridge.getAvailableResources().length}`);
            console.log(`  Capabilities: ${JSON.stringify(result.capabilities?.features || {})}`);
          }
        }

        // Test MCP functionality if requested
        if (options.testMcp && result.mcpBridge) {
          console.log('\n🧪 Testing MCP Bridge functionality:');
          
          try {
            // Test search
            const searchResult = await result.mcpBridge.callTool('search_content', {
              query: 'section',
              limit: 3
            });
            console.log(`  ✅ Search test: Found ${searchResult.total_results} results`);
            
            // Test metadata
            const metadata = await result.mcpBridge.callTool('get_metadata');
            console.log(`  ✅ Metadata test: ${metadata.statistics.total_sections} sections`);
            
            // Test concepts
            const concepts = await result.mcpBridge.callTool('extract_concepts', { limit: 5 });
            console.log(`  ✅ Concepts test: ${concepts.total_concepts} concepts found`);
            
            console.log('  🎉 All MCP tests passed!');
            
          } catch (testError) {
            console.log(`  ❌ MCP test failed: ${testError.message}`);
          }
        }

      } catch (error) {
        spinner.fail('MCP WASM unpacking failed');
        logger.error(`Unpacking error: ${error.message}`);
        process.exit(1);
      }

    } catch (error) {
      logger.error(`CLI error: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('mcp-server')
  .description('Start MCP server from ADAM WASM binary')
  .argument('<input>', 'Input ADAM WASM file')
  .option('--stdio', 'Use stdio transport (default)')
  .option('--http', 'Use HTTP transport (not implemented)')
  .option('-v, --verbose', 'Verbose logging')
  .action(async (input, options) => {
    try {
      const inputPath = path.resolve(input);

      // Validate input
      if (!inputPath.endsWith('.wasm')) {
        logger.error('Input must be a WASM file');
        process.exit(1);
      }

      if (options.verbose) {
        logger.info(`🚀 Starting ADAM MCP server from: ${inputPath}`);
      }

      // Start MCP server (requires MCP SDK installation)
      console.log('⚠️  MCP server requires @modelcontextprotocol/sdk package');
      console.log('💡 Install with: npm install @modelcontextprotocol/sdk');
      console.log('🔧 For now, use pack-mcp and mcp-query commands for MCP functionality');
      // await createADAMMCPServer(inputPath);

    } catch (error) {
      logger.error(`MCP server error: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('mcp-query')
  .description('Query ADAM document via MCP bridge (interactive mode)')
  .argument('<input>', 'Input ADAM WASM file')
  .option('-q, --query <query>', 'Execute single query and exit')
  .option('-t, --tool <tool>', 'Tool to use for query', 'search_content')
  .option('-l, --limit <limit>', 'Limit results', '10')
  .option('-v, --verbose', 'Verbose output')
  .action(async (input, options) => {
    try {
      const inputPath = path.resolve(input);

      // Validate input
      if (!inputPath.endsWith('.wasm')) {
        logger.error('Input must be a WASM file');
        process.exit(1);
      }

      const spinner = ora('Loading ADAM document for querying...').start();

      try {
        // Unpack and create MCP bridge
        const packer = new ADAMMCPPacker();
        const result = await packer.unpackWithMCP(inputPath);
        
        if (!result.mcpBridge) {
          throw new Error('No MCP bridge available - file may not be MCP-enabled');
        }

        spinner.succeed('ADAM document loaded');
        
        if (options.query) {
          // Execute single query
          console.log(`\n🔍 Executing query: "${options.query}"`);
          
          const queryResult = await result.mcpBridge.callTool(options.tool, {
            query: options.query,
            limit: parseInt(options.limit)
          });
          
          console.log('\n📋 Results:');
          console.log(JSON.stringify(queryResult, null, 2));
          
        } else {
          // Interactive mode
          console.log('\n🤖 ADAM MCP Query Interface');
          console.log('=====================================');
          console.log(`Document: ${result.document.metadata?.title || 'Untitled'}`);
          console.log(`Sections: ${result.document.sections?.length || 0}`);
          console.log('\nAvailable commands:');
          console.log('  search <query>     - Search content');
          console.log('  get <section_id>   - Get section by ID');  
          console.log('  related <section_id> - Find related sections');
          console.log('  concepts [type]    - Extract concepts');
          console.log('  outline [depth]    - Get document outline');
          console.log('  metadata           - Show document metadata');
          console.log('  tools              - List available tools');
          console.log('  resources          - List available resources');
          console.log('  help               - Show this help');
          console.log('  exit               - Exit interactive mode');
          console.log('\nType a command to get started...\n');
          
          // Note: Full interactive implementation would require readline
          console.log('💡 Interactive mode placeholder - implement with readline for full CLI experience');
        }

      } catch (error) {
        spinner.fail('Query failed');
        logger.error(`Query error: ${error.message}`);
        process.exit(1);
      }

    } catch (error) {
      logger.error(`CLI error: ${error.message}`);
      process.exit(1);
    }
  });

// Error handling
program.exitOverride();

try {
  program.parse();
} catch (error) {
  if (error.code === 'commander.help') {
    process.exit(0);
  } else if (error.code === 'commander.version') {
    process.exit(0);
  } else {
    logger.error(`Command error: ${error.message}`);
    process.exit(1);
  }
}