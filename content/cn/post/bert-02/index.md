---
title: "BERT：双向编码器，到底双在哪"
author: "chenyuan"
description: "2018 年 Google 提出的 BERT，用完形填空思路让 Transformer 真正学会双向理解上下文，成为理解型任务的标配底座。"
date: 2026-08-27
slug: "bert-02"
image: "cover.jpg"
tags: ["BERT", "Transformer", "预训练", "MLM"]
categories: ["大模型架构学习"]
---

## 引子：从 GPT-1 的"我只能往前看"说起

上一篇我们拆了 Transformer，它的核心是注意力机制——理论上能看到上下文里所有词。但 2018 年 OpenAI 推出的 GPT-1，把 Transformer 的 **Decoder** 单独拎出来做预训练，套上"自回归"的语言模型：每一步只看自己和过去的词，往后预测下一个。

这就像一个人读句子时，**只准用眼睛扫前面读过的字，不准回头看**。读"小明给小红___一本书"时，GPT 只能根据"小明给小红"猜下一个词是"送"还是"买"——但它看不到"书"这个宾语。

这种"单向"约束让 GPT 特别擅长**生成**（写下一个字），但遇到**理解**任务（句子分类、问答、命名实体识别）就吃亏了：很多判断需要"两头看"。

2018 年底 Google 放出的 BERT（Bidirectional Encoder Representations from Transformers）就是来解决这个问题——**名字里的 "Bidirectional" 就是这个意思**。

## 双向到底"双"在哪？

先看对比图：

{{< figure src="bert-direction.png" title="图 1：BERT 双向 vs GPT 单向——同一句话两种预训练思路（tldraw 绘制）" >}}

GPT 的单向：预测"猫"时，只能看"我喜欢"和它自己，看不到"睡在沙发上"。

BERT 的双向：预测被遮住的"猫"时，**左右都能看**——"我喜欢 ___ 睡在沙发上"，左右两边都是上下文。

这看着简单，但实现起来要解决一个关键问题：**不能"看见自己"**。如果模型在预测"猫"时把"猫"也喂进去了，那就是抄答案。BERT 的解法就是**遮住 15% 的词**让模型猜——这就是接下来要讲的 **MLM**。

## 核心机制一：Masked Language Model（MLM）

MLM 的全称是"遮蔽语言模型"，思路来自英语考试里的完形填空。

**具体做法**：
1. 准备一段文本
2. 随机挑 15% 的词（subword token）出来
3. 这 15% 里：
   - 80% 替换成 `[MASK]`（例：原句"我喜欢猫" → "我喜欢 [MASK]"）
   - 10% 替换成随机的别的词（"我喜欢 桌子"）
   - 10% 保持原样不动（"我喜欢 猫"）
4. 让模型根据**左右两边的所有上下文**，猜出这些被遮的位置原来是什么

最后那 10% "保持原样"是为了减轻预训练-微调的 mismatch：微调时没有 `[MASK]`，要让模型学会"不管输入被怎么处理，我都要能正常理解"。

{{< figure src="bert-mlm.png" title="图 2：BERT 预训练——MLM + NSP 双任务（tldraw 绘制）" >}}

**为什么 MLM 能让模型学会双向理解？**
因为预测 [MASK] 时，模型的注意力能同时看左右两侧（除了被遮的那个位置）。这逼迫它必须把左右信息都编码进同一个向量里——这就是"双向"的本质。

## 核心机制二：Next Sentence Prediction（NSP）

MLM 学的是"词和上下文的关系"，但很多下游任务（问答、自然语言推理）需要"句子之间的关系"。BERT 加了第二个预训练任务 NSP：

**做法**：
- 给模型两句话 A 和 B
- 50% 的概率 B 是 A 的真实下一句
- 50% 的概率 B 是语料里随便抽的一句
- 让模型判断"B 是不是 A 的下一句？"（二分类）

这一招让 BERT 学到了**句间关系**，做 QA、文本匹配这些任务时直接受益。

（顺带一提：后来的 RoBERTa 发现 NSP 这个任务其实没那么必要，去掉后效果反而更好。但 BERT 原论文里它是关键设计之一。）

## 输入表示：三种 embedding 相加

BERT 的输入有三个 embedding 相加，这点要特别记住：

下面这张简化图对齐 BERT 论文 Figure 2 的输入结构：

{{< figure src="bert-embeddings.png" title="图 3：BERT 输入表示——Token + Segment + Position 三种 embedding 相加（tldraw 绘制，结构参考 Devlin et al., 2018, Figure 2）" >}}

- **Token Embeddings**：词的向量（用 WordPiece 切词，词表约 3 万）
- **Segment Embeddings**：标记"A 句"还是"B 句"（用 E_A/E_B 两个向量）
- **Position Embeddings**：标记这是第几个位置（用学习出来的，不是 Transformer 原版的正弦函数）

