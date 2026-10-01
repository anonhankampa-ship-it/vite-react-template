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
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/$/, '') || '/';
    const handler = API_HANDLERS.get(pathname);

    // 1. จัดการส่วนของ API Handlers
    if (handler) {
      return addSecurityHeaders(await handler({ request, env }));
    }

    if (pathname.startsWith('/api/')) {
      return addSecurityHeaders(jsonError('ไม่รองรับ API นี้', 404));
    }

    // 2. จัดการส่วนของ Static Assets (index.html, app.html, JS, CSS)
    try {
      const response = await env.ASSETS.fetch(request);

      // ถ้าค้นหาไฟล์ที่ระบุตรง ๆ ไม่เจอ (เช่น เข้าผ่าน Client-side Routing ของ React)
      if (response.status === 404) {
        // หากผู้ใช้กำลังเข้าใช้หน้าอื่น ๆ ของระบบ ให้ดึง index.html มารองรับ (SPA Fallback)
        const fallbackRequest = new Request(new URL('/index.html', request.url), request);
        return addSecurityHeaders(await env.ASSETS.fetch(fallbackRequest));
      }

      return addSecurityHeaders(response);
    } catch (e) {
      // หากเกิดข้อผิดพลาดในการดึง Asset ให้ส่ง index.html กลับไปเป็นค่าเริ่มต้น
      const defaultRequest = new Request(new URL('/app.html', request.url), request);
      return addSecurityHeaders(await env.ASSETS.fetch(defaultRequest));
    }
  },
};
