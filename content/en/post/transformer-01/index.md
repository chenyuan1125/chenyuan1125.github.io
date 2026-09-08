---
title: "Transformer: The Starting Point of Everything — What Problem Did It Actually Solve?"
author: "chenyuan"
description: "The 2017 Transformer paper killed RNNs with pure attention. This is a deep dive into self-attention, multi-head attention, positional encoding, and why parallelism changed everything."
date: 2026-08-26
slug: transformer-01
image: "cover.jpg"
tags: ["Transformer", "Attention", "Pretraining", "Architecture"]
categories: ["LLM Architecture"]
---

## Prologue: The Bottleneck of Sequential Processing

Before 2017, sequence models meant RNNs and LSTMs. They process tokens one at a time: hidden state at step t depends on step t-1. This creates two fatal problems:

1. **No parallelism** — training cannot be parallelized across time steps, so you can't leverage GPUs effectively
2. **Long-range information decay** — even with gating mechanisms, information from 100 steps ago gets diluted through repeated transformations

{{< figure src="rnn-flow.png" title="Figure 1: RNN sequential processing — hidden state must pass through every step" >}}

The Transformer paper's answer was radical: **throw away recurrence entirely. Use attention for everything.**

## Self-Attention: The Core Mechanism

The formula every LLM engineer knows:

$$\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^T}{\sqrt{d_k}}\right)V$$

Every token computes a query, key, and value vector. The attention score between token i and token j is the dot product of query_i and key_j, scaled by √d_k, then softmaxed into weights. The output for token i is a weighted sum of all value vectors.

**Why the √d_k scaling?** For large d_k, dot products grow large in magnitude, pushing softmax into regions with tiny gradients. Dividing by √d_k keeps the variance stable.

```python
# Scaled dot-product attention
scores = Q @ K.T / math.sqrt(d_k)     # [seq, seq]
attn = softmax(scores, dim=-1)        # weights sum to 1
output = attn @ V                      # [seq, d_v]
```

The key property: **every token can attend to every other token in O(1) sequential steps**. Long-range dependencies are now direct paths, not chains of transformations.

{{< figure src="scaled-dot-product.png" title="Figure 2: Scaled dot-product attention" >}}

## Multi-Head Attention: Looking from Different Angles

One attention head learns one type of relationship. Multi-head attention runs h heads in parallel (each with smaller d_k), concatenates their outputs:

$$\text{MultiHead}(Q,K,V) = \text{Concat}(\text{head}_1, \ldots, \text{head}_h)W^O$$

where each head_i = Attention(QW_i^Q, KW_i^K, VW_i^V).

With 8 heads of dimension 64 (total 512), one head might track syntax, another coreference, another positional patterns. Empirically, heads specialize without explicit instruction.

{{< figure src="multihead.png" title="Figure 3: Multi-head attention — h parallel attention operations" >}}

## Positional Encoding: Where Am I?

Attention is permutation-invariant — it has no notion of word order. "Dog bites man" and "man bites dog" produce identical attention patterns. The fix: add positional encodings to input embeddings.

The original paper used sinusoidal functions:

$$PE_{(pos, 2i)} = \sin\left(\frac{pos}{10000^{2i/d}}\right), \quad PE_{(pos, 2i+1)} = \cos\left(\frac{pos}{10000^{2i/d}}\right)$$

Each dimension corresponds to a sinusoid of different wavelength. The intuition: relative positions can be computed as linear transformations, and the model can extrapolate to longer sequences.

## Training Details

| Parameter | Value |
|---|---|
| Layers (Encoder/Decoder) | 6 / 6 |
| Model dimension | 512 |
| Heads | 8 |
| FFN inner dimension | 2048 |
| Optimizer | Adam (β1=0.9, β2=0.98) |
| Learning rate schedule | warmup 4000 steps, then ∝ d_model^-0.5 · step^-0.5 |
| Dropout | 0.1 |
| Label smoothing | 0.1 |

## Why Transformer Won

1. **Full parallelism** — all tokens processed simultaneously during training
2. **Direct long-range paths** — max path length between any two tokens is O(1)
3. **Scalable** — architecture has no recurrence bottleneck, so it scales with compute

This third property turned out to matter most. Transformer became the substrate for BERT, GPT, and every modern LLM — not because attention is theoretically optimal, but because it exploits GPUs perfectly and keeps getting better as you scale.

## References

- Vaswani, A., et al. (2017). *Attention Is All You Need*. arXiv:1706.03762.
- The Annotated Transformer: http://nlp.seas.harvard.edu/2018/04/03/attention.html