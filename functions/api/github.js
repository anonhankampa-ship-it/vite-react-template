const REPOSITORY = 'anonhankampa-ship-it/My-IT-Works-Present';
const ALLOWED_ACTIONS = new Set(['repo', 'commits', 'releases']);
const API_VERSION = '2022-11-28';

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

export async function onRequestPost({ request }) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) {
    return json({ error: 'คำขอมาจากเว็บไซต์ที่ไม่ได้รับอนุญาต' }, 403);
  }
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    return json({ error: 'ต้องส่งข้อมูลแบบ JSON' }, 415);
  }

  let input;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 1024) return json({ error: 'คำขอมีขนาดใหญ่เกินไป' }, 413);
    input = JSON.parse(raw);
  } catch {
    return json({ error: 'ข้อมูล JSON ไม่ถูกต้อง' }, 400);
  }
  if (!ALLOWED_ACTIONS.has(input?.action)) return json({ error: 'ไม่รองรับการอ่านข้อมูล GitHub ประเภทนี้' }, 400);

  const suffix = input.action === 'repo' ? '' : `/${input.action}?per_page=${input.action === 'commits' ? 5 : 3}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`https://api.github.com/repos/${REPOSITORY}${suffix}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': API_VERSION,
        'User-Agent': 'MY-IT-WORKs-Smart-Launcher',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      const status = response.status === 404 ? 404 : response.status === 403 || response.status === 429 ? 429 : 502;
      return json({ error: status === 404
        ? 'อ่าน repository ไม่ได้ อาจเป็น private หรือไม่พบ repo'
        : status === 429 ? 'GitHub จำกัดการอ่านชั่วคราว กรุณาลองใหม่ภายหลัง'
          : 'อ่านข้อมูล GitHub ไม่สำเร็จ' }, status);
    }
    const data = await response.json();
    let result;
    if (input.action === 'repo') {
      result = {
        name: data.full_name,
        description: data.description,
        url: data.html_url,
        defaultBranch: data.default_branch,
        updatedAt: data.updated_at,
        pushedAt: data.pushed_at,
        openIssues: data.open_issues_count,
        stars: data.stargazers_count,
        visibility: data.visibility,
      };
    } else if (input.action === 'commits') {
      result = data.map((item) => ({
        sha: item.sha?.slice(0, 8),
        message: item.commit?.message?.slice(0, 240),
        date: item.commit?.author?.date,
        url: item.html_url,
      }));
    } else {
      result = data.map((item) => ({
        tag: item.tag_name,
        name: item.name,
        publishedAt: item.published_at,
        prerelease: item.prerelease,
        url: item.html_url,
      }));
    }
    return json({ repository: REPOSITORY, action: input.action, data: result, readOnly: true });
  } catch {
    return json({ error: 'เชื่อมต่อ GitHub ไม่สำเร็จ' }, 502);
  } finally {
    clearTimeout(timeout);
  }
}

export function onRequest(context) {
  if (context.request.method !== 'POST') return json({ error: 'รองรับเฉพาะ POST' }, 405);
  return onRequestPost(context);
}
