---
title: "T5 / BART：把一切 NLP 任务统一成 Text-to-Text"
author: "chenyuan"
description: "T5 用一个统一的 text-to-text 框架吞下所有 NLP 任务，BART 用去噪自编码器把 BERT 的双向理解与 GPT 的生成能力拼在一起——Encoder-Decoder 路线的巅峰。"
date: 2026-09-05
slug: "t5-bart"
image: "cover.jpg"
tags: ["T5", "BART", "Encoder-Decoder", "预训练"]
categories: ["大模型架构学习"]
---

## 引子：BERT 和 GPT 各自的缺口

2018-2019 年，NLP 被两条路线割裂：

- **BERT（Encoder-only）**：双向理解强，但不能生成
- **GPT（Decoder-only）**：生成强，但单向注意力让理解任务吃亏

有没有一种架构能同时要？答案是 **Encoder-Decoder**——Transformer 原版就是它，只是被 BERT 和 GPT 各拆走了一半。

2019 年 Google 的 T5 和 Facebook 的 BART 给出了两种不同但互补的答案。

## T5：一切皆 Text-to-Text

T5（Text-to-Text Transfer Transformer）的核心主张激进到近乎粗暴：**把所有 NLP 任务都改写成"输入文本 → 输出文本"**。

| 任务 | 输入 | 输出 |
|---|---|---|
| 翻译 | `translate English to German: That is good.` | `Das ist gut.` |
| 分类 | `sst2 sentence: This movie is great.` | `positive` |
| 相似度 | `stsb sentence1: ... sentence2: ...` | `3.8` |
| 摘要 | `summarize: <长文>` | `<摘要>` |

模型不需要任何任务特定的输出层——分类任务输出 "positive" 这个 token 序列，回归任务输出 "3.8" 这个数字字符串。**统一的不是架构，是接口**。

### 相对位置编码

T5 用简化的相对位置编码（relative position bias）：每个注意力头学习一组标量偏置，按 query-key 相对距离查表加到注意力分数上。相比绝对位置编码，它更容易外推到训练时没见过的长度。

### 预训练任务：Span Corruption

T5 不用 BERT 的单 token 遮蔽，而是**遮蔽连续片段**：

```
原文:  The quick brown fox jumps over the lazy dog
遮蔽:  The <X> fox jumps <Y> dog
目标:  <X> quick brown <Y> over the lazy
```

每个片段用一个 sentinel token（`<X>`、`<Y>`）替换，模型需要输出所有被遮蔽的片段。平均片段长度 3，遮蔽 15%。

这比单 token 遮蔽更难，也更接近生成任务。

### C4 数据集

T5 专门构建了 **C4**（Colossal Clean Crawled Corpus，750GB）——从 Common Crawl 清洗出的英文文本。清洗规则包括：只保留以标点结尾的行、去除重复行、过滤脏词页面等。

### 训练规模

| 模型 | 参数量 | 层数 | d_model |
|---|---|---|---|
| T5-Small | 60M | 6/6 | 512 |
| T5-Base | 220M | 12/12 | 768 |
| T5-Large | 770M | 24/24 | 1024 |
| T5-3B | 3B | 24/24 | 1024 |
| T5-11B | 11B | 24/24 | 1024 |

T5 论文最有价值的贡献之一是**系统性的消融实验**：他们比较了 encoder-decoder vs decoder-only、去噪目标 vs 语言模型目标、C4 vs 其他数据集、预训练数据量等。结论是 encoder-decoder + span corruption 在相同计算预算下最优。

## BART：去噪自编码器

BART（Bidirectional and Auto-Regressive Transformer）的思路不同：**先用任意噪声破坏文本，再让模型重建原文**。

它的结构就是完整的 Transformer encoder-decoder：
- Encoder 用双向注意力（像 BERT）
- Decoder 用因果注意力（像 GPT），并且对 encoder 输出做交叉注意力

### 五种加噪方式

BART 论文测试了多种噪声，其中效果最好的组合是：

1. **Token Masking**：随机遮蔽 token（同 BERT）
2. **Token Deletion**：随机删除 token，模型必须推断位置和内容
3. **Text Infilling**：遮蔽连续片段，用单个 mask 替换（同 SpanBERT）
4. **Sentence Permutation**：打乱句子顺序
5. **Document Rotation**：随机旋转文档，让模型找到真正的起点

最终配置用 **text infilling + sentence permutation**：遮蔽 30% 的 token（片段长度服从泊松分布 λ=3），并把句子打乱。

{{< figure src="pipeline.svg" title="图 1：T5 的 span corruption vs BART 的去噪重建" >}}

### 为什么 BART 适合生成

BART 的 decoder 是自回归的，所以它天生能做摘要、翻译、对话。而 encoder 是双向的，所以它能充分理解输入。这种组合在摘要任务上特别强——BART 在 XSum 上比 T5 更好。

## T5 vs BART 对比

| 维度 | T5 | BART |
|---|---|---|
| 架构 | Encoder-Decoder | Encoder-Decoder |
| 预训练目标 | Span corruption（预测被遮蔽片段） | 去噪重建（重建整个原文） |
| 加噪方式 | 连续片段替换为 sentinel | Text infilling + 句子打乱 |
| 优势任务 | 分类、翻译、多任务统一 | 摘要、生成 |
| 位置编码 | 相对位置偏置 | 绝对位置编码（学习） |
| 参数量 | 60M - 11B | 140M - 400M |

**核心差异**：T5 只预测被破坏的部分，BART 重建整个序列。前者更高效，后者对生成任务更友好。

## Encoder-Decoder 的兴衰

2020 年后，Decoder-only 逐渐成为主流（GPT-3、LLaMA、DeepSeek 都是 Decoder-only）。为什么？

1. **规模效率**：Decoder-only 没有 encoder-decoder 之间的通信开销，同样参数量下更"深"
2. **训练简单**：只需一个语言模型目标，不需要设计噪声策略
3. **通用性**：in-context learning 让"理解"任务也能用生成范式解决

但 Encoder-Decoder 没有消失：T5 依然是很多 RAG、翻译、摘要系统的底座，Flan-T5 至今是开源小模型的重要选择。

## 技术启示

1. **接口统一 > 架构统一**：T5 的 text-to-text 证明了"统一接口"的价值，这个思想后来被 instruction tuning 继承
2. **去噪目标的设计空间很大**：T5 的 span corruption 和 BART 的 text infilling 都是去噪，但细节决定任务适配性
3. **消融实验比架构创新更稀缺**：T5 论文最有价值的是那张消融表，不是模型本身

## 参考资料

- Raffel, C., et al. (2019). *Exploring the Limits of Transfer Learning with a Unified Text-to-Text Transformer*. arXiv:1910.10683.
- Lewis, M., et al. (2019). *BART: Denoising Sequence-to-Sequence Pre-training for Natural Language Generation, Translation, and Comprehension*. arXiv:1910.13461.
- Hugging Face T5 文档：https://huggingface.co/docs/transformers/model_doc/t5