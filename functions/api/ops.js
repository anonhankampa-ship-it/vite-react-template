const ALLOWED_ACTIONS = new Set(['vercel', 'render', 'ai-limit']);
const DEFAULT_VERCEL_PROJECT = 'my-it-works-present-web';
const DEFAULT_VERCEL_TEAM_SLUG = 'itmdcu';
const DEFAULT_RENDER_SERVICE_ID = 'srv-d9uia3lbedkc73a9maug';
const GOOGLE_MONITORING_SCOPE = 'https://www.googleapis.com/auth/monitoring.read';

const GEMINI_QUOTA_METRICS = [
  {
    name: 'คำขอต่อโมเดล (โควตาแบบชำระเงิน)',
    usage: 'generativelanguage.googleapis.com/quota/generate_requests_per_model/usage',
    limit: 'generativelanguage.googleapis.com/quota/generate_requests_per_model/limit',
  },
  {
    name: 'คำขอระดับฟรี',
    usage: 'generativelanguage.googleapis.com/quota/generate_content_free_tier_requests/usage',
    limit: 'generativelanguage.googleapis.com/quota/generate_content_free_tier_requests/limit',
  },
  {
    name: 'โทเคนขาเข้าระดับฟรี',
    usage: 'generativelanguage.googleapis.com/quota/generate_content_free_tier_input_token_count/usage',
    limit: 'generativelanguage.googleapis.com/quota/generate_content_free_tier_input_token_count/limit',
  },
  {
    name: 'โทเคนขาเข้าแบบชำระเงิน',
    usage: 'generativelanguage.googleapis.com/quota/generate_content_paid_tier_input_token_count/usage',
    limit: 'generativelanguage.googleapis.com/quota/generate_content_paid_tier_input_token_count/limit',
  },
];

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

function safeProviderError(response, provider) {
  if (response.status === 401 || response.status === 403) {
    return `${provider} ปฏิเสธการอ่านข้อมูล กรุณาตรวจสอบสิทธิ์ของ API key หรือบัญชีอ่านอย่างเดียว`;
  }
  if (response.status === 404) return `ไม่พบโครงการหรือบริการ ${provider} ที่กำหนด`;
  if (response.status === 429) return `${provider} จำกัดการเรียก API ชั่วคราว กรุณาลองใหม่ภายหลัง`;
  return `อ่านข้อมูล ${provider} ไม่สำเร็จ`;
}

async function fetchWithTimeout(url, options = {}, durationMs = 12_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), durationMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timeout);
  }
}

async function readVercel(env) {
  if (!env.VERCEL_READ_TOKEN) {
    return { error: 'ยังไม่ได้ตั้งค่า VERCEL_READ_TOKEN ใน Cloudflare Secrets', status: 503 };
  }
  const project = env.VERCEL_PROJECT_ID || DEFAULT_VERCEL_PROJECT;
  const teamSlug = env.VERCEL_TEAM_SLUG || DEFAULT_VERCEL_TEAM_SLUG;
  const url = new URL('https://api.vercel.com/v7/deployments');
  url.searchParams.set('projectId', project);
  url.searchParams.set('slug', teamSlug);
  url.searchParams.set('target', 'production');
  url.searchParams.set('limit', '5');

  try {
    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${env.VERCEL_READ_TOKEN}`, Accept: 'application/json' },
    });
    if (!response.ok) return { error: safeProviderError(response, 'Vercel'), status: response.status === 429 ? 429 : 502 };
    const payload = await response.json();
    const deployments = (payload.deployments || []).map((item) => ({
      id: item.uid,
      state: item.readyState || item.state || 'UNKNOWN',
      target: item.target || 'production',
      createdAt: item.createdAt ? new Date(Number(item.createdAt)).toISOString() : null,
      readyAt: item.ready ? new Date(Number(item.ready)).toISOString() : null,
      url: item.url ? `https://${item.url}` : null,
      branch: item.meta?.githubCommitRef || item.meta?.gitlabCommitRef || null,
      commit: item.meta?.githubCommitMessage || item.meta?.gitlabCommitMessage || null,
      errorCode: item.errorCode || null,
      errorMessage: item.errorMessage?.slice(0, 300) || null,
    }));
    return { data: { project, deployments }, status: 200 };
  } catch {
    return { error: 'เชื่อมต่อ Vercel API ไม่สำเร็จหรือหมดเวลา', status: 502 };
  }
}

