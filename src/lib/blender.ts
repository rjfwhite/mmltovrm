import { spawn } from 'child_process';
import path from 'path';

const BLENDER_PATH = process.env.BLENDER_PATH || 'blender';

export interface BlenderResult {
  success: boolean;
  stdout: string;
  stderr: string;
  error?: string;
}

/**
 * Run Blender conversion in headless mode
 */
export function runBlenderConversion(
  inputPath: string,
  outputPath: string,
  requestId: string
): Promise<BlenderResult> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), 'blender_scripts', 'convert_glb_to_vrm.py');

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

/**
 * Merge multiple GLB files using Blender
 */
export async function mergeGLBFiles(
  baseGlbPath: string,
  additionalGlbPaths: string[],
  outputPath: string
): Promise<BlenderResult> {
  const scriptPath = path.join(process.cwd(), 'blender_scripts', 'merge_glb_files.py');

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
