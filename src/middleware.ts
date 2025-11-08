import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Redirect old endpoint paths to new API routes
  const redirects: Record<string, string> = {
    '/convert': '/api/convert',
    '/convert-mml': '/api/convert-mml',
    '/convert-url': '/api/convert-url',
    '/health': '/api/health',
  };

  if (redirects[pathname]) {
    const url = request.nextUrl.clone();
    url.pathname = redirects[pathname];
    return NextResponse.redirect(url, 308); // 308 Permanent Redirect (preserves method)
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/convert',
    '/convert-mml',
    '/convert-url',
    '/health',
  ],
};
