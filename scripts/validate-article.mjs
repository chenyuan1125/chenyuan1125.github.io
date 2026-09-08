#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const slug = process.argv[2];
const expectedDate = process.argv[3];

function fail(message) {
  console.error(`[validate] ${message}`);
  process.exit(1);
}

if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
  fail('slug is required and must use lowercase letters, numbers, and hyphens');
}

const postDir = join(root, 'content', 'cn', 'post', slug);
const postPath = join(postDir, 'index.md');
if (!existsSync(postPath)) fail(`missing post: ${postPath}`);

const raw = readFileSync(postPath, 'utf8');
const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
if (!match) fail('front matter block is missing');

const [, frontMatter, body] = match;
if (/^draft\s*:\s*true\s*$/m.test(frontMatter)) fail('draft must not be true');

function scalar(name) {
  const value = frontMatter.match(new RegExp(`^${name}\\s*:\\s*["']?(.*?)["']?\\s*$`, 'm'));
  return value ? value[1].trim() : '';
}

function arrayValue(name) {
  const multilineInline = frontMatter.match(new RegExp(`^${name}\\s*:\\s*\\[([\\s\\S]*?)\\]`, 'm'));
  if (multilineInline) {
    return multilineInline[1]
      .split(/[\r\n,]+/)
      .map(item => item.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }
  const inline = frontMatter.match(new RegExp(`^${name}\\s*:\\s*\\[(.*?)\\]\\s*$`, 'm'));
  if (inline) {
    return inline[1]
      .split(',')
      .map(item => item.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }
  const block = frontMatter.match(new RegExp(`^${name}\\s*:\\s*\\r?\\n((?:\\s*-\\s*.*\\r?\\n?)*)`, 'm'));
  if (block) {
    return block[1]
      .split(/\r?\n/)
      .map(line => line.replace(/^\s*-\s*/, '').trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }
  return [];
}

const title = scalar('title');
const description = scalar('description');
const date = scalar('date');
const image = scalar('image');
const tags = arrayValue('tags');
const categories = arrayValue('categories');
const expectedCategory = '大模型架构学习';

if (!title) fail('title is required');
if (description.length < 20 || description.length > 200) {
  fail(`description must be 20-200 characters (got ${description.length})`);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('date must use YYYY-MM-DD');
if (expectedDate && date !== expectedDate) fail(`date must be ${expectedDate}`);
if (!image) fail('image is required');
if (isAbsolute(image) || image.includes('..')) fail('image must be a page-relative path');
if (!existsSync(join(postDir, image))) fail(`cover image does not exist: ${image}`);

if (categories.length !== 1 || categories[0] !== expectedCategory) {
  fail(`categories must be exactly ["${expectedCategory}"]`);
}
if (tags.length < 3 || tags.length > 5) fail(`tags must contain 3-5 items (got ${tags.length})`);
if (new Set(tags).size !== tags.length) fail('tags must not contain duplicates');
if (tags.includes(expectedCategory)) fail('tags must not repeat the category');

const withoutCode = body.replace(/```[\s\S]*?```/g, '');
const visibleText = withoutCode
  .replace(/\{\{<[^>]+>\}\}/g, ' ')
  .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
  .replace(/\[([^\]]*)\]\([^)]+\)/g, '$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/https?:\/\/\S+/g, ' ');
const cjk = (visibleText.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
const latinWords = (visibleText.match(/[A-Za-z][A-Za-z0-9+.#-]*/g) || []).length;
const wordCount = cjk + latinWords;
if (wordCount < 1200) fail(`body is too short: ${wordCount} words (minimum 1200)`);
if (wordCount > 4500) fail(`body is too long: ${wordCount} words (maximum 4500)`);

if (!/^##\s+/m.test(body)) fail('body must use level-two section headings');
if (!/^##\s*(护栏视角|护栏)\s*$/m.test(body)) fail('body must include a guardrail section');
if (!/^##\s*参考资料\s*$/m.test(body)) fail('body must include a references section');

const externalLinks = body.match(/https?:\/\/[^\s)>"]+/g) || [];
if (externalLinks.length < 2) fail('body must include at least two reference links');

const imageRefs = [
  ...Array.from(body.matchAll(/(?:src=|!\[[^\]]*\]\()["']?([^"')\s]+)/g)),
].map(item => item[1]).filter(src => src && !/^https?:\/\//i.test(src));
const figureCount = (body.match(/\{\{<\s*figure\b/g) || []).length +
  (body.match(/!\[[^\]]*\]\(/g) || []).length;
if (figureCount < 2) fail('body must include a cover and at least one diagram/illustration');

for (const ref of imageRefs) {
  if (!existsSync(join(postDir, decodeURIComponent(ref)))) {
    fail(`referenced image does not exist: ${ref}`);
  }
}

console.log(`[validate] ${slug}: OK (${wordCount} words, ${tags.length} tags, ${figureCount} image references)`);
