export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">GLB to VRM Converter</h1>

        <div className="space-y-6">
          <section className="border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">API Endpoints</h2>

            <div className="space-y-4">
              <div>
                <h3 className="font-mono font-semibold text-sm mb-2">POST /api/convert</h3>
                <p className="text-sm text-gray-600 mb-2">
                  Upload a GLB file to convert to VRM
                </p>
                <pre className="bg-gray-100 p-3 rounded text-xs overflow-x-auto">
{`curl -X POST http://localhost:3000/api/convert \\
  -F "glb=@model.glb" \\
  -o output.vrm`}
                </pre>
              </div>

              <div>
                <h3 className="font-mono font-semibold text-sm mb-2">POST /api/convert-mml</h3>
                <p className="text-sm text-gray-600 mb-2">
                  Convert MML URL to VRM
                </p>
                <pre className="bg-gray-100 p-3 rounded text-xs overflow-x-auto">
{`curl -X POST http://localhost:3000/api/convert-mml \\
  -H "Content-Type: application/json" \\
  -d '{"mmlUrl": "https://example.com/avatar.mml"}' \\
  -o output.vrm`}
                </pre>
              </div>

              <div>
                <h3 className="font-mono font-semibold text-sm mb-2">GET /api/convert-url</h3>
                <p className="text-sm text-gray-600 mb-2">
                  Auto-detect and convert GLB or MML URL to VRM
                </p>
                <pre className="bg-gray-100 p-3 rounded text-xs overflow-x-auto">
{`curl "http://localhost:3000/api/convert-url?url=https://example.com/model.glb" \\
  -o output.vrm`}
                </pre>
              </div>

              <div>
                <h3 className="font-mono font-semibold text-sm mb-2">GET /api/health</h3>
                <p className="text-sm text-gray-600 mb-2">
                  Health check endpoint
                </p>
                <pre className="bg-gray-100 p-3 rounded text-xs overflow-x-auto">
{`curl http://localhost:3000/api/health`}
                </pre>
              </div>
            </div>
          </section>

          <section className="border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Features</h2>
            <ul className="list-disc list-inside space-y-2 text-sm text-gray-700">
              <li>Convert GLB files to VRM format using Blender 4.2+</li>
              <li>Support for MML (layered avatar) format</li>
              <li>Automatic merging of multi-part models</li>
              <li>100MB file size limit</li>
              <li>5-minute conversion timeout</li>
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}