async function readRender(env) {
  if (!env.RENDER_API_KEY) {
    return { error: 'ยังไม่ได้ตั้งค่า RENDER_API_KEY ใน Cloudflare Secrets', status: 503 };
  }
  const serviceId = env.RENDER_SERVICE_ID || DEFAULT_RENDER_SERVICE_ID;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(serviceId)) {
    return { error: 'รหัสบริการ Render ที่ตั้งค่าไม่ถูกต้อง', status: 400 };
  }
  const url = new URL(`https://api.render.com/v1/services/${encodeURIComponent(serviceId)}/deploys`);
  url.searchParams.set('limit', '5');

  try {
    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${env.RENDER_API_KEY}`, Accept: 'application/json' },
    });
    if (!response.ok) return { error: safeProviderError(response, 'Render'), status: response.status === 429 ? 429 : 502 };
    const payload = await response.json();
    const deploys = (Array.isArray(payload) ? payload : []).map((entry) => {
      const item = entry.deploy || entry;
      return {
        id: item.id || null,
        status: item.status || 'UNKNOWN',
        createdAt: item.createdAt || null,
        updatedAt: item.updatedAt || null,
        finishedAt: item.finishedAt || null,
        commit: item.commit?.id || null,
        commitMessage: item.commit?.message?.slice(0, 300) || null,
        trigger: item.trigger || null,
      };
    });
    return { data: { serviceId, deploys }, status: 200 };
  } catch {
    return { error: 'เชื่อมต่อ Render API ไม่สำเร็จหรือหมดเวลา', status: 502 };
  }
}

function base64UrlEncode(value) {
  const bytes = value instanceof Uint8Array ? value : new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function decodePrivateKey(pem) {
  const base64 = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function createGoogleAccessToken(serviceAccount) {
  if (!serviceAccount?.client_email || !serviceAccount?.private_key) {
    throw new Error('ข้อมูล service account ไม่ครบ');
  }
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64UrlEncode(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: GOOGLE_MONITORING_SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    decodePrivateKey(serviceAccount.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const assertion = `${unsigned}.${base64UrlEncode(new Uint8Array(signature))}`;
  const response = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!response.ok) throw new Error('แลก Google access token ไม่สำเร็จ');
  const token = await response.json();
  if (!token.access_token) throw new Error('Google ไม่ส่ง access token กลับมา');
  return token.access_token;
}

function numericValue(point) {
  const value = point?.value || {};
  const number = Number(value.int64Value ?? value.doubleValue ?? value.distributionValue?.count);
  return Number.isFinite(number) ? number : null;
}

function timeSeriesItems(payload) {
  return (payload.timeSeries || []).flatMap((series) => {
    const labels = series.metric?.labels || {};
    const resourceLabels = series.resource?.labels || {};
    const latest = series.points?.[0];
    const value = numericValue(latest);
    if (value === null) return [];
    return [{
      key: [labels.model || '', labels.limit_name || '', resourceLabels.location || ''].join('|'),
      model: labels.model || null,
      limitName: labels.limit_name || null,
      location: resourceLabels.location || null,
      value,
      measuredAt: latest.interval?.endTime || null,
    }];
  });
}

async function readGoogleMetric(accessToken, projectId, metricType) {
  const now = Date.now();
  const url = new URL(`https://monitoring.googleapis.com/v3/projects/${encodeURIComponent(projectId)}/timeSeries`);
  url.searchParams.set('filter', `metric.type = "${metricType}" AND resource.type = "generativelanguage.googleapis.com/Location"`);
  url.searchParams.set('interval.startTime', new Date(now - 5 * 60_000).toISOString());
  url.searchParams.set('interval.endTime', new Date(now).toISOString());
  url.searchParams.set('view', 'FULL');
  url.searchParams.set('pageSize', '100');
  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(response.status === 403
    ? 'Google Cloud ปฏิเสธสิทธิ์อ่าน Cloud Monitoring'
    : 'อ่าน Gemini quota metrics ไม่สำเร็จ');
  return timeSeriesItems(await response.json());
}

