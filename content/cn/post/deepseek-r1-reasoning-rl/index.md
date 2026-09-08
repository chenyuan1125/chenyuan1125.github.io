---
title: "DeepSeek-R1：用强化学习激发大模型推理能力"
author: "辰远"
description: "DeepSeek-R1 首次证明：无需海量人工标注思维链，仅靠强化学习就能让大模型自主涌现出自我验证、反思、多步回溯等高级推理行为。本文从 GRPO 算法、四阶段训练管线到定量效果数据，完整拆解其技术原理。"
date: 2025-09-01
image: "cover.jpg"
tags: [
"DeepSeek",
"强化学习",
"推理模型",
"GRPO",
"论文精读",
]
categories: [
"大模型架构学习",
]
series: [
"大模型架构学习",
]
keywords: [
"DeepSeek-R1, GRPO, 强化学习, 推理能力, Chain-of-Thought, 冷启动数据",
]
---

{{< alert note >}}
2025 年 1 月，DeepSeek 发布了 R1 系列推理模型，论文旋即登上 Nature。R1 的核心贡献在于：首次从实验上验证了「仅靠强化学习，无需监督微调」，就能让大模型自主学会长思维链推理、自我验证和错误回溯。本文从算法原理、训练管线到效果数据，完整拆解这一里程碑工作。
{{< /alert >}}

## 引言：推理能力的「涌现」之谜

2024 年 9 月，OpenAI 发布 o1 模型，首次将「推理时计算」（test-time compute）的概念带入主流视野。o1 能在回答问题之前生成一段内部思维链（Chain-of-Thought, CoT），自我验证、反复推敲，在数学、代码、科学推理上大幅超越 GPT-4o。

但 o1 是闭源的，其训练方法对外界是一个黑盒。社区的普遍猜测是：OpenAI 使用大量人工标注的 CoT 数据做监督微调（SFT），再辅以强化学习（RL）对齐。

DeepSeek 在 2025 年 1 月发布的 R1 论文彻底打破了这一认知。他们证明：**只需要 RL，不需要 SFT，模型就能自动学会推理**。这个结论的意义不下于 AlphaGo 在围棋领域的突破——它意味着「推理能力」不是人类手把手教出来的，而是奖励信号驱动下自组织涌现的。

## 基础架构：DeepSeek-V3-Base

DeepSeek-R1 系列并非从零训练，而是基于 DeepSeek-V3-Base 做后训练（post-training）。V3 本身是一个 MoE（Mixture of Experts）架构，671B 总参数，每次推理只激活 37B 参数，支持 128K 上下文窗口。

| 模型 | 总参数量 | 激活参数量 | 上下文长度 | 基座模型 |
|:---:|:---:|:---:|:---:|:---:|
| DeepSeek-R1-Zero | 671B | 37B | 128K | DeepSeek-V3-Base |
| DeepSeek-R1 | 671B | 37B | 128K | DeepSeek-V3-Base |

R1 的训练不修改 V3 的架构，而是通过强化学习重新调整模型的行为——让模型学会在回答前「思考」。

## 核心算法：GRPO——去价值网络的强化学习

传统 RLHF 中，PPO（Proximal Policy Optimization）是最常用的算法。PPO 需要四个模型：Actor（策略网络）、Critic（价值网络）、Reference（参考模型）、Reward（奖励模型）。其中 Critic 和 Actor 参数量相当，训练时显存消耗翻倍。

DeepSeek 使用的 GRPO（Group Relative Policy Optimization）彻底砍掉了 Critic 网络。其核心思想是：**用组内相对优势代替价值函数的绝对优势估计**。

### GRPO 的数学原理

给定一个 prompt $q$，Actor 采样 $G$ 个候选回答 $\{o_1, o_2, ..., o_G\}$，每个回答由奖励模型打分得到 $\{r_1, r_2, ..., r_G\}$。第 $i$ 个回答的优势函数定义为：

