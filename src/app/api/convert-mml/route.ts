import { NextRequest, NextResponse } from 'next/server';
import { mkdir, readFile, rm } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { runBlenderConversion } from '@/lib/blender';
import { processMML } from '@/lib/mml-handler';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let workDir: string | null = null;
  let glbPath: string | null = null;
  let outputPath: string | null = null;

  try {
    const body = await request.json();
    const { mmlUrl } = body;

    if (!mmlUrl) {
      return NextResponse.json(
        { error: 'mmlUrl is required in request body' },
        { status: 400 }
      );
    }

    const requestId = randomUUID();
    workDir = path.join('/tmp', `mml_${requestId}`);
    await mkdir(workDir, { recursive: true });

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
      return NextResponse.json(
        {
          error: 'Conversion failed',
          details: result.error
        },
        { status: 500 }
      );
    }

    // Read the output VRM file
    const vrmBuffer = await readFile(outputPath);

    const duration = Date.now() - startTime;
    console.log(`[${requestId}] MML conversion successful (${duration}ms)`);

    // Return the VRM file
    return new NextResponse(vrmBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'model/gltf-binary',
        'Content-Disposition': 'attachment; filename="avatar.vrm"',
        'X-Conversion-Time-Ms': duration.toString()
      }
    });

  } catch (error) {
    console.error('MML conversion error:', error);
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
