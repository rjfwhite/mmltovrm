import fs from 'fs/promises';
import path from 'path';
import { mergeGLBFiles } from './blender';

export interface MMLParseResult {
  baseUrl: string;
  additionalModels: string[];
  isMonolithic: boolean;
}

/**
 * Download a file from URL
 */
async function downloadFile(url: string, outputPath: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  await fs.writeFile(outputPath, Buffer.from(buffer));
  return outputPath;
}

/**
 * Parse MML content and extract GLB URLs
 */
export function parseMML(mmlContent: string): MMLParseResult {
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
 * Process MML URL and return merged GLB path
 */
export async function processMML(mmlUrl: string, workDir: string): Promise<string> {
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
  const additionalGlbPaths: string[] = [];
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
