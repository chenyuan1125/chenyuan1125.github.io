---
title: "GPT-3: In-Context Learning and the Few-Shot Explosion"
author: "chenyuan"
description: "GPT-3's 175B parameters proved scale is capability: no fine-tuning, no gradient updates — just a few examples in the prompt beat then-SOTA fine-tuned models."
date: 2026-09-02
slug: gpt-03
image: "cover.jpg"
tags: ["GPT-3", "In-Context Learning", "Few-Shot", "Scaling Law", "LLM"]
categories: ["LLM Architecture"]
---

## GPT-2's Unfinished Question

GPT-2 showed two things: zero-shot capability exists, and scaling shows no saturation. But at 1.5B, zero-shot CoQA scored 55 F1 while fine-tuned SOTA was 90.7 — a huge gap.

GPT-3's question: **what happens at 100× the scale?**

## The 175B Configuration

| | GPT-2 XL | GPT-3 |
|---|---|---|
| Layers | 48 | 96 |
| d_model | 1600 | 12288 |
| Heads | 25 | 96 |
| Context | 1024 | 2048 |
| Params | 1.5B | 175B |

Trained on ~300B tokens (Common Crawl + WebText + books + Wikipedia), roughly 570× the text of GPT-2.

## In-Context Learning: The Core Discovery

GPT-3's headline result: **few-shot learning via prompts, no gradient updates at all.**

```
Translate English to French:
sea otter => loutre de mer
cheese => fromage
hello =>
```

The model completes "bonjour" — not because it was fine-tuned on translation, but because attention over the prompt's examples conditions the output distribution.

### The Scaling Pattern

Across tasks, performance follows a consistent pattern: **zero-shot < one-shot < few-shot**, and the gap widens with model size. Small models barely benefit from examples; 175B models benefit dramatically.

| Task | Fine-tuned SOTA | GPT-3 zero-shot | GPT-3 few-shot |
|---|---|---|---|
| SuperGLUE | 89.8 | 52.9 | **85.6** |
| TriviaQA | — | 54.2 | **71.2** |
| LAMBADA | 63.2 | 63.8 | **76.2** |
| Arithmetic (2-digit +) | — | 26.5 | **80.4** |

Few-shot GPT-3 matches or exceeds fine-tuned models on many tasks — with zero parameter updates.

## Why ICL Works (Mechanistically)

In-context learning is not fully understood, but the leading hypotheses:

1. **Implicit gradient descent** — the forward pass over examples approximates a meta-learned update (von Oswald et al., 2022)
2. **Induction heads** — specific attention heads implement "find previous occurrence of current token, copy what followed" (Olsson et al., 2022)
3. **Bayesian inference** — the model treats the prompt as evidence and conditions on a latent task distribution (Xie et al., 2021)

None is the full story; all capture parts of it.

## The Scaling Laws Connection

Kaplan et al. (2020) showed loss follows power laws in parameters, data, and compute:

$$L(N) \propto N^{-0.076}$$

GPT-3 sits on the predicted curve. Chinchilla (2022) later showed the optimal token/parameter ratio is ~20 tokens per parameter — GPT-3 was undertrained by that measure, which is why LLaMA-65B (1.4T tokens) matches it at ~⅓ the size.

## What GPT-3 Changed

1. **Prompting as interface** — natural language became the programming interface for models
2. **The API economy** — no fine-tuning means one model serves all users
3. **Scaling as business strategy** — GPT-3 justified compute investment at a scale no paper had before

## Limitations

- **Hallucination** — fluent but factually wrong outputs (the term entered common usage with GPT-3)
- **No memory** — 2048-token context is tiny; later models extended this by orders of magnitude
- **Compute cost** — few-shot inference on 175B was extremely expensive
- **Undertrained by modern standards** — Chinchilla-optimal training would use ~3.5T tokens

## References

- Brown, T., et al. (2020). *Language Models are Few-Shot Learners*. arXiv:2005.14165.
- Kaplan, J., et al. (2020). *Scaling Laws for Neural Language Models*. arXiv:2001.08361.
- Hoffmann, J., et al. (2022). *Training Compute-Optimal Large Language Models*. arXiv:2203.15556.