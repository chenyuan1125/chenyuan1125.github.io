---
title: "GPT-3：In-Context Learning 与 Few-Shot 爆发"
author: "chenyuan"
description: "GPT-3 用 1750 亿参数证明了规模就是能力：不微调、不更新参数，仅凭几个示例就能击败当时最先进的微调模型，彻底改变了 NLP 的范式。"
date: 2026-09-02
slug: gpt-03
image: "cover.jpg"
tags: ["GPT-3", "In-Context Learning", "Few-Shot", "Scaling Law", "大语言模型"]
categories: ["大模型架构学习"]
---

## 引言：GPT-2 的未竟之问

GPT-2（2019）展示了两个令人震惊的发现：

1. **零样本能力**——模型没经过任何微调，就能做翻译、问答、摘要
2. **规模无饱和**——从 124M 到 1.5B，模型越大零样本能力越强，曲线毫无放缓迹象

但 GPT-2 的发现也留下了一个尖锐的问题：**如果继续放大 100 倍会怎样？** GPT-2 XL（1.5B）的零样本 CoQA 评分是 55 F1，而当时 SOTA 微调模型是 90.7 F1——差距依然巨大。零样本能力虽然惊艳，但离实用还差得远。

OpenAI 的回答很简单：**继续放大，直到看到天花板为止。**

2020 年 5 月，他们发布了 GPT-3，一个 1750 亿参数的自回归语言模型，比当时任何非稀疏模型大 10 倍以上。这篇论文《Language Models are Few-Shot Learners》不仅刷新了规模记录，更催生了一个全新的概念——**In-Context Learning（上下文学习）**。

## 核心架构：GPT-2 的直系继承者

### 架构概览

GPT-3 的架构几乎原封不动地沿用了 GPT-2：

> "We use the same model and architecture as GPT-2, including the modified initialization, pre-normalization, and reversible tokenization described therein."

关键参数：

| 参数 | GPT-2 XL | GPT-3 175B | 变化 |
|---|---|---|---|
| 层数（n_layers） | 48 | 96 | 2× |
| 隐藏维度（d_model） | 1600 | 12288 | 7.68× |
| 注意力头数（n_heads） | 25 | 96 | 3.84× |
| 每头维度（d_head） | 64 | 128 | 2× |
| 前馈网络维度（d_ff） | 6400 | 49152 | 7.68× |
| 上下文窗口（n_ctx） | 1024 | 2048 | 2× |
| 参数量 | 1.5B | 175B | ~117× |

### 唯一架构改动：交替稀疏注意力

GPT-3 在注意力机制上做了一个重要改动：**交替使用密集注意力和局部带状稀疏注意力**（alternating dense and locally banded sparse attention patterns），类似于 Sparse Transformer。

具体来说，在 96 层中，每隔一层使用稀疏注意力：

```
密集层（第 0、2、4...层）：标准全局注意力，每个 token 可以看到所有之前的 token
稀疏层（第 1、3、5...层）：局部带状注意力，每个 token 只能看到附近固定窗口内的 token
```

这个设计的动机很直接——**降低计算复杂度**。标准自注意力的复杂度是 O(n²·d)，当 n=2048 时，96 层全部使用密集注意力，计算量巨大。稀疏注意力将复杂度降到 O(n·k·d)，其中 k 是局部窗口大小。

直觉上，这相当于让模型一部分层做"全局理解"，另一部分层做"局部精修"。后来 LLaMA 等模型放弃了这种设计，改用全密集注意力，因为现代 GPU 硬件对密集矩阵乘法的优化比稀疏模式更高效。

### 训练配置

GPT-3 175B 的训练配置：

| 超参数 | 值 |
|---|---|
| 总训练 token 数 | 3000 亿 |
| Batch size | 320 万个 token（约 1562 个序列） |
| 学习率 | 6×10⁻⁵（余弦衰减） |
| 优化器 | Adam（β₁=0.9, β₂=0.95, ε=10⁻⁸） |
| 梯度裁剪 | 1.0 |
| 权重衰减 | 0.1 |
| Warmup 步数 | 375M token（约 1200 步） |
| 硬件 | 约 10,000 张 NVIDIA V100 GPU |
| 训练时长 | 约 92 天 |
| 估算成本 | 约 1200 万美元（仅最终训练） |

### 模型并行策略

GPT-3 175B 需要约 700GB 显存（FP32 下每个参数 4 字节），远超当时任何单张 GPU 的容量（V100 仅 32GB）。OpenAI 使用了**混合模型并行**策略：