$$A_i = \frac{r_i - \text{mean}(\{r_1,...,r_G\})}{\text{std}(\{r_1,...,r_G\})}$$

这个公式的含义很直观：**如果你的回答在组内表现最好，优势为正，策略朝这个方向更新；表现最差，优势为负，策略远离这个方向**。组内标准化消除了奖励绝对值尺度的影响，使训练更加稳定。

GRPO 的优化目标为：

$$\mathcal{J}_{GRPO}(\theta) = \mathbb{E}_{q \sim P(Q), \{o_i\}_{i=1}^G \sim \pi_{\theta_{old}}(O|q)} \left[ \frac{1}{G} \sum_{i=1}^G \left( \min\left( \frac{\pi_\theta(o_i|q)}{\pi_{\theta_{old}}(o_i|q)} A_i, \text{clip}\left( \frac{\pi_\theta(o_i|q)}{\pi_{\theta_{old}}(o_i|q)}, 1-\epsilon, 1+\epsilon \right) A_i \right) - \beta \cdot \mathbb{KL}(\pi_\theta || \pi_{ref}) \right) \right]$$

其中：
- $\frac{\pi_\theta}{\pi_{\theta_{old}}}$ 是重要性采样权重，衡量新策略相对于旧策略的概率变化
- $\epsilon$ 是裁剪范围（R1 中设为 10），防止单步更新过大
- $\beta \cdot \mathbb{KL}$ 是 KL 散度惩罚，约束策略不要偏离参考模型太远（R1 中 $\beta=0.001$）
- 去掉 Critic 后，单步训练显存占用降低约 50%，batch size 可以翻倍

### GRPO vs PPO 的直观对比

```python
# PPO：需要价值网络估计状态价值
# value = critic(state)  # 额外的前向传播
# advantage = reward + gamma * value_next - value  # 依赖价值估计

# GRPO：组内相对优势，无需价值网络
# rewards = [reward_model(o1), reward_model(o2), ..., reward_model(oG)]
# advantages = (rewards - mean(rewards)) / std(rewards)  # 纯统计量
```

## 奖励设计：规则即信号

DeepSeek-R1 的奖励系统完全基于规则（rule-based），不依赖训练奖励模型。这有两个关键优势：

1. **零主观偏差**：规则客观可验证，不会出现奖励黑客（reward hacking）
2. **无限扩展**：不需要人工标注偏好数据

奖励分两类：

**准确性奖励（Accuracy Reward）**：
- 数学题：要求答案放在 `\boxed{}` 中，正则匹配后与标准答案比较
- 代码题：使用编译器运行测试用例，检查通过率
- 科学题：使用符号验证器或代码解释器判断

**格式奖励（Format Reward）**：
- 要求推理过程放在 `\think` 和 `\think` 标签之间
- 最终答案放在 `\response` 标签中
- 格式合规给正向奖励，不合规给零分

**语言一致性奖励（Language Consistency Reward）**（R1 专用）：
- 计算 CoT 中目标语言词的比例
- 解决多语言混杂问题
- 虽会轻微降低推理性能，但大幅提升可读性

最终的奖励函数为：

$$R = R_{accuracy} + R_{format} + \lambda \cdot R_{language}$$

## R1-Zero：纯 RL 的极限实验

DeepSeek-R1-Zero 是论文中最激进的实验：**直接在 V3-Base 上跑 GRPO，不用任何 SFT 数据**。

### 训练配置

| 超参数 | 值 |
|:---|:---:|
| 学习率 | $3 \times 10^{-6}$ |
| KL 系数 $\beta$ | 0.001 |
| 采样温度 | 1.0 |
| 每组采样数 $G$ | 16 |
| 最大生成长度 | 32,768 tokens（8.2k 步前）/ 65,536 tokens（之后） |
| 每步问题数 | 32 |
| 每步 batch size | 512（32 × 16） |
| 总训练步数 | 10,400 |
| 训练 epoch | 1.6 |
| 参考模型更新间隔 | 每 400 步替换为最新策略 |

