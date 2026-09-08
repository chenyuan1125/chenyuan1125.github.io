---
title: "DeepSeek-R1: Eliciting Reasoning in LLMs via Reinforcement Learning"
author: "chenyuan"
description: "DeepSeek-R1 showed that pure RL (no SFT cold start) can make a base model reason — and that GRPO with rule-based rewards is enough to produce emergent chain-of-thought."
date: 2026-09-01
slug: deepseek-r1-reasoning-rl
image: "cover.jpg"
tags: ["DeepSeek", "Reinforcement Learning", "Reasoning", "GRPO", "LLM"]
categories: ["LLM Architecture"]
---

## R1-Zero: Pure RL, No SFT

The DeepSeek-R1 paper has two models:

- **R1-Zero**: base model + RL directly, no supervised fine-tuning
- **R1**: SFT cold start → RL → rejection sampling → more SFT → more RL

R1-Zero is the scientifically interesting one: applied directly to DeepSeek-V3-Base with GRPO, it develops reasoning behaviors — self-verification, reflection, long chains of thought — without any demonstration data.

## GRPO: Group Relative Policy Optimization

PPO needs a separate value model (about one extra model's memory). GRPO drops it: sample G outputs per prompt from the old policy, use the group's mean as baseline:

$$A_i = \frac{r_i - \text{mean}(r_1, \ldots, r_G)}{\text{std}(r_1, \ldots, r_G)}$$

This turns the advantage estimate into a group-relative comparison, removing the critic network entirely.

### Rule-Based Rewards

For math/code, rewards are verifiable:
- **Correctness**: exact-match or unit tests pass
- **Format**: response contains ``` reasoning tags and answer tags

No learned reward model → no reward hacking against a proxy. The model cannot fool a unit test.

{{< figure src="pipeline.svg" title="Figure 1: R1 training pipeline — cold start, RL, rejection sampling, second RL round" >}}

## Emergent Behaviors in R1-Zero

Training curves show the "aha moment": around a certain RL step, response length jumps and accuracy climbs discontinuously. Behaviors that appear without being rewarded:

- **Self-verification**: "Wait, let me check this again..."
- **Backtracking**: abandoning a failed approach mid-solution
- **Reflection**: explicitly stating assumptions and testing them

The paper's interpretation: given only correctness rewards and enough exploration, chain-of-thought is the most natural path to correct answers.

## Why R1 (the Two-Stage Version) Is Still Needed

R1-Zero has problems: non-English mixing, endless repetition, weak instruction following. The full R1 pipeline fixes these:

1. **SFT cold start** (thousands of long-CoT examples) — gives the model a usable format
2. **Reasoning RL** — GRPO on verifiable tasks
3. **Rejection sampling + SFT** — generate diverse reasoning data, filter by correctness, retrain
4. **Second RL round** — now including human-preference rewards for helpfulness and harmlessness

## Results

| Benchmark | DeepSeek-V3 | R1-Zero | R1 |
|---|---|---|---|
| AIME 2024 | 39.2 | 71.0 | **79.8** |
| MATH-500 | 90.2 | 95.9 | **97.3** |
| Codeforces (percentile) | 58.7 | — | **96.3** |
| GPQA Diamond | 59.1 | — | **71.5** |

R1 matches OpenAI o1-1217 on AIME and MATH.

## Why This Matters

1. **Reasoning is learnable by RL** — no process-supervision data (as o1 likely used) required, outcome rewards suffice
2. **Open replication** — the recipe, code, and weights are all open, unlike o1
3. **The efficiency question** — R1 achieves o1-level results with a much smaller infrastructure budget, challenging the "scale is everything" narrative

## Limitations

- Language mixing persists in long reasoning chains
- Sensitive to prompt format (the paper itself notes format brittleness)
- RL for general domains (writing, open-ended QA) still needs preference models, where reward hacking returns

## References

- DeepSeek-AI (2025). *DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning*. arXiv:2501.12948.
- Shao, Z., et al. (2024). *DeepSeekMath: Pushing the Limits of Mathematical Reasoning* (GRPO origin). arXiv:2402.03300.