1. **算子内并行**（Intra-operator）：将单个矩阵乘法拆分到多个 GPU 上
2. **层间并行**（Inter-operator）：将不同层分配到不同 GPU，组成流水线

这种"沿深度和宽度两个维度分割"的策略，使得模型可以在 10,000 张 V100 上高效分布。

## 训练数据：质量优先的混合策略

### 数据来源

GPT-3 的训练数据来自五个来源，经过精心筛选和去重：

| 数据集 | 原始大小 | 过滤后大小 | 训练采样比例 | 训练 epoch 数 |
|---|---|---|---|---|
| CommonCrawl（2016-2019） | 45TB | 570GB（~4000 亿 token） | 60% | <1 |
| WebText2（扩展版） | — | 19GB | 22% | ~2.5 |
| Books1 | — | 14GB | 8% | ~2.5 |
| Books2 | — | 55GB | 8% | <1 |
| Wikipedia（英文） | — | 3GB | 3% | ~3 |

### 关键设计：过采样高质量数据

注意一个反直觉的设计：**CommonCrawl 和 Books2 在整个训练过程中被采样不到一次（<1 epoch），而 Wikipedia 被采样了 3 次。** 这意味着模型会"看到"某些高质量数据多次，而低质量数据只看一次。

这本质上是有意接受少量过拟合，换取训练数据质量的提升。论文中的原话是：

> "This essentially accepts a small amount of overfitting in exchange for higher quality training data."

### 数据过滤流程

CommonCrawl 的过滤流程：

1. **基于质量过滤**：以 WebText、Wikipedia、Books 等高质语料为参考，用分类器筛选相似度高的网页
2. **模糊去重**：在文档级别做模糊去重，防止训练集和验证集之间的数据泄露
3. **混合高质语料**：加入 WebText2、Books1/2、Wikipedia 等精选数据集

## In-Context Learning：新范式的诞生

### 从 Fine-Tuning 到 In-Context Learning

在 GPT-3 之前，NLP 任务的范式是：

1. **预训练**：在大规模无标注语料上训练语言模型
2. **微调**：在每个下游任务上，用数千条标注数据更新模型参数

GPT-3 提出了一个截然不同的范式——**In-Context Learning（上下文学习）**：

> 不需要微调，不需要更新参数，只需要在推理时把几个示例拼在输入前面，模型就能自动学会做这个任务。

论文定义了三种上下文学习设置：

```
零样本（Zero-Shot）：
  "Translate English to French: cheese →"

一样本（One-Shot）：
  "Translate English to French:
   sea otter → loutre de mer
   cheese →"

少样本（Few-Shot）：
  "Translate English to French:
   sea otter → loutre de mer
   peppermint → menthe poivrée
   plush girafe → girafe peluche
   cheese →"
```

关键的是，**模型不更新任何参数**。Few-Shot 只是把 K 个示例（通常 10-100 个，受限于 2048 的上下文窗口）拼在输入中，模型通过"预测下一个词"的机制自动完成新任务。

### 为什么 In-Context Learning 可行？

论文提出了一个重要的概念框架——**元学习（Meta-Learning）**：

> "Language models can also be understood as meta-learners where slow outer-loop gradient descent based learning is combined with fast 'in-context' learning implemented within the context activations of the model."

这个框架包含两个循环：

- **外循环（慢）**：预训练阶段，通过梯度下降逐步学习语言知识、模式识别能力
- **内循环（快）**：推理阶段，通过上下文中的示例，在 forward pass 内完成"学习"

后来的研究（Dai et al., 2023）进一步揭示了数学机制：**Transformer 注意力与梯度下降之间存在对偶形式**。简单来说，注意力机制中的 key-value 查找可以看作是对模型隐式参数的"梯度更新"，而上下文中的示例提供了这些"梯度"的方向。

{{< figure src="icl-mechanism.svg" title="图 1：In-Context Learning 机制——Meta-Learning 框架下外循环（预训练梯度下降）与内循环（推理阶段 Forward Pass）的协作关系" >}}

### Scale 的关键作用

GPT-3 最重要的发现之一是：**In-Context Learning 能力随模型规模急剧提升。**

从论文的 Figure 1.3 可以看出：

- **零样本性能**：随模型规模稳步提升（线性）
- **Few-Shot 性能**：随模型规模**急剧提升**（超线性）

