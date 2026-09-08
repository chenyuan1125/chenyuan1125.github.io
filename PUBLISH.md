# 博客发布指南（myblog）

> 一图流：**new.bat 建文 → hugo server 预览 → push.bat 发布 → Vercel 自动上线**

## 日常三步

### 1. 新建文章

```bat
cd C:\Users\L\Desktop\Knowledge\blog2\myblog
new.bat my-post-slug 文章标题
```

- 第一个参数是 **英文 slug**（决定 URL：`/p/my-post-slug/`），建议全小写英文+连字符，不要用中文
- 第二个参数是文章标题（可省略，默认用 slug）
- 生成 `content\cn\post\<slug>\index.md`

### 2. 写作与本地预览

```bat
:: 编辑 content\cn\post\<slug>\index.md
:: 图片直接放进同目录，正文里写 ![说明](图片名.jpg)

..\hugo\hugo.exe server -D
:: 浏览器打开 http://localhost:1313
```

Front matter 模板（已自动生成）：

```yaml
---
title: "文章标题"
author: "chenyuan"
description: "摘要描述"
date: 2026-08-26
image: "封面图.jpg"        # 留空则用正文第一张图
tags: ["标签1"]
categories: ["分类"]
---
```

### 3. 构建并发布

```bat
:: 先正式构建（hugo server 的产物不进 public）
..\hugo\hugo.exe

:: 双击运行 push.bat（或命令行执行）
push.bat
```

`push.bat` 会把 `public/` 提交并推送到 `chenyuan1125/chenyuan1125.github.io`（master 分支）。Vercel 监听该仓库，推送后约 20 秒自动部署到 **https://ethan-lily.cn**。

## 架构说明

