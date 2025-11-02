const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

/**
 * Download a file from URL
 */
async function downloadFile(url, outputPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.statusText}`);
  }
  const buffer = await response.buffer();
  await fs.writeFile(outputPath, buffer);
  return outputPath;
}

/**
 * Parse MML content and extract GLB URLs
 */
function parseMML(mmlContent) {
  // Extract base m-character src (supports both 'src=' and 'type=... src=')
  const characterMatch = mmlContent.match(/<m-character[^>]+src="([^"]+)"/);
  if (!characterMatch) {
    throw new Error('No m-character element found in MML');
  }

  const baseUrl = characterMatch[1];

  // Extract all m-model src attributes
  const modelMatches = Array.from(mmlContent.matchAll(/<m-model[^>]+src="([^"]+)"/g));
  const additionalModels = modelMatches.map(match => match[1]);

  return {
    baseUrl,
    additionalModels,
    isMonolithic: additionalModels.length === 0
  };
}

/**
 * Merge multiple GLB files using Blender
 */
async function mergeGLBFiles(baseGlbPath, additionalGlbPaths, outputPath) {
  const BLENDER_PATH = process.env.BLENDER_PATH || 'blender';
  const scriptPath = path.join(__dirname, 'merge_glb_files.py');

  return new Promise((resolve, reject) => {
    const args = [
      '--background',
      '--python', scriptPath,
      '--',
      baseGlbPath,
      outputPath,
      ...additionalGlbPaths
    ];

    console.log(`Merging GLB files with Blender...`);
    console.log(`Base: ${baseGlbPath}`);
    console.log(`Additional files: ${additionalGlbPaths.length}`);

    const blender = spawn(BLENDER_PATH, args, {
      timeout: 300000 // 5 minute timeout
    });

    let stdout = '';
    let stderr = '';

    blender.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      console.log(`[Merge] ${output.trim()}`);
    });

    blender.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    blender.on('close', (code) => {
      if (code === 0) {
        console.log('GLB merge successful');
        resolve({ success: true, stdout, stderr });
      } else {
        reject(new Error(`GLB merge failed with code ${code}: ${stderr}`));
      }
    });

    blender.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Process MML URL and return merged GLB path
 */
async function processMML(mmlUrl, workDir) {
  console.log(`Processing MML from: ${mmlUrl}`);

  // Download MML file
  const mmlResponse = await fetch(mmlUrl);
  if (!mmlResponse.ok) {
    throw new Error(`Failed to fetch MML: ${mmlResponse.statusText}`);
  }
  const mmlContent = await mmlResponse.text();

  // Parse MML
  const { baseUrl, additionalModels, isMonolithic } = parseMML(mmlContent);
  console.log(`MML type: ${isMonolithic ? 'monolithic' : 'non-monolithic'}`);
  console.log(`Base GLB: ${baseUrl}`);
  console.log(`Additional models: ${additionalModels.length}`);

  // Download base GLB
  const baseGlbPath = path.join(workDir, 'base.glb');
  await downloadFile(baseUrl, baseGlbPath);

  if (isMonolithic) {
    // Simple case - just return the base GLB
    console.log('Monolithic MML - using base GLB directly');
    return baseGlbPath;
  }

  // Download all additional GLBs
  const additionalGlbPaths = [];
  for (let i = 0; i < additionalModels.length; i++) {
    const modelUrl = additionalModels[i];
    const modelPath = path.join(workDir, `model_${i}.glb`);
    await downloadFile(modelUrl, modelPath);
    additionalGlbPaths.push(modelPath);
  }

  // Merge GLBs using Blender
  const mergedPath = path.join(workDir, 'merged.glb');
  await mergeGLBFiles(baseGlbPath, additionalGlbPaths, mergedPath);
  console.log(`Merged GLB written to: ${mergedPath}`);

  return mergedPath;
}

module.exports = {
  processMML,
  parseMML,
  mergeGLBFiles
};