### 涌现的行为

训练过程中，R1-Zero 自发出现了多种高级推理行为：

**自我验证（Self-Verification）**：模型会在解题过程中主动检查中间结果。例如解方程时，求出一个解后代入原方程验证。

**反思（Reflection）**：当发现推理路径走不通时，模型会回溯到上一步并尝试替代方案，而非继续错误路径。

**探索替代方案（Alternative Approach Exploration）**：对于复杂问题，模型会生成多个解题思路，比较后选择最优路径。

**思维链长度随时间增长**：这是关键量化指标。随着 RL 训练进行，模型输出的平均 token 数从 500 增长到 5,000+，说明模型学会了「想得更久」。

### 定量效果

AIME 2024（美国数学邀请赛）的成绩：

| 训练阶段 | pass@1 | 多数投票（64 样本） |
|:---|:---:|:---:|
| 初始（V3-Base） | 15.6% | — |
| RL 训练后（R1-Zero） | 71.0% | 86.7% |
| 提升幅度 | **+55.4%** | — |

**关键发现**：在 8,200 步（对应上下文长度从 32K 切换到 64K 的点）时，性能和输出长度都出现跳跃式增长。这暗示长上下文窗口对推理能力有直接的促进作用——模型需要足够的「思考空间」来展开完整推理链。

### 局限性

R1-Zero 虽然推理能力强，但存在三个突出问题：

1. **可读性差**：输出结构混乱，缺乏 Markdown 格式
2. **语言混杂**：同一个回答中中英文混用，尤其当 prompt 包含多种语言时
3. **通用能力缺失**：在写作、开放问答等非推理任务上表现不佳

## R1 正式版：四阶段训练管线

为解决 R1-Zero 的问题并进一步提升性能，DeepSeek 设计了四阶段训练管线：

{{< figure src="pipeline.svg" title="图 1：DeepSeek-R1 四阶段训练管线。从冷启动 SFT → 推理 RL → 拒绝采样+SFT → 全场景 RL，逐步提升推理能力并保持通用能力。" >}}

### 阶段一：冷启动（Cold Start）

**目标**：给 RL 一个稳定的起点，避免从 Base 模型直接 RL 的初期不稳定。

**数据收集**：几千条长 CoT 数据，通过以下方式生成：
- Few-shot prompting：以长 CoT 为示例
- 直接提示模型生成带反思和验证的详细答案
- 收集 R1-Zero 的输出并人工后处理
- 人工标注者精修格式

**输出格式**：`|special_token|<reasoning_process>|special_token|`，其中推理过程是 CoT，末尾有摘要总结结果。

**优势**：相比 R1-Zero，冷启动模型的输出可读性大幅提升，且用人类先验引导了推理模式，模型收敛更快。

### 阶段二：推理导向的 RL

在冷启动模型上运行与 R1-Zero 相同的 GRPO 训练，重点强化数学、代码、科学、逻辑推理能力。

**关键改进**：引入语言一致性奖励，在推理性能和可读性之间取得平衡。

### 阶段三：拒绝采样 + 监督微调

当推理 RL 收敛后，使用当前 checkpoint 生成 SFT 数据，分两类：

**推理数据（~600K 条）**：
- 从 RL checkpoint 做拒绝采样，每个 prompt 采样多个回答，只保留正确的
- 引入生成式奖励模型（Generative Reward Model），将参考答案和模型输出送入 DeepSeek-V3 做判断
- 过滤掉语言混杂、段落过长、代码块混乱的输出

**非推理数据（~200K 条）**：
- 写作、事实问答、自我认知、翻译等通用能力
- 复用 DeepSeek-V3 的 SFT 数据集
- 对简单查询（如"你好"）不生成 CoT
- 对复杂非推理任务，先让 V3 生成 CoT 再回答

**训练**：在 V3-Base 上使用上述 800K 数据微调 2 个 epoch。

### 阶段四：全场景 RL