加起来就是输入向量，进入多层 Transformer Encoder。

## 架构与规模

BERT 沿用 Transformer 的 **Encoder**（不是 Decoder）：

| 模型 | 层数 | 隐藏维度 | 注意力头 | 参数量 |
|---|---|---|---|---|
| BERT-base | 12 | 768 | 12 | ~110M |
| BERT-large | 24 | 1024 | 16 | ~340M |

预训练数据：
- BookCorpus（8 亿词）
- English Wikipedia（25 亿词）
- 总共约 33 亿词，训练 40 个 epoch（base）/ 4 个 epoch（large）

训练硬件：BERT-base 用 4 块 Cloud TPU、BERT-large 用 16 块 Cloud TPU，各训练约 4 天。以今天看算力不大，但在当时已经足以改变 NLP 的默认工作方式。

## 下游任务：BERT 的杀手锏

BERT 预训练完是"通才"，微调后是"专才"。原论文展示了 11 个 NLP 任务的 SOTA（state-of-the-art）：

**1. 文本分类（如情感分析）**
- 取 `[CLS]` 标记的输出向量
- 接一个全连接层 → softmax 分类

**2. 问答（如 SQuAD）**
- 输入："问题 + 文章"
- 输出：答案在文章中的**起止位置**（两个向量分别预测 start 和 end 的概率分布）

**3. 命名实体识别（NER）**
- 每个 token 的输出接分类器，预测是否是实体、属于哪类

**4. 自然语言推理（NLI）**
- 输入两句话，输出"蕴含/矛盾/中立"

**微调成本极低**：通常 1-3 块 GPU 跑几小时就够，因为绝大部分参数已经预训练好了。这让学术界和中小公司都能用得起。

{{< figure src="bert-finetune.png" title="图 4：BERT 微调——同一底座适配不同下游任务（tldraw 绘制）" >}}

## BERT 家族：后浪们

BERT 一出，NLP 领域炸了，半年内冒出一堆改进版：

- **RoBERTa**（Facebook, 2019）：去掉 NSP，增大数据量（160GB），训练更久，效果显著超过原版 BERT
- **ALBERT**（Google, 2019）：参数共享 + 矩阵分解，把 BERT-large 从 340M 压到 12M，性能几乎不降
- **ERNIE**（百度, 2019）：中文版 BERT，加入知识增强掩码策略
- **DistilBERT**（HuggingFace, 2019）：蒸馏小模型，速度提升 60%，性能保留 97%
- **SpanBERT**（2019）：连续片段掩码，对 QA 类任务更友好

## BERT vs GPT：理解 vs 生成

这是理解 BERT 定位的关键对比：

| 维度 | BERT | GPT |
|---|---|---|
| 架构 | Transformer Encoder | Transformer Decoder |
| 注意力 | 双向 | 单向（遮住未来） |
| 预训练任务 | MLM + NSP | 自回归语言模型 |
| 擅长 | 理解（分类、QA、NER） | 生成（续写、对话） |
| 典型应用 | 搜索、推荐、文本匹配 | 写作、对话、代码生成 |

**一句话总结**：BERT 擅长"读懂"，GPT 擅长"接着写"。

但有意思的是，到了 GPT-3（2020）以后，大模型靠"规模 + 生成式预训练"也能搞定理解任务（in-context learning），BERT 这一脉的"双向编码器"路线逐渐被生成式大模型吸收融合。但 BERT 本身在工业界（搜索、推荐、文本分类）至今仍是主力，因为**小、快、准、便宜**。

## 护栏视角

BERT 的训练数据是公开网页 + 维基百科，里面难免有偏见、错误信息、敏感内容。预训练时这些都会被模型"学进去"。下游做客服、招聘、教育类应用时，必须做：
- **数据脱敏**：过滤明显的 PII（个人身份信息）
- **偏见检测**：用 StereoSet、WinoBias 等基准测性别/种族/地域偏见
- **事实核查**：BERT 不知道自己"对不对"，下游要加检索/校验层
- **对抗输入**：错别字、emoji 干扰会让 BERT 分类不稳定，需要对抗训练或数据增强

## 参考资料

- Devlin, J., Chang, M.W., Lee, K., & Toutanova, K. (2018). *BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding*. arXiv:1810.04805.
- Liu, Y., et al. (2019). *RoBERTa: A Robustly Optimized BERT Pretraining Approach*. arXiv:1907.11692.
- Sanh, V., et al. (2019). *DistilBERT, a distilled version of BERT*. arXiv:1910.01108.
- 论文 arXiv HTML 版（含 Figures）：https://arxiv.org/html/1810.04805
- The Illustrated BERT（Jay Alammar 经典图解）：http://jalammar.github.io/illustrated-bert/
