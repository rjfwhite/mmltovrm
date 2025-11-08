import { NextRequest, NextResponse } from 'next/server';
import { writeFile, unlink, mkdir, readFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { runBlenderConversion } from '@/lib/blender';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let inputPath: string | null = null;
  let outputPath: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get('glb') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No GLB file uploaded' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.glb') && file.type !== 'model/gltf-binary') {
      return NextResponse.json(
        { error: 'Only GLB files are allowed' },
        { status: 400 }
      );
    }

    // Validate file size (100MB)
    if (file.size > 100 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File too large', message: 'Maximum file size is 100MB' },
        { status: 400 }
      );
    }

    const requestId = randomUUID();

    // Create temp directories
    await mkdir('/tmp/uploads', { recursive: true });
    await mkdir('/tmp/outputs', { recursive: true });

    // Save uploaded file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    inputPath = path.join('/tmp/uploads', `${requestId}.glb`);
    await writeFile(inputPath, buffer);

    outputPath = path.join('/tmp/outputs', `${requestId}.vrm`);

    console.log(`[${requestId}] Starting conversion: ${file.name}`);
    console.log(`[${requestId}] Input: ${inputPath}`);
    console.log(`[${requestId}] Output: ${outputPath}`);

    // Run Blender conversion
    const result = await runBlenderConversion(inputPath, outputPath, requestId);

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
    console.log(`[${requestId}] Conversion successful (${duration}ms)`);

    // Return the VRM file
    return new NextResponse(vrmBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'model/gltf-binary',
        'Content-Disposition': `attachment; filename="${path.basename(file.name, '.glb')}.vrm"`,
        'X-Conversion-Time-Ms': duration.toString()
      }
    });

  } catch (error) {
    console.error('Conversion error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  } finally {
    // Cleanup temporary files
    if (inputPath) {
      await unlink(inputPath).catch(err =>
        console.error('Failed to delete input file:', err)
      );
    }
    if (outputPath) {
      await unlink(outputPath).catch(err =>
        console.error('Failed to delete output file:', err)
      );
    }
  }
}