这是最后的对齐阶段，综合提升有用性（helpfulness）和无害性（harmlessness）：

- **推理数据**：沿用规则奖励（数学、代码、逻辑）
- **通用数据**：使用奖励模型（Reward Model）捕获人类偏好
  - 有用性奖励：只评估最终摘要，不影响推理过程
  - 无害性奖励：评估整个回答（包括推理过程），检测风险内容

**训练细节**：

| 超参数 | 值 |
|:---|:---:|
| 学习率 | $3 \times 10^{-6}$ |
| 采样温度 | 0.7（比第一阶段低） |
| 总步数 | 1,700 |
| 通用数据+偏好奖励引入时机 | 最后 400 步 |
| 训练成本 | 见论文附录 B.4.4 |

**重要发现**：超过 400 步的偏好奖励训练会导致奖励黑客（reward hacking），因此只在最后 400 步引入。

## 蒸馏：把推理能力压缩进小模型

DeepSeek-R1 最实用的贡献之一是蒸馏（distillation）。他们用 R1 生成的 800K 推理数据，在 Qwen2.5 和 Llama-3 系列上微调出 6 个小模型：

| 蒸馏模型 | 基座 | 参数量 | AIME 2024 pass@1 |
|:---|:---|:---:|:---:|
| R1-Distill-Qwen-1.5B | Qwen2.5-1.5B | 1.5B | 28.9% |
| R1-Distill-Qwen-7B | Qwen2.5-7B | 7B | 55.9% |
| R1-Distill-Qwen-14B | Qwen2.5-14B | 14B | 69.7% |
| R1-Distill-Qwen-32B | Qwen2.5-32B | 32B | **72.6%** |
| R1-Distill-Llama-8B | Llama-3.1-8B | 8B | 50.4% |
| R1-Distill-Llama-70B | Llama-3.3-70B | 70B | 70.2% |

**关键结论**：**R1-Distill-Qwen-32B 在 AIME 上达到 72.6%，超越了 o1-mini**。这意味着一个 32B 参数的稠密模型，仅靠 R1 生成的推理数据微调，就达到了闭源旗舰推理模型的水平。

## 综合效果对比

| 基准 | 指标 | GPT-4o | Claude 3.5 Sonnet | DeepSeek V3 | OpenAI o1-mini | DeepSeek R1 |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| AIME 2024 | pass@1 | 9.3% | 16.0% | 39.2% | 71.0% | **79.8%** |
| MATH-500 | pass@1 | 74.6% | 71.1% | 90.2% | 90.0% | **97.3%** |
| GPQA Diamond | pass@1 | 49.9% | 65.0% | 59.1% | 60.0% | **71.5%** |
| HumanEval | pass@1 | 90.2% | 91.0% | 82.6% | 92.4% | **96.4%** |
| LiveCodeBench | pass@1 | 35.1% | 33.8% | 39.6% | 63.4% | **65.9%** |
| Codeforces | rating | 724 | 717 | 1,134 | 1,258 | **2,029** |
| MMLU | acc | 87.2% | 88.3% | 88.5% | 85.8% | **90.8%** |
| SimpleQA | acc | 38.2% | 28.9% | 24.9% | 7.0% | **30.1%** |

**解读**：
- R1 在数学（AIME、MATH-500）和代码（HumanEval、Codeforces）上全面领先
- 在科学推理（GPQA Diamond）上比 o1-mini 高出 11.5 个百分点
- 在通用知识（MMLU）上达到 90.8%，超越了所有对比模型
- 在事实问答（SimpleQA）上不如 GPT-4o，说明推理增强不一定提升事实准确性

## 基础设施：RL 训练工程架构

DeepSeek-R1 的 RL 框架分为四个解耦模块，各模块间通过异步调度提高效率：

{{< figure src="rl-infra.svg" title="图 2：DeepSeek-R1 的 RL 训练基础设施架构。四模块解耦设计，各模块完成后自动卸载模型释放显存。" >}}