async function readAiLimit(env) {
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return { error: 'ยังไม่ได้ตั้งค่า GOOGLE_SERVICE_ACCOUNT_JSON ใน Cloudflare Secrets', status: 503 };
  }
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } catch {
    return { error: 'ค่า GOOGLE_SERVICE_ACCOUNT_JSON ไม่ใช่ JSON ที่ถูกต้อง', status: 503 };
  }
  const projectId = env.GOOGLE_CLOUD_PROJECT_ID || serviceAccount.project_id;
  if (!projectId || !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId)) {
    return { error: 'กรุณาตั้ง GOOGLE_CLOUD_PROJECT_ID เป็นรหัสโปรเจกต์ Google Cloud ที่ใช้ Gemini API', status: 503 };
  }

  try {
    const accessToken = await createGoogleAccessToken(serviceAccount);
    const metrics = await Promise.all(GEMINI_QUOTA_METRICS.map(async (metric) => {
      const [usage, limit] = await Promise.all([
        readGoogleMetric(accessToken, projectId, metric.usage),
        readGoogleMetric(accessToken, projectId, metric.limit),
      ]);
      const limitByKey = new Map(limit.map((item) => [item.key, item]));
      return {
        name: metric.name,
        samples: usage.map((sample) => {
          const quota = limitByKey.get(sample.key);
          return {
            model: sample.model,
            limitName: sample.limitName,
            location: sample.location,
            recentUsage: sample.value,
            quotaLimit: quota?.value ?? null,
            usagePercent: quota?.value > 0 ? Math.round((sample.value / quota.value) * 1000) / 10 : null,
            measuredAt: sample.measuredAt,
          };
        }),
      };
    }));
    return { data: { projectId, metrics, note: 'Google Cloud Monitoring อาจหน่วงข้อมูลประมาณ 150 วินาที' }, status: 200 };
  } catch (error) {
    return { error: error.message || 'อ่าน AI Limit ไม่สำเร็จ', status: 502 };
  }
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) {
    return json({ error: 'คำขอมาจากเว็บไซต์ที่ไม่ได้รับอนุญาต' }, 403);
  }
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    return json({ error: 'ต้องส่งข้อมูลแบบ JSON' }, 415);
  }
  const declaredLength = Number(request.headers.get('Content-Length') || 0);
  if (declaredLength > 1024) return json({ error: 'คำขอมีขนาดใหญ่เกินไป' }, 413);

  let input;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 1024) return json({ error: 'คำขอมีขนาดใหญ่เกินไป' }, 413);
    input = JSON.parse(raw);
  } catch {
    return json({ error: 'ข้อมูล JSON ไม่ถูกต้อง' }, 400);
  }
  if (!ALLOWED_ACTIONS.has(input?.action)) {
    return json({ error: 'รองรับเฉพาะการอ่านสถานะ Vercel, Render และ AI Limit' }, 400);
  }

  const result = input.action === 'vercel'
    ? await readVercel(env)
    : input.action === 'render'
      ? await readRender(env)
      : await readAiLimit(env);
  if (result.error) return json({ error: result.error, readOnly: true }, result.status || 502);
  return json({ provider: input.action, readOnly: true, fetchedAt: new Date().toISOString(), data: result.data });
}

export function onRequest(context) {
  if (context.request.method !== 'POST') return json({ error: 'รองรับเฉพาะ POST' }, 405);
  return onRequestPost(context);
}