这意味着：**更大的模型不仅是"更聪明"的语言模型，更是"更擅长从示例中学习"的元学习器。** 这个发现直接催生了后来所有大模型的 Prompt Engineering 范式。

## 效果数据：定量的跨越

### 语言建模

| 基准 | 之前 SOTA | GPT-3 Zero-Shot | 提升 |
|---|---|---|---|
| PTB 困惑度 | — | 20.5 | 领先 15 个点 |
| LAMBADA 准确率 | 76.0% | 86.4% | +10.4% |

### 闭卷问答

| 基准 | 微调 SOTA | GPT-3 Zero-Shot | GPT-3 One-Shot | GPT-3 Few-Shot |
|---|---|---|---|---|
| TriviaQA | 68.0（RAG, 开放域） | 64.3 | 68.0 | **71.2** |
| WebQuestions | 44.7（T5-11B+SSM） | 14.4 | 25.3 | 41.5 |
| Natural Questions | 36.6（T5-11B+SSM） | 14.6 | 23.0 | 29.9 |

在 TriviaQA 上，GPT-3 **零样本**就已经超过微调后的 T5-11B 14.2%，Few-Shot 更进一步达到 71.2%，超过当时所有微调模型（包括使用检索增强的 RAG）。

### 阅读理解

| 基准 | 微调 SOTA | GPT-3 Zero-Shot | GPT-3 One-Shot | GPT-3 Few-Shot |
|---|---|---|---|---|
| CoQA (F1) | 90.7 | 81.5 | 84.0 | 85.0 |
| DROP (F1) | 89.1 | 23.6 | 34.3 | 36.5 |

CoQA 上 Few-Shot 仅差 SOTA 5.7 个点，而 DROP（需要离散推理和数值计算）差距较大——这暴露了纯语言模型在"数学推理"上的根本弱点。

### 常识推理

| 基准 | 微调 SOTA | GPT-3 Zero-Shot | GPT-3 Few-Shot |
|---|---|---|---|
| ARC-Easy | 92.0 | 68.8 | 70.1 |
| ARC-Challenge | 78.5 | 51.4 | 51.5 |
| HellaSwag | 91.8 | 76.2 | 86.4 |

### SuperGLUE

| 任务 | 微调 SOTA | 微调 BERT-Large | GPT-3 Few-Shot |
|---|---|---|---|
| BoolQ | 91.0 | 77.4 | 71.8 |
| CB (F1) | 96.9 | 83.6 | 75.6 |
| COPA | 94.8 | 70.6 | 92.0 |
| RTE | 92.5 | 71.7 | 69.0 |
| WiC | 76.1 | 69.6 | 49.4 |
| WSC | 93.8 | 64.6 | 80.1 |
| MultiRC | 88.2 | 70.0 | 75.4 |
| ReCoRD (F1) | 93.3 | 72.0 | 91.1 |

GPT-3 在 COPA 和 ReCoRD 上接近 SOTA，在 WSC 和 MultiRC 上超越 BERT-Large。但 WiC 上只有随机水平——**涉及句子间比较的任务是 GPT-3 的明显弱项**。

### 机器翻译

| 方向 | 有监督 SOTA | 无监督 SOTA | GPT-3 Few-Shot |
|---|---|---|---|
| 英→法 | 45.6 | 33.4 | 32.6 |
| 法→英 | 35.0 | 34.9 | 39.2 |
| 英→德 | 41.2 | 28.3 | 29.7 |
| 德→英 | 40.2 | 34.3 | 40.6 |
| 英→罗 | 38.5 | 35.2 | 21.0 |
| 罗→英 | 39.9 | 33.1 | 39.5 |

在法→英和德→英上，GPT-3 Few-Shot 甚至超过了有监督 SOTA，反映了 GPT-3 作为英语语言模型的强大生成能力。

### 语言模型规模的影响

论文训练了 8 个不同规模的模型，从 125M 到 175B，所有模型都训练了 3000 亿 token：

{{< figure src="scaling-curves.svg" title="图 2：模型规模与性能关系——Zero-Shot 稳步提升，One-Shot 曲线变陡，Few-Shot 呈超线性增长" >}}

关键发现：

1. **零样本**：从 125M 到 175B，性能稳步提升，但曲线平缓
2. **一样本**：曲线明显变陡——大模型更能从单个示例中受益
3. **少样本**：曲线最陡——大模型更擅长从多个示例中学习规律

