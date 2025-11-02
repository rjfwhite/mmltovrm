const express = require('express');
const multer = require('multer');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const fetch = require('node-fetch');
const { processMML } = require('./mml-handler');

const app = express();
const PORT = process.env.PORT || 8080;
const BLENDER_PATH = process.env.BLENDER_PATH || 'blender';

let vrmAddonEnabled = false;

// Enable VRM addon on first use
async function ensureVrmAddonEnabled() {
  if (vrmAddonEnabled) return true;

  console.log('Enabling VRM addon...');
  const scriptPath = '/opt/enable_vrm_addon.py';

  try {
    await new Promise((resolve, reject) => {
      const blender = spawn(BLENDER_PATH, [
        '--background',
        '--python', scriptPath
      ], { timeout: 30000 });

      let output = '';
      blender.stdout.on('data', (data) => { output += data.toString(); });
      blender.stderr.on('data', (data) => { output += data.toString(); });

      blender.on('close', (code) => {
        if (code === 0) {
          console.log('VRM addon enabled successfully');
          vrmAddonEnabled = true;
          resolve();
        } else {
          console.warn('Failed to enable VRM addon, will try to continue anyway:', output);
          vrmAddonEnabled = true; // Try to continue anyway
          resolve();
        }
      });

      blender.on('error', (err) => {
        console.warn('Error enabling VRM addon, will try to continue anyway:', err);
        vrmAddonEnabled = true; // Try to continue anyway
        resolve();
      });
    });
    return true;
  } catch (error) {
    console.warn('Failed to enable VRM addon:', error);
    vrmAddonEnabled = true; // Mark as attempted
    return false;
  }
}

// Configure multer for file uploads
const upload = multer({
  dest: '/tmp/uploads/',
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'model/gltf-binary' ||
        file.originalname.toLowerCase().endsWith('.glb')) {
      cb(null, true);
    } else {
      cb(new Error('Only GLB files are allowed'));
    }
  }
});

// Health check endpoint for Cloud Run
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

app.get('/', (req, res) => {
  res.json({
    service: 'GLB to VRM Converter',
    endpoints: {
      convert: 'POST /convert - Upload a GLB file to convert to VRM',
      'convert-mml': 'POST /convert-mml - Convert MML URL to VRM',
      'convert-url': 'GET /convert-url?url=<URL> - Auto-detect and convert GLB or MML URL to VRM',
      health: 'GET /health - Health check'
    }
  });
});

// Conversion endpoint
app.post('/convert', upload.single('glb'), async (req, res) => {
  const startTime = Date.now();
  let inputPath = null;
  let outputPath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No GLB file uploaded' });
    }

    inputPath = req.file.path;
    const requestId = crypto.randomUUID();
    outputPath = path.join('/tmp/outputs', `${requestId}.vrm`);

    console.log(`[${requestId}] Starting conversion: ${req.file.originalname}`);
    console.log(`[${requestId}] Input: ${inputPath}`);
    console.log(`[${requestId}] Output: ${outputPath}`);

    // Run Blender headless with the conversion script
    const result = await runBlenderConversion(inputPath, outputPath, requestId);

    if (!result.success) {
      console.error(`[${requestId}] Conversion failed:`, result.error);
      return res.status(500).json({
        error: 'Conversion failed',
        details: result.error
      });
    }

    // Read the output VRM file
    const vrmBuffer = await fs.readFile(outputPath);

    const duration = Date.now() - startTime;
    console.log(`[${requestId}] Conversion successful (${duration}ms)`);

    // Send the VRM file
    res.set({
      'Content-Type': 'model/gltf-binary',
      'Content-Disposition': `attachment; filename="${path.basename(req.file.originalname, '.glb')}.vrm"`,
      'X-Conversion-Time-Ms': duration
    });
    res.send(vrmBuffer);

  } catch (error) {
    console.error('Conversion error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  } finally {
    // Cleanup temporary files
    if (inputPath) {
      await fs.unlink(inputPath).catch(err =>
        console.error('Failed to delete input file:', err)
      );
    }
    if (outputPath) {
      await fs.unlink(outputPath).catch(err =>
        console.error('Failed to delete output file:', err)
      );
    }
  }
});

// MML conversion endpoint
app.post('/convert-mml', express.json(), async (req, res) => {
  const startTime = Date.now();
  let workDir = null;
  let glbPath = null;
  let outputPath = null;

  try {
    const { mmlUrl } = req.body;

    if (!mmlUrl) {
      return res.status(400).json({ error: 'mmlUrl is required in request body' });
    }

    const requestId = crypto.randomUUID();
    workDir = path.join('/tmp', `mml_${requestId}`);
    await fs.mkdir(workDir, { recursive: true });

    console.log(`[${requestId}] Starting MML conversion: ${mmlUrl}`);
    console.log(`[${requestId}] Work directory: ${workDir}`);

    // Process MML file (download, parse, merge if needed)
    glbPath = await processMML(mmlUrl, workDir);
    console.log(`[${requestId}] GLB ready: ${glbPath}`);

    // Convert to VRM using Blender
    outputPath = path.join(workDir, 'output.vrm');
    const result = await runBlenderConversion(glbPath, outputPath, requestId);

    if (!result.success) {
      console.error(`[${requestId}] Conversion failed:`, result.error);
      return res.status(500).json({
        error: 'Conversion failed',
        details: result.error
      });
    }

    // Read the output VRM file
    const vrmBuffer = await fs.readFile(outputPath);

    const duration = Date.now() - startTime;
    console.log(`[${requestId}] MML conversion successful (${duration}ms)`);

    // Send the VRM file
    res.set({
      'Content-Type': 'model/gltf-binary',
      'Content-Disposition': `attachment; filename="avatar.vrm"`,
      'X-Conversion-Time-Ms': duration
    });
    res.send(vrmBuffer);

  } catch (error) {
    console.error('MML conversion error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  } finally {
    // Cleanup temporary directory
    if (workDir) {
      await fs.rm(workDir, { recursive: true, force: true }).catch(err =>
        console.error('Failed to delete work directory:', err)
      );
    }
  }
});

// Auto-detect URL type and convert endpoint
app.get('/convert-url', async (req, res) => {
  const startTime = Date.now();
  let workDir = null;
  let glbPath = null;
  let outputPath = null;

  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'url query parameter is required' });
    }

    const requestId = crypto.randomUUID();
    workDir = path.join('/tmp', `convert_${requestId}`);
    await fs.mkdir(workDir, { recursive: true });

    console.log(`[${requestId}] Auto-detecting file type for: ${url}`);
    console.log(`[${requestId}] Work directory: ${workDir}`);

    // Fetch the URL and check initial bytes
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(400).json({
        error: 'Failed to fetch URL',
        details: response.statusText
      });
    }

    // Read first chunk to detect file type
    const buffer = await response.buffer();
    const header = buffer.slice(0, 8);

    // GLB files start with "glTF" magic number (0x46546C67)
    const isGLB = header[0] === 0x67 && header[1] === 0x6C &&
                  header[2] === 0x54 && header[3] === 0x46;

    // Check if it looks like XML/text (MML)
    const headerStr = header.toString('utf8');
    const isMML = headerStr.includes('<') || headerStr.includes('<?xml');

    if (isGLB) {
      console.log(`[${requestId}] Detected GLB file`);

      // Save GLB to disk
      glbPath = path.join(workDir, 'input.glb');
      await fs.writeFile(glbPath, buffer);
      console.log(`[${requestId}] GLB saved: ${glbPath}`);

      // Convert to VRM using Blender
      outputPath = path.join(workDir, 'output.vrm');
      const result = await runBlenderConversion(glbPath, outputPath, requestId);

      if (!result.success) {
        console.error(`[${requestId}] Conversion failed:`, result.error);
        return res.status(500).json({
          error: 'Conversion failed',
          details: result.error
        });
      }

      // Read the output VRM file
      const vrmBuffer = await fs.readFile(outputPath);

      const duration = Date.now() - startTime;
      console.log(`[${requestId}] GLB conversion successful (${duration}ms)`);

      // Send the VRM file
      res.set({
        'Content-Type': 'model/gltf-binary',
        'Content-Disposition': 'attachment; filename="avatar.vrm"',
        'X-Conversion-Time-Ms': duration,
        'X-Source-Type': 'glb'
      });
      res.send(vrmBuffer);

    } else if (isMML) {
      console.log(`[${requestId}] Detected MML file`);

      // Process MML (will handle monolithic/non-monolithic detection internally)
      const mmlContent = buffer.toString('utf8');
      const mmlModule = require('./mml-handler');

      // Write MML to disk temporarily so processMML can work with it
      const mmlPath = path.join(workDir, 'input.mml');
      await fs.writeFile(mmlPath, mmlContent);

      // Parse and process MML
      const { baseUrl, additionalModels, isMonolithic } = mmlModule.parseMML(mmlContent);
      console.log(`[${requestId}] MML type: ${isMonolithic ? 'monolithic' : 'non-monolithic'}`);
      console.log(`[${requestId}] Base GLB: ${baseUrl}`);
      console.log(`[${requestId}] Additional models: ${additionalModels.length}`);

      // Download base GLB
      const baseGlbPath = path.join(workDir, 'base.glb');
      const baseResponse = await fetch(baseUrl);
      if (!baseResponse.ok) {
        throw new Error(`Failed to download base GLB: ${baseResponse.statusText}`);
      }
      const baseBuffer = await baseResponse.buffer();
      await fs.writeFile(baseGlbPath, baseBuffer);

      if (isMonolithic) {
        // Simple case - just use the base GLB
        console.log(`[${requestId}] Monolithic MML - using base GLB directly`);
        glbPath = baseGlbPath;
      } else {
        // Download all additional GLBs
        const additionalGlbPaths = [];
        for (let i = 0; i < additionalModels.length; i++) {
          const modelUrl = additionalModels[i];
          const modelPath = path.join(workDir, `model_${i}.glb`);
          const modelResponse = await fetch(modelUrl);
          if (!modelResponse.ok) {
            throw new Error(`Failed to download model ${i}: ${modelResponse.statusText}`);
          }
          const modelBuffer = await modelResponse.buffer();
          await fs.writeFile(modelPath, modelBuffer);
          additionalGlbPaths.push(modelPath);
        }

        // Merge GLBs using Blender
        const mergedPath = path.join(workDir, 'merged.glb');
        await mmlModule.mergeGLBFiles(baseGlbPath, additionalGlbPaths, mergedPath);
        console.log(`[${requestId}] Merged GLB written to: ${mergedPath}`);
        glbPath = mergedPath;
      }

      // Convert to VRM using Blender
      outputPath = path.join(workDir, 'output.vrm');
      const result = await runBlenderConversion(glbPath, outputPath, requestId);

      if (!result.success) {
        console.error(`[${requestId}] Conversion failed:`, result.error);
        return res.status(500).json({
          error: 'Conversion failed',
          details: result.error
        });
      }

      // Read the output VRM file
      const vrmBuffer = await fs.readFile(outputPath);

      const duration = Date.now() - startTime;
      console.log(`[${requestId}] MML conversion successful (${duration}ms)`);

      // Send the VRM file
      res.set({
        'Content-Type': 'model/gltf-binary',
        'Content-Disposition': 'attachment; filename="avatar.vrm"',
        'X-Conversion-Time-Ms': duration,
        'X-Source-Type': 'mml'
      });
      res.send(vrmBuffer);

    } else {
      console.error(`[${requestId}] Unknown file type. Header bytes:`, header);
      return res.status(400).json({
        error: 'Unknown file type',
        details: 'File must be either GLB (binary) or MML (text/xml)'
      });
    }

  } catch (error) {
    console.error('Auto-convert error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  } finally {
    // Cleanup temporary directory
    if (workDir) {
      await fs.rm(workDir, { recursive: true, force: true }).catch(err =>
        console.error('Failed to delete work directory:', err)
      );
    }
  }
});

/**
 * Run Blender conversion in headless mode
 */
function runBlenderConversion(inputPath, outputPath, requestId) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'convert_glb_to_vrm.py');

    const args = [
      '--background',
      '--python', scriptPath,
      '--',
      inputPath,
      outputPath
    ];

    console.log(`[${requestId}] Executing: ${BLENDER_PATH} ${args.join(' ')}`);

    const blender = spawn(BLENDER_PATH, args, {
      timeout: 300000 // 5 minute timeout
    });

    let stdout = '';
    let stderr = '';

    blender.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      console.log(`[${requestId}] Blender stdout:`, output);
    });

    blender.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      console.error(`[${requestId}] Blender stderr:`, output);
    });

    blender.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, stdout, stderr });
      } else {
        resolve({
          success: false,
          error: `Blender exited with code ${code}`,
          stdout,
          stderr
        });
      }
    });

    blender.on('error', (error) => {
      reject(error);
    });
  });
}

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large',
        message: 'Maximum file size is 100MB'
      });
    }
  }
  console.error('Express error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: error.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`GLB to VRM converter listening on port ${PORT}`);
  console.log(`Blender path: ${BLENDER_PATH}`);
});
