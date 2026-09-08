// 封面生成脚本：node gen-cover.mjs "<prompt>" <输出目录> [文件名]
// 路径1：已配置的 pi-image-gen provider API（例如 OpenRouter image model）
// 路径2：从 picsum.photos 下载风景照（基于 prompt 的 seed）
// 路径3：确定性 SVG 封面兜底
// 输出: 打印 SAVED:<绝对路径>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const [prompt, outDir, filename] = process.argv.slice(2);
const cwd = process.cwd();
if (!prompt || !outDir) {
  console.error('用法: node gen-cover.mjs "<prompt>" <输出目录> [文件名]');
  process.exit(1);
}
const baseName = filename ?? 'cover';
mkdirSync(join(cwd, outDir), { recursive: true });

async function viaLandscapeFallback() {
  // 从 picsum.photos 下载风景照
  const seed = encodeURIComponent(prompt.replace(/[^\w\u4e00-\u9fff]/g, '-').slice(0, 50));
  const url = `https://picsum.photos/seed/${seed}/1200/630`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`picsum HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const ext = bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ? 'jpg' :
    bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) ? 'png' : 'jpg';
  const out = join(cwd, outDir, `${baseName}.${ext}`);
  writeFileSync(out, bytes);
  return out;
}

async function viaDeterministicSvg() {
  const escaped = prompt
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="0 0 1536 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b1220"/>
      <stop offset="1" stop-color="#123b52"/>
    </linearGradient>
  </defs>
  <rect width="1536" height="1024" fill="url(#bg)"/>
  <g fill="none" stroke="#67e8f9" stroke-opacity=".35" stroke-width="3">
    <circle cx="430" cy="512" r="180"/>
    <circle cx="1106" cy="512" r="180"/>
    <path d="M610 512H926"/>
    <path d="M430 332v360"/>
    <path d="M1106 332v360"/>
  </g>
  <rect x="70" y="842" width="1396" height="94" rx="18" fill="#0f172a" fill-opacity=".72"/>
  <text x="100" y="905" fill="#e2e8f0" font-family="Segoe UI, Microsoft YaHei, sans-serif" font-size="46">大模型架构学习 · ${escaped}</text>
</svg>`;
  const out = join(cwd, outDir, `${baseName}.svg`);
  writeFileSync(out, svg, 'utf8');
  return out;
}

async function viaConfiguredApi() {
  const settingsPath = join(homedir(), '.pi', 'agent', 'settings.json');
  if (!existsSync(settingsPath)) throw new Error('pi-image-gen settings not found');
  const settings = JSON.parse(readFileSync(settingsPath, 'utf8'))['pi-image-gen'];
  const model = settings?.defaultModel;
  if (!model || !model.startsWith('openrouter/')) {
    throw new Error('no configured OpenRouter image model');
  }
  const apiKey = settings.providers?.openrouter?.apiKey || process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OpenRouter API key not configured');

  const response = await fetch('https://openrouter.ai/api/v1/images', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: model.slice('openrouter/'.length),
      prompt,
      n: 1,
      size: '1536x1024',
      quality: 'high',
    }),
  });
  if (!response.ok) throw new Error(`OpenRouter HTTP ${response.status}`);
  const payload = (await response.json()).data?.[0];
  let bytes;
  if (payload?.b64_json) {
    bytes = Buffer.from(payload.b64_json, 'base64');
  } else if (payload?.url) {
    bytes = Buffer.from(await (await fetch(payload.url)).arrayBuffer());
  } else {
    throw new Error('image API returned no image');
  }
  const ext = bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    ? 'png'
    : bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
      ? 'jpg'
      : 'png';
  const out = join(cwd, outDir, `${baseName}.${ext}`);
  writeFileSync(out, bytes);
  return out;
}

async function main() {
  // 尝试顺序：API → picsum 风景照 → SVG
  for (const fn of [viaConfiguredApi, viaLandscapeFallback, viaDeterministicSvg]) {
    try {
      const image = await fn();
      console.log('SAVED:' + image);
      return;
    } catch (error) {
      console.error(`[gen-cover] ${fn.name}: ${error.message}`);
    }
  }
  process.exit(1);
}

await main();