| 环节 | 内容 |
|---|---|
| 本地源码 | `blog2\myblog`（Hugo v0.134.3 extended + hugo-theme-stack） |
| Hugo 程序 | `blog2\hugo\hugo.exe` |
| 构建产物 | `myblog\public\`（这是一个独立 git 仓库！） |
| 部署仓库 | `git@github.com:chenyuan1125/chenyuan1125.github.io.git` master 分支 |
| 托管 | Vercel 项目 `blog`（Framework Preset: Other，静态直出，无构建） |
| 域名 | ethan-lily.cn（DNS 在 Cloudflare 托管，CNAME 指向 Vercel；chenyuan1125.top 因注册商 DNS 未配置暂不可用，曾绑定过已被移除） |
| 评论 | Waline（waline.chenyuan1125.top，Vercel 项目 waline-comment；注意其域名也未解析，如评论不可用需在 Cloudflare 补 DNS） |

⚠️ **重要**：
- `public/` 是独立 git 仓库（有自己的 `.git`），不要删除它，也不要把它提交进 myblog 主目录的 git
- `push.bat` 无需修改，直接用；如果换电脑需要重新执行「环境恢复」步骤（见下）
- 英文内容放在 `content\en\post\<slug>\index.md`，结构相同

## 常见问题

### push 推送失败 / rejected (fetch first)
远端有新提交。在 `public/` 目录执行：
```bash
git pull --rebase origin master   # 若网络差失败，可重试几次
# 或确认无冲突后强推（会覆盖远端）：git push -f origin master
```

### git fetch/clone 报 early EOF、connection reset
GitHub 大包传输在国内网络不稳定。重试即可；或给 git 配置代理：
```bash
git config --global http.proxy http://127.0.0.1:7890
```
（本机 SSH 走 `ssh.github.com:443` 已配置好，push 一般没问题，fetch 偶尔慢。）

### 网站打不开 / DNS 解析失败
1. 先看 Vercel 部署状态：`vercel ls blog`（Status 应为 ● Ready）
2. 本地验证域名解析是否被污染：换手机流量试试；或临时用 vercel.app 地址访问
3. 域名 DNS 在注册商处管理（zdnscloud），A 记录应指向 `76.76.21.21`，或 CNAME 到 `cname.vercel-dns.com`

### 新文章没出现在线上
- 检查 front matter 里有没有 `draft: true`（正式构建不会包含草稿）
- 检查 `date` 是否是未来时间（未来日期的文章不会发布）
- 确认文件路径：`content/cn/post/<slug>/index.md`（中文站点）

### 图片显示不了
- 图片必须和 `index.md` 同目录（leaf bundle 规范）
- 正文引用相对路径：`![img](photo.jpg)`，不要以 `/` 开头

## 环境恢复（换电脑时）

1. 安装 Hugo extended 0.134.x（或直接拷贝 `hugo/hugo.exe`）
2. 克隆源码仓库（如有）；主题已在 themes/ 下，无需 submodule
3. SSH key 配置 GitHub，并在 `~/.ssh/config` 加上：
   ```
   Host github.com
     HostName ssh.github.com
     User git
     Port 443
   ```
4. 重建 public 部署仓库：
   ```bash
   cd myblog/public && rm -rf .git
   git init -b master
   git remote add origin git@github.com:chenyuan1125/chenyuan1125.github.io.git
   hugo ..\hugo\hugo.exe   # 回到 myblog 构建
   cd public && git add -A && git commit -m init && git push -f origin master
   ```
5. CLI 工具：`npm i -g vercel` + `vercel login`；gh CLI 在 `C:\Users\L\tools\bin`（已加入用户 PATH）

## 工具速查

| 命令 | 用途 |
|---|---|
| `vercel whoami` | 查看 Vercel 登录账号 |
| `vercel ls blog` | 查看部署列表与状态 |
| `gh auth status` | 查看 GitHub 登录状态 |
| `node gen-cover.mjs "<描述>" <文章目录> [文件名]` | 生成封面/配图（优先 pi-image-gen skill，无 key 时自动降级 pollinations.ai 免费生成） |

## 图片生成（封面图）

每篇文章建议生成一张封面（front matter `image:` 引用），正文也可加插图：

```bash
cd myblog
node gen-cover.mjs "<描述>" content/cn/post/<slug>
:: 生成 content/cn/post/<slug>/cover.jpg，再把 front matter 的 image 改为 "cover.jpg"
```

### 画图模型在哪里配置？

配置在 pi 的全局设置文件：**`C:\Users\L\.pi\agent\settings.json`** 的 `pi-image-gen` 节点。

```json
{
  "pi-image-gen": {
    "defaultModel": "openrouter/openai/gpt-image-2",
    "providers": {
      "openrouter": { "apiKey": "sk-or-v1-..." }
    }
  }
}
```

两条生成路径：

| 路径 | 模型 | 条件 | 质量 |
|---|---|---|---|
| **skill 路径**（默认尝试） | `openrouter/openai/gpt-image-2`（可换 `google/gemini-2.5-flash-image` 更便宜） | OpenRouter 账户有余额 | 高 |
| **降级路径**（自动兜底） | pollinations.ai（sana 模型，免费） | 无 key、国内直连 | 中 |

当前状态：OpenRouter 余额为 0，所以走降级路径（pollinations）。要让 skill 路径生效，二选一：

1. **OpenRouter 充值**：在 openrouter.ai 充 ~$1（gpt-image-2 约 $0.01/张，gemini-2.5-flash-image 约 $0.001/张）
2. **换成阿里 DashScope key**（新用户有免费额度）：
   ```json
   { "pi-image-gen": {
       "defaultModel": "qwen-image-3.0",
       "providers": { "dashscope": { "apiKey": "sk-你的key" } }
   } }
   ```

改完设置在 pi 里运行 `/image-gen reload`（或重启会话）生效，用 `/image-gen list` 查看当前生效的模型。

### 正文配图规范

- **流程图一律用 tldraw 绘制**（不再用 mermaid），步骤：
  1. 编辑 `tools/spec-<name>.json`（nodes/arrows/texts 坐标布局）
  2. `python tools/tldr-gen.py tools/tldr-out/<name>.tldr tools/spec-<name>.json`
  3. `tldraw export tools/tldr-out/<name>.tldr -f png -o <文章目录> --scale 2 --padding 28`（tldraw-cli 已全局安装）
  4. 文中引用：`![说明](<name>.png)`
- 优先引用论文/优秀文章的原图（如 arXiv HTML 版的 Figures 目录），图片来源用脚注标注：`![说明](图.png)[^fig1]`，文末定义 `[^fig1]: 图片来源：...`
- 或同目录放图 + `![说明](图片名.jpg)` 引用
- 竖版长图会自动限高 560px 居中；点击可放大（photoswipe 已本地化，国内可用）
- tldraw 颜色注意：当前 schema 已移除 `light-yellow`/`light-orange`，用 `yellow`/`orange`
