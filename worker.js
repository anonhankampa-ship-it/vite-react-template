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

    // 2. จัดการส่วนของ Static Assets (index.html, app.html)
    try {
      // ดึงข้อมูล Asset ตรงตาม Request จริงที่บราวเซอร์เรียกหา
      const response = await env.ASSETS.fetch(request);

      // แก้ไขปัญหาการเด้งกลับ: ถ้าบราวเซอร์วิ่งไปที่ /app.html ตรง ๆ แต่หาระบบไฟล์ไม่เจอชั่วคราว
      // หรือกรณีทำ Client-side Routing ในหน้า App ให้มันทำการดึง app.html ตัวเองมารองรับ ไม่ใช่โยนกลับไป index
      if (response.status === 404) {
        if (pathname === '/app.html' || pathname.startsWith('/app')) {
          const appRequest = new Request(new URL('/app.html', request.url), request);
          return addSecurityHeaders(await env.ASSETS.fetch(appRequest));
        }
        
        // สำหรับเส้นทางทั่วไปอื่นๆ ค่อยโยนกลับไปหน้าล็อกอิน (index.html)
        const indexRequest = new Request(new URL('/index.html', request.url), request);
        return addSecurityHeaders(await env.ASSETS.fetch(indexRequest));
      }

      return addSecurityHeaders(response);
    } catch (e) {
      // หากเกิด Error กลางทางและระบบตรวจพบว่าเป็นหน้าแอป ให้พยายามเรียกหน้าเดิมซ้ำก่อน
      if (pathname === '/app.html' || pathname.startsWith('/app')) {
        return addSecurityHeaders(await env.ASSETS.fetch(new Request(new URL('/app.html', request.url), request)));
      }
      return addSecurityHeaders(await env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request)));
    }
  },
};
