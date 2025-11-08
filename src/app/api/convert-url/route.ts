import { NextRequest, NextResponse } from 'next/server';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { runBlenderConversion } from '@/lib/blender';
import { parseMML, processMML } from '@/lib/mml-handler';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  let workDir: string | null = null;
  let glbPath: string | null = null;
  let outputPath: string | null = null;

  try {
    const url = request.nextUrl.searchParams.get('url');

    if (!url) {
      return NextResponse.json(
        { error: 'url query parameter is required' },
        { status: 400 }
      );
    }

    const requestId = randomUUID();
    workDir = path.join('/tmp', `convert_${requestId}`);
    await mkdir(workDir, { recursive: true });

    console.log(`[${requestId}] Auto-detecting file type for: ${url}`);
    console.log(`[${requestId}] Work directory: ${workDir}`);

    // Fetch the URL and check initial bytes
    const response = await fetch(url);
    if (!response.ok) {
      return NextResponse.json(
        {
          error: 'Failed to fetch URL',
          details: response.statusText
        },
        { status: 400 }
      );
    }

    // Read buffer to detect file type
    const buffer = await response.arrayBuffer();
    const bufferBytes = Buffer.from(buffer);
    const header = bufferBytes.slice(0, 8);

    // GLB files start with "glTF" magic number (0x67 0x6C 0x54 0x46)
    const isGLB = header[0] === 0x67 && header[1] === 0x6C &&
                  header[2] === 0x54 && header[3] === 0x46;

    // Check if it looks like XML/text (MML)
    const headerStr = header.toString('utf8');
    const isMML = headerStr.includes('<') || headerStr.includes('<?xml');

    let sourceType: 'glb' | 'mml';

    if (isGLB) {
      console.log(`[${requestId}] Detected GLB file`);
      sourceType = 'glb';

      // Save GLB to disk
      glbPath = path.join(workDir, 'input.glb');
      await writeFile(glbPath, bufferBytes);
      console.log(`[${requestId}] GLB saved: ${glbPath}`);

      // Convert to VRM using Blender
      outputPath = path.join(workDir, 'output.vrm');
      const result = await runBlenderConversion(glbPath, outputPath, requestId);

      if (!result.success) {
        console.error(`[${requestId}] Conversion failed:`, result.error);
        return NextResponse.json(
          {
            error: 'Conversion failed',
            details: result.error
          },
          { status: 500 }
        );
      }

    } else if (isMML) {
      console.log(`[${requestId}] Detected MML file`);
      sourceType = 'mml';

      // Process MML (will handle monolithic/non-monolithic detection internally)
      const mmlContent = bufferBytes.toString('utf8');

      // Parse and process MML
      const { baseUrl, additionalModels, isMonolithic } = parseMML(mmlContent);
      console.log(`[${requestId}] MML type: ${isMonolithic ? 'monolithic' : 'non-monolithic'}`);
      console.log(`[${requestId}] Base GLB: ${baseUrl}`);
      console.log(`[${requestId}] Additional models: ${additionalModels.length}`);

      // Download base GLB
      const baseGlbPath = path.join(workDir, 'base.glb');
      const baseResponse = await fetch(baseUrl);
      if (!baseResponse.ok) {
        throw new Error(`Failed to download base GLB: ${baseResponse.statusText}`);
      }
      const baseBuffer = await baseResponse.arrayBuffer();
      await writeFile(baseGlbPath, Buffer.from(baseBuffer));

      if (isMonolithic) {
        // Simple case - just use the base GLB
        console.log(`[${requestId}] Monolithic MML - using base GLB directly`);
        glbPath = baseGlbPath;
      } else {
        // Download all additional GLBs
        const additionalGlbPaths: string[] = [];
        for (let i = 0; i < additionalModels.length; i++) {
          const modelUrl = additionalModels[i];
          const modelPath = path.join(workDir, `model_${i}.glb`);
          const modelResponse = await fetch(modelUrl);
          if (!modelResponse.ok) {
            throw new Error(`Failed to download model ${i}: ${modelResponse.statusText}`);
          }
          const modelBuffer = await modelResponse.arrayBuffer();
          await writeFile(modelPath, Buffer.from(modelBuffer));
          additionalGlbPaths.push(modelPath);
        }

        // Import mergeGLBFiles function
        const { mergeGLBFiles } = await import('@/lib/blender');

        // Merge GLBs using Blender
        const mergedPath = path.join(workDir, 'merged.glb');
        await mergeGLBFiles(baseGlbPath, additionalGlbPaths, mergedPath);
        console.log(`[${requestId}] Merged GLB written to: ${mergedPath}`);
        glbPath = mergedPath;
      }

      // Convert to VRM using Blender
      outputPath = path.join(workDir, 'output.vrm');
      const result = await runBlenderConversion(glbPath, outputPath, requestId);

      if (!result.success) {
        console.error(`[${requestId}] Conversion failed:`, result.error);
        return NextResponse.json(
          {
            error: 'Conversion failed',
            details: result.error
          },
          { status: 500 }
        );
      }

    } else {
      console.error(`[${requestId}] Unknown file type. Header bytes:`, header);
      return NextResponse.json(
        {
          error: 'Unknown file type',
          details: 'File must be either GLB (binary) or MML (text/xml)'
        },
        { status: 400 }
      );
    }

    // Read the output VRM file
    const vrmBuffer = await readFile(outputPath!);

    const duration = Date.now() - startTime;
    console.log(`[${requestId}] Conversion successful (${duration}ms)`);

    // Return the VRM file
    return new NextResponse(vrmBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'model/gltf-binary',
        'Content-Disposition': 'attachment; filename="avatar.vrm"',
        'X-Conversion-Time-Ms': duration.toString(),
        'X-Source-Type': sourceType!
      }
    });

  } catch (error) {
    console.error('Auto-convert error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  } finally {
    // Cleanup temporary directory
    if (workDir) {
      await rm(workDir, { recursive: true, force: true }).catch(err =>
        console.error('Failed to delete work directory:', err)
      );
    }
  }
}