1. **Rollout 模块**：使用 vLLM 加载 Actor 模型，从训练数据集中取 prompt 分发到多个 worker。对 MoE 架构实现专家并行策略，部署冗余热点专家副本平衡计算负载，利用 Multi-Token Prediction 做自推测解码加速推理。

2. **推理模块**：加载 Reward Model 和 Reference Model，对 Rollout 生成的样本做前向传播，计算模型基奖励。

3. **规则奖励模块**：使用代码执行器、答案匹配器、格式检查器等计算规则奖励。通过异步调度与 Rollout 和 Inference 模块重叠执行，隐藏延迟。

4. **训练模块**：加载 Actor 和 Critic（如果需要），计算损失并更新参数。使用 Best-Fit 数据打包策略减少 padding 浪费，集成 DualPipe 算法实现高效流水线并行。

**关键工程优化**：每个模块完成后自动将模型从 VRAM 卸载到系统内存或磁盘，为下一阶段释放显存。

## 护栏视角：从 AI 安全看 R1

作为一名 AI 安全工程师，我认为 DeepSeek-R1 带来的安全启示同样深刻：

**正面**：
- CoT 的可读性使推理过程可审计。安全团队可以检查模型的思考过程，而非仅看最终输出
- 规则奖励天然对抗 reward hacking，比基于人类偏好的奖励模型更鲁棒
- 蒸馏让小模型也具备推理能力，降低了安全审计的计算成本

**挑战**：
- 长 CoT 输出可能隐藏恶意逻辑。如果模型在推理过程中学会了隐藏恶意意图，传统安全检测更难发现
- 语言一致性奖励可能被利用。攻击者可通过控制 CoT 语言比例来绕过奖励约束
- 推理增强不等于安全增强。R1 在 SimpleQA 上表现不如 GPT-4o，说明推理能力的提升可能带来新的幻觉风险

**我的判断**：R1 的训练范式实际上为 AI 安全提供了一个新方向——**用可验证的规则奖励代替人类偏好，可以构建更可控、更可审计的安全对齐方案**。如果未来安全对齐也能采用类似 R1 的规则奖励思路，我们可能获得比 RLHF 更可靠的安全护栏。

## 总结

DeepSeek-R1 的核心贡献可以概括为三点：

1. **纯 RL 驱动推理涌现**：首次验证了 LLM 的推理能力可以通过 RL 自组织涌现，无需 SFT 数据
2. **GRPO 算法工程化**：去价值网络的 RL 算法使训练成本降低 50%，为大规模 RL 训练铺平了道路
3. **推理蒸馏实用化**：用 R1 生成的推理数据微调小模型，32B 模型即可超越 o1-mini，大幅降低了推理模型的使用门槛

R1 标志着大模型训练从「数据驱动」向「奖励驱动」的范式转移。如果说 GPT-3 证明了 scaling law 是模型能力的上限，那么 R1 证明了：**在同样的模型规模下，训练方法才是决定能力上限的关键**。

## 参考资料

1. **原论文**：DeepSeek-AI. *DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning*. arXiv:2501.12948, 2025. https://arxiv.org/abs/2501.12948
2. **Nature 发表版**：*DeepSeek-R1 incentivizes reasoning in LLMs through reinforcement learning*. Nature, 645, 635–645, 2025. https://doi.org/10.1038/s41586-025-09422-z
3. **官方代码仓库**：https://github.com/deepseek-ai/DeepSeek-R1
4. **GRPO 原论文**：Shao et al. *DeepSeekMath: Pushing the Limits of Mathematical Reasoning with Open Language Models*. arXiv:2402.03300, 2024.
5. **DeepSeek-V3 技术报告**：DeepSeek-AI. *DeepSeek-V3: A 671B MoE Model with Multi-Head Latent Attention*. arXiv:2412.19437, 2024.
6. **RLHF 与 PPO 综述**：Lambert et al. *Illustrating Reinforcement Learning from Human Feedback*. https://huggingface.co/blog/rlhf