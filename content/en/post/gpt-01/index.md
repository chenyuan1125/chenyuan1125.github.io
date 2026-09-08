---
title: "GPT-1/2: Generative Pretraining and the Seeds of Few-Shot"
author: "chenyuan"
description: "OpenAI's GPT-1/2 proved an intuition: given enough scale and data, generative pretraining alone learns grammar, common sense, and reasoning — no labels required."
date: 2026-08-28
slug: gpt-01
image: "cover.jpg"
tags: ["GPT", "Generative Pretraining", "Transformer", "Few-Shot"]
categories: ["LLM Architecture"]
---

## From BERT to GPT: Two Symmetric Bets

2018 split NLP into two lines. BERT went bidirectional-encoder for understanding. GPT-1 went decoder-only for generation. Same Transformer substrate, opposite architecture configurations — a fork that defined the next five years.

## Core Design: Decoder-Only and Autoregression

GPT-1 extracts the Transformer decoder, drops cross-attention, stacks 12 layers of masked self-attention + FFN.

**Masked self-attention** — each token sees only itself and the left context. Future scores are set to -∞ before softmax, so their weights become 0:

```python
scores = Q @ K.T / sqrt(d_k)
mask = torch.triu(torch.ones(L, L), diagonal=1).bool()
scores[mask] = -float('inf')
attn = softmax(scores, dim=-1)
```

**Pre-norm** — GPT-1 places LayerNorm before each sublayer (post-norm in the original Transformer). This small change makes deep stacks trainable.

### Training Details

| | GPT-1 | GPT-2 Small |
|---|---|---|
| Layers | 12 | 12 |
| Hidden dim | 768 | 768 |
| Heads | 12 | 12 |
| Params | 117M | 124M |
| Data | BookCorpus (~1B words) | WebText (~40GB) |
| Batch | 64 | 512 |
| Sequence length | 512 | 1024 |

## Why Decoder-Only Can Understand

The counterintuitive claim: predicting the next token requires understanding everything before it — syntax, coreference, commonsense. If the model predicts "groceries" after "Xiaoming went to the supermarket and bought some ___", it must resolve what supermarkets sell.

GPT-1 hit SOTA on 9 of 12 NLP tasks — behind BERT on absolute scores, but proof that generation subsumes understanding.

## GPT-2: Implicit Multitask Learning

GPT-2 scaled up (1.5B max) and found something more important: **zero-shot task transfer**.

- Machine translation (WMT-14 En→Fr): zero-shot BLEU 11.5 — no parallel data ever seen
- Reading comprehension (CoQA): 55 F1 zero-shot
- Summarization (CNN/DM): competitive ROUGE-L without fine-tuning

The model learned multiple tasks implicitly from language modeling alone.

### Scaling Without Saturation

| Model | Params | LAMBADA (zero-shot) |
|---|---|---|
| GPT-2 Small | 124M | 45.0% |
| GPT-2 Medium | 355M | 55.0% |
| GPT-2 Large | 774M | 58.0% |
| GPT-2 XL | 1.5B | 63.0% |

No plateau. This curve directly motivated GPT-3's 175B and the scaling-laws program.

## Why GPT-1/2 Matters

1. **Decoder-only won** — GPT-3, LLaMA, Mistral, DeepSeek all follow this line
2. **Zero-shot changed everything** — GPT-2's discovery that models transfer without fine-tuning led directly to in-context learning, instruction tuning, and RLHF
3. **Scaling as strategy** — 117M → 1.5B → 175B was not accidental; GPT-2's data justified it

## References

- Radford, A., et al. (2018). *Improving Language Understanding by Generative Pre-Training*. OpenAI.
- Radford, A., et al. (2019). *Language Models are Unsupervised Multitask Learners*. OpenAI.
- The Illustrated GPT-2: http://jalammar.github.io/illustrated-gpt2/