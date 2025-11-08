# GLB to VRM Converter Service

A Next.js TypeScript application that converts GLB files to VRM format using headless Blender 4.2+.

## Features

- Next.js API routes for GLB to VRM conversion
- TypeScript for type safety
- Support for MML (layered avatar) format
- Headless Blender processing
- Docker containerized for easy deployment
- Google Cloud Run compatible
- Built-in VRM addon support (Blender 4.2+)

## API Endpoints

### POST /api/convert

Converts a GLB file to VRM format.

**Request:**
- Method: `POST`
- Content-Type: `multipart/form-data`
- Body: Form data with `glb` field containing the GLB file

**Response:**
- Success (200): Returns the VRM file as `model/gltf-binary`
- Error (400/500): JSON error response

**Example using curl:**

```bash
curl -X POST \
  -F "glb=@your-model.glb" \
  -o output.vrm \
  http://localhost:3000/api/convert
```

### POST /api/convert-mml

Converts an MML URL to VRM format.

**Request:**
- Method: `POST`
- Content-Type: `application/json`
- Body: `{ "mmlUrl": "https://example.com/avatar.mml" }`

**Response:**
- Success (200): Returns the VRM file as `model/gltf-binary`
- Error (400/500): JSON error response

**Example using curl:**

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"mmlUrl": "https://example.com/avatar.mml"}' \
  -o output.vrm \
  http://localhost:3000/api/convert-mml
```

### GET /api/convert-url

Auto-detects file type and converts GLB or MML URL to VRM format.

**Request:**
- Method: `GET`
- Query parameter: `url` - URL to the GLB or MML file

**Response:**
- Success (200): Returns the VRM file as `model/gltf-binary`
- Error (400/500): JSON error response

**Example using curl:**

```bash
curl "http://localhost:3000/api/convert-url?url=https://example.com/model.glb" \
  -o output.vrm
```

### GET /api/health

Health check endpoint for monitoring.

**Response:**
```json
{
  "status": "healthy"
}
```

## Local Development

### Prerequisites

- Node.js 18+
- Docker (for containerized builds)

### Run Locally (without Docker)

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

The application will be available at `http://localhost:3000`.

Note: You'll need Blender 4.2+ installed locally and the `BLENDER_PATH` environment variable set.

### Build and Run with Docker

```bash
# Build the image
docker build -t glb-to-vrm-converter .

# Run the container
docker run -p 8080:8080 glb-to-vrm-converter
```

The application will be available at `http://localhost:8080`.

### Test the service

```bash
# Upload a GLB file and get VRM back
curl -X POST \
  -F "glb=@test-model.glb" \
  -o output.vrm \
  http://localhost:3000/api/convert
```

## Deployment to Google Cloud Run

### Prerequisites

- Google Cloud SDK installed
- Google Cloud project created
- Artifact Registry or Container Registry enabled

### Deploy Steps

1. **Set your project ID:**

```bash
export PROJECT_ID=your-project-id
export REGION=us-central1
gcloud config set project $PROJECT_ID
```

2. **Enable required APIs:**

```bash
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable artifactregistry.googleapis.com
```

3. **Build and push the image:**

```bash
# Using Cloud Build
gcloud builds submit --tag gcr.io/$PROJECT_ID/glb-to-vrm-converter

# Or using Artifact Registry
gcloud builds submit --tag $REGION-docker.pkg.dev/$PROJECT_ID/cloud-run-source-deploy/glb-to-vrm-converter
```

4. **Deploy to Cloud Run:**

```bash
gcloud run deploy glb-to-vrm-converter \
  --image gcr.io/$PROJECT_ID/glb-to-vrm-converter \
  --platform managed \
  --region $REGION \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --max-instances 10 \
  --allow-unauthenticated
```

5. **Get the service URL:**

```bash
gcloud run services describe glb-to-vrm-converter \
  --region $REGION \
  --format 'value(status.url)'
```

### Cloud Run Configuration

The service is configured with:
- **Memory:** 2GB (Blender requires significant memory)
- **CPU:** 2 vCPUs
- **Timeout:** 300 seconds (5 minutes for complex models)
- **Port:** 8080 (automatically detected by Cloud Run)

Adjust these settings based on your model complexity:

```bash
# For larger models, increase resources
gcloud run services update glb-to-vrm-converter \
  --memory 4Gi \
  --cpu 4 \
  --region $REGION
```

## Environment Variables

- `PORT`: Server port (default: 8080)
- `BLENDER_PATH`: Path to Blender executable (default: `blender`)

## File Size Limits

- Maximum upload size: 100MB
- Can be adjusted in `next.config.js` by modifying the `bodySizeLimit` configuration

## Architecture

### GLB Upload Flow
1. Client uploads GLB file via POST request to `/api/convert`
2. Next.js API route receives file and saves to `/tmp/uploads/`
3. Server spawns Blender in headless mode with Python conversion script
4. Python script:
   - Imports GLB file
   - Sets VRM spec version to 0.0
   - Auto-assigns VRM humanoid bones
   - Exports as VRM format
5. Server returns VRM file to client
6. Temporary files are cleaned up

### MML Conversion Flow
1. Client provides MML URL via POST request to `/api/convert-mml`
2. Server downloads and parses MML file
3. Downloads base GLB and any additional model GLBs
4. If multi-part, merges all GLBs using Blender
5. Converts merged/base GLB to VRM
6. Returns VRM file to client
7. Temporary files are cleaned up

### Project Structure
```
/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── convert/route.ts          # GLB upload endpoint
│   │   │   ├── convert-mml/route.ts      # MML conversion endpoint
│   │   │   ├── convert-url/route.ts      # Auto-detect URL endpoint
│   │   │   └── health/route.ts           # Health check endpoint
│   │   ├── page.tsx                      # Homepage
│   │   └── layout.tsx                    # Root layout
│   └── lib/
│       ├── blender.ts                    # Blender utilities
│       └── mml-handler.ts                # MML parsing and processing
├── blender_scripts/
│   ├── convert_glb_to_vrm.py            # Main conversion script
│   ├── merge_glb_files.py               # GLB merging script
│   └── ...
├── next.config.js                        # Next.js configuration
├── tsconfig.json                         # TypeScript configuration
├── package.json                          # Dependencies
└── Dockerfile                            # Container configuration
```

## Troubleshooting

### Conversion fails

Check the logs for Blender output:

```bash
# Local Docker
docker logs <container-id>

# Cloud Run
gcloud run logs read glb-to-vrm-converter --region $REGION
```

### Out of memory

Increase Cloud Run memory allocation or optimize the GLB file before conversion.

### Timeout errors

Increase the timeout value:

```bash
gcloud run services update glb-to-vrm-converter \
  --timeout 600 \
  --region $REGION
```

## License

MIT
