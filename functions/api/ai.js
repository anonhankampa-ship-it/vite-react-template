const ALLOWED_MODELS = new Set([
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-3-flash-preview'
]);
const MAX_REQUEST_BYTES = 32 * 1024;
const MAX_INPUT_CHARS = 18_000;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function textLength(value) {
  if (!value || !Array.isArray(value)) return 0;
  return value.reduce((total, item) => {
    if (!item || !Array.isArray(item.parts)) return total;
    return total + item.parts.reduce((partTotal, part) =>
      partTotal + (typeof part?.text === 'string' ? part.text.length : 0), 0);
  }, 0);
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) {
    return json({ error: 'คำขอมาจากเว็บไซต์ที่ไม่ได้รับอนุญาต' }, 403);
  }
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    return json({ error: 'ต้องส่งข้อมูลแบบ JSON' }, 415);
  }
  if (!env.GEMINI_API_KEY) {
    return json({ error: 'ยังไม่ได้ตั้งค่า AI service บน Cloudflare' }, 503);
  }

  const declaredLength = Number(request.headers.get('Content-Length') || 0);
  if (declaredLength > MAX_REQUEST_BYTES) return json({ error: 'คำขอมีขนาดใหญ่เกินไป' }, 413);

  let input;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > MAX_REQUEST_BYTES) {
      return json({ error: 'คำขอมีขนาดใหญ่เกินไป' }, 413);
    }
    input = JSON.parse(raw);
  } catch {
    return json({ error: 'ข้อมูล JSON ไม่ถูกต้อง' }, 400);
  }

  if (!input || !ALLOWED_MODELS.has(input.model)) {
    return json({ error: 'ไม่รองรับโมเดลที่เลือก' }, 400);
  }
  if (!Array.isArray(input.contents) || input.contents.length < 1 || input.contents.length > 20) {
    return json({ error: 'รูปแบบประวัติสนทนาไม่ถูกต้อง' }, 400);
  }
  const validContents = input.contents.every((item) =>
    item && ['user', 'model'].includes(item.role) && Array.isArray(item.parts) &&
    item.parts.length > 0 && item.parts.every((part) =>
      part && typeof part.text === 'string' && part.text.length <= MAX_INPUT_CHARS));
  if (!validContents || textLength(input.contents) > MAX_INPUT_CHARS) {
    return json({ error: 'ข้อความยาวเกินกำหนดหรือมีรูปแบบไม่ถูกต้อง' }, 400);
  }

  let systemInstruction;
  if (input.system_instruction !== undefined) {
    const parts = input.system_instruction?.parts;
    if (!Array.isArray(parts) || parts.length !== 1 || typeof parts[0]?.text !== 'string' || parts[0].text.length > 4_000) {
      return json({ error: 'รูปแบบ system instruction ไม่ถูกต้อง' }, 400);
    }
    systemInstruction = { parts: [{ text: parts[0].text }] };
  }

  const generationConfig = input.generationConfig || {};
  const requestBody = {
    contents: input.contents,
    generationConfig: {
      temperature: Number.isFinite(generationConfig.temperature)
        ? Math.min(1, Math.max(0, generationConfig.temperature)) : 0.65,
      maxOutputTokens: Number.isFinite(generationConfig.maxOutputTokens)
        ? Math.min(2_000, Math.max(128, Math.floor(generationConfig.maxOutputTokens))) : 1_200,
    },
  };
  if (systemInstruction) requestBody.system_instruction = systemInstruction;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${input.model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': env.GEMINI_API_KEY,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      },
    );
    if (!upstream.ok) {
      const status = upstream.status === 429 ? 429 : 502;
      return json({ error: status === 429
        ? 'บริการ AI ใช้งานหนาแน่น กรุณารอสักครู่แล้วลองใหม่'
        : 'บริการ AI ขัดข้อง กรุณาลองใหม่ภายหลัง' }, status);
    }
    const data = await upstream.json();
    const candidate = data.candidates?.[0];
    if (!candidate?.content?.parts?.some((part) => typeof part.text === 'string')) {
      return json({ error: 'AI ไม่ได้ส่งข้อความกลับมา กรุณาลองปรับคำถาม' }, 502);
    }
    return json({ candidates: [candidate], modelVersion: data.modelVersion || input.model });
  } catch {
    return json({ error: 'เชื่อมต่อบริการ AI ไม่สำเร็จ กรุณาลองใหม่ภายหลัง' }, 502);
  } finally {
    clearTimeout(timeout);
  }
}

export function onRequest(context) {
  if (context.request.method !== 'POST') {
    return json({ error: 'รองรับเฉพาะ POST' }, 405);
  }
  return onRequestPost(context);
}
