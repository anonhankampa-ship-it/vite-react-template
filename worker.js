import { onRequest as handleAi } from './functions/api/ai.js';
import { onRequest as handleGitHub } from './functions/api/github.js';
import { onRequest as handleOps } from './functions/api/ops.js';

const API_HANDLERS = new Map([
  ['/api/ai', handleAi],
  ['/api/github', handleGitHub],
  ['/api/ops', handleOps],
]);

function addSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  headers.set('Content-Security-Policy', "frame-ancestors 'self'");
  headers.set('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname.replace(/\/$/, '') || '/';
    const handler = API_HANDLERS.get(pathname);

    if (handler) {
      return addSecurityHeaders(await handler({ request, env }));
    }

    if (pathname.startsWith('/api/')) {
      return addSecurityHeaders(jsonError('ไม่รองรับ API นี้', 404));
    }

    return addSecurityHeaders(await env.ASSETS.fetch(request));
  },
};
