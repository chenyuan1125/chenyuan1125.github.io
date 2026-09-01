# 大模型架构学习 · 系列追踪

> 每日一篇，从 2017 年 Transformer 出发，按时间线读到今天。
> 文章放 `content/cn/post/`，系列分类统一用 `大模型架构学习`。
> 分类只保留 `大模型架构学习` 一类；标签不要重复分类名，每篇一般 3-5 个。
> 写完记得跑 `hugo.exe` + `push.bat` 发布（线上域名 ethan-lily.cn）。

## 时间线主线（按论文发布时间）

| # | 日期 | 主题 | 文章 | 状态 |
|---|---|---|---|---|
| 01 | 2026-08-26 | Transformer（Attention Is All You Need, 2017）——注意力机制、多头、位置编码 | transformer-01 | ✅ 已发布 |
| 02 | 2026-08-27 | BERT（2018）——双向编码器、Masked LM、理解型模型的开端 | [bert-02](https://ethan-lily.cn/p/bert-02/) | ✅ 已发布 |
| 03 | 2026-08-28 | GPT-1/2（2018/2019）——生成式预训练、few-shot 萌芽 | [gpt-01](https://ethan-lily.cn/p/gpt-01/) | ✅ 已发布 |
| 04 | | GPT-3（2020）——in-context learning、few-shot 爆发 | | ⬜ |
| 05 | | T5 / BART（2019/2020）——Text-to-Text、encoder-decoder 统一 | | ⬜ |
| 06 | | GPT-3.5 / InstructGPT（2022）——RLHF、对齐技术起点 | | ⬜ |
| 07 | | Chinchilla（2022）——Scaling Laws、参数/数据配比 | | ⬜ |
| 08 | | LLaMA（2023）——开源生态、RoPE、GQA | | ⬜ |
| 09 | | MoE 系列：Switch Transformer / Mixtral——稀疏专家 | | ⬜ |
| 10 | | DeepSeek-V2 MLA / V3 MoE——高效注意力、大规模稀疏 | | ⬜ |
| 11 | | 线性注意力：RWKV / Mamba（SSM） | | ⬜ |
| 12 | 2025-09-01 | 推理模型：o1 / DeepSeek-R1——RL 与思维链 | [deepseek-r1-reasoning-rl](https://ethan-lily.cn/p/deepseek-r1%E7%94%A8%E5%BC%BA%E5%8C%96%E5%AD%A6%E4%B9%A0%E6%BF%80%E5%8F%91%E5%A4%A7%E6%A8%A1%E5%9E%8B%E6%8E%A8%E7%90%86%E8%83%BD%E5%8A%9B/) | ✅ 已发布 |
| 13 | | 多模态：CLIP / LLaVA / GPT-4V 架构 | | ⬜ |
| 14 | | 安全相关技术报告：红队、越狱防御、护栏（Anthropic/OpenAI） | | ⬜ |

> 表格只是主线建议，可按兴趣调整顺序。

## 写作要求（每篇自检）

- [ ] 自己的语言和思考，不用百科式定义开头
- [ ] 至少 1 张图：优先从论文中截图/引用论文原图（标注来源），或 LLM 生成，或 tldraw/SVG/HTML 绘制
- [ ] 封面图：4K 风景照优先（gen-cover.mjs 下载），LLM 生成/网图/风景照为备选
- [ ] 正文配图：架构图、流程图、示意图优先从论文中截图/引用论文原图，来源必须清楚
- [ ] 有自己的独到见解，不套固定模板
- [ ] 末尾附参考资料（原论文 + Anthropic/知名博客等）
- [ ] 已本地预览 + 构建 + push 发布 + 线上 200 验证

> 封面由当前模型直接生成 SVG 或基于论文图改编，不调用外部图像 API。

## 自动发布流程

1. 选择第一个未完成主题，创建文章与配图。
2. 资料只使用论文、官网文档、项目仓库或权威技术博客；不单独依赖模型记忆。
3. 执行 `node scripts/validate-article.mjs <slug> <YYYY-MM-DD>` 检查元数据、分类、标签、图片、结构和参考资料。
4. 执行 `scripts/run-daily-workflow.ps1 -Slug <slug>` 构建、发布并做线上 200 验证。
5. 只有第 4 步成功后，才把 `SERIES.md` 中的主题标记为已发布。
6. 失败时最多重试 2 次；仍失败则写入 `.daily-error.log`，并在 Codex 任务中汇报。