## 新闻生成：真假难辨的分水岭

GPT-3 最令人不安的发现来自新闻生成实验。

给定标题和副标题，GPT-3 能生成完整的新闻文章。在人类评估中，参与者**无法区分** GPT-3 生成的文章和真实新闻：

> "We find that GPT-3 can generate samples of news articles which human evaluators have difficulty distinguishing from articles written by humans."

这个发现直接引发了关于 AI 生成内容的社会影响讨论。论文也因此专门讨论了伦理问题、偏见和滥用风险，并发布了一份 Model Card 来记录这些考量。

## 局限与失败案例

GPT-3 论文最值得称道的是，它没有回避模型的失败。论文详细列出了 GPT-3 的局限：

### 1. 句子比较任务

GPT-3 在 WiC（单词含义比较）、RTE（文本蕴含）、CB（承诺推理）等涉及句子间比较的任务上表现很差。论文的推测是：

> "GPT-3 appears to be weak in the few-shot or one-shot setting at some tasks that involve comparing two sentences or snippets."

### 2. 自然语言推理

在 ANLI（对抗性自然语言推理）上，GPT-3 的 Few-Shot 性能远低于随机基线，即使使用了 50 个示例。

### 3. 阅读理解（RACE/QuAC）

RACE 和 QuAC 需要多轮推理和长文本理解，GPT-3 的 Few-Shot 性能远低于微调模型。

### 4. 数值推理

在 DROP（需要离散推理和数值计算）上，GPT-3 仅 36.5 F1，而 SOTA 是 89.1。

### 5. 数据泄露

论文发现训练集和测试集之间存在大量 13-gram 重叠。虽然消融实验表明这对结果影响不大，但数据泄露问题仍然是 GPT-3 方法论上的一个主要争议点。

## 技术启示：GPT-3 改变了什么

### 1. In-Context Learning 取代微调成为新范式

GPT-3 之前，NLP 的默认流程是"预训练+微调"。GPT-3 之后，Prompt Engineering 成为一门"科学"。这个转变的影响极其深远：

- **无需标注数据**：以前需要数千条标注数据才能做好的任务，现在只需要几个示例
- **模型即平台**：API 提供者不再需要为每个任务训练专用模型，一个通用模型就够了
- **快速迭代**：改 prompt 比改模型快得多

### 2. 规模即能力

GPT-3 第一次用实验证明了：**简单的架构 × 足够大的规模 = 涌现能力**。这个结论奠定了此后所有大模型（PaLM、LLaMA、Chinchilla、DeepSeek）的发展方向。

### 3. 元学习框架

GPT-3 将语言模型重新定义为**元学习器**——预训练是"学会如何学习"，推理时的上下文是"应用学习方法"。这个框架直接影响了后来 In-Context Learning 的数学理论（Dai et al., 2023）。

### 4. 参数与数据同等重要

GPT-3 的训练数据只有 3000 亿 token，而模型有 1750 亿参数。这意味着参数比 token 还多（约 6:1 的比例）。后来的 Chinchilla（2022）发现最优比例是 20:1（token:参数），说明 GPT-3 实际上**训练不足**——如果给它更多数据，同等参数下性能还能更好。

## 参考资料

- Brown, T., et al. (2020). *Language Models are Few-Shot Learners*. NeurIPS 2020. arXiv:2005.14165.
- Radford, A., et al. (2019). *Language Models are Unsupervised Multitask Learners*. OpenAI.
- Kaplan, J., et al. (2020). *Scaling Laws for Neural Language Models*. arXiv:2001.08361.
- Dai, D., et al. (2023). *Why Can GPT Learn In-Context? Language Models Implicitly Perform Gradient Descent as Meta-Optimizers*. ACL 2023.
- Xie, S. M., et al. (2022). *An Explanation of In-context Learning as Implicit Bayesian Inference*. ICLR 2022.
- Child, R., et al. (2019). *Generating Long Sequences with Sparse Transformers*. arXiv:1904.10509.
- Jay Alammar. *How GPT3 Works - Visualizations and Animations*. http://jalammar.github.io/how-gpt3-works-visualizations-animations/
- OpenAI GPT-3 Model Card. https://github.com/openai/gpt-3/blob/master/model-card.md
- NVIDIA Blog. *OpenAI Presents GPT-3, a 175 Billion Parameters Language Model*. https://developer.nvidia.com/blog/openai-presents-gpt-3-a-175-billion-parameters-language-model/