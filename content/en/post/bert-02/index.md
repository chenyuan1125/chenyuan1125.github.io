---
title: "BERT: What Exactly Is 'Bidirectional'?"
author: "chenyuan"
description: "BERT's bidirectionality is just an attention mask change — but training it required MLM to avoid trivially seeing the answer. We verify the claims against the original paper, including the NSP controversy."
date: 2026-08-27
slug: bert-02
image: "cover.jpg"
tags: ["BERT", "Transformer", "Pretraining", "MLM"]
categories: ["LLM Architecture"]
---

## Prologue: GPT-1's Unidirectional Constraint

GPT-1 uses a Transformer decoder as an autoregressive LM: each token attends only to itself and previous tokens. Reading a sentence becomes "forward-only". For "Xiaoming gave Xiaohong ___ a book", GPT cannot see the object "book" that follows the blank.

BERT's name — Bidirectional Encoder Representations from Transformers — is about fixing exactly this.

But "bidirectional" costs almost nothing architecturally: **the only change is the attention mask**. The hard part is training it without label leakage.

## 1. Bidirectionality Lives in the Attention Mask

GPT uses a lower-triangular causal mask. BERT uses a full matrix — every token attends to every token, including itself and future positions. No new parameters, no layer changes. Just a mask of ones instead of a triangle.

## 2. Why You Can't Use a Standard LM Objective

If the model can see token t when predicting token t, the optimal solution is to copy the input. The LM objective degenerates into transcription. BERT's solution: Masked Language Modeling.

### The 15% Masking Rate

The paper states: "we mask 15% of all WordPiece tokens in each sequence at random." No ablation over mask rates exists in the paper — 15% is a heuristic, not an optimized value.

### The 80/10/10 Split

Selected positions are replaced:
- 80% → [MASK] token
- 10% → random token
- 10% → unchanged

The 10% unchanged keeps the model honest: it must maintain a distributional representation for every input token, because it never knows which positions will be queried.

## 3. NSP: The Task That Later Fell

Next Sentence Prediction: 50% of pairs are real adjacent sentences, 50% random. [CLS] output is used for binary classification.

**The actual ablation numbers (Table 5 of the paper):**

| Task | MNLI-m | QNLI | MRPC | SST-2 | SQuAD |
|---|---|---|---|---|---|
| BERT_BASE | 84.4 | 88.4 | 86.7 | 92.7 | 88.5 |
| No NSP | 83.9 | 84.9 | 86.5 | 92.6 | 87.9 |

Removing NSP costs **3.5 points on QNLI** (a sentence-pair task) but only 0.5 on MNLI and 0.1 on SST-2. The effect is task-dependent.

RoBERTa (2019) later showed that with more data and longer training, removing NSP is neutral or slightly better:

| Setup | SQuAD 1.1/2.0 | MNLI | RACE |
|---|---|---|---|
| SEGMENT-PAIR + NSP | 90.4 / 78.7 | 84.0 | 64.2 |
| FULL-SENTENCES, no NSP | 90.4 / 79.1 | **84.7** | **64.8** |

ALBERT replaced NSP with SOP (Sentence Order Prediction) — harder and more useful for discourse coherence.

## 4. Details Often Gotten Wrong

### GELU Attribution

BERT uses GELU "following OpenAI GPT" — GPT-1 (June 2018) adopted GELU first. BERT is the inheritor, not the inventor.

### SQuAD Fine-tuning Has Parameters

The start/end predictors are linear layers on top of BERT output: start_logits = W_s·h_i + b_s. Claiming "no additional parameters" is wrong.

### Pre-training Compute

- Batch: 256 sequences × 512 tokens = 128,000 tokens/batch
- 1M steps ≈ 40 epochs over 3.3B words
- 90% of steps use seq_len 128 (attention is quadratic); 10% use 512

## 5. BERT's Real Contribution

Three layers:

1. **Architecture**: full attention instead of causal — near-zero cost, huge representational gain
2. **Training**: MLM solves the "seeing yourself" problem — the objective itself prevents leakage
3. **Paradigm**: universal pretraining + lightweight fine-tuning replaced task-specific architectures

## Limitations

- 512 max sequence length (learned positional embeddings)
- Pretrain/fine-tune mismatch persists ([MASK] never appears downstream)
- Cannot generate — encoder-only has no causal factorization
- NSP is inefficient: half the training signal is about sentence adjacency, later shown to be replaceable

## References

- Devlin, J., et al. (2018). *BERT: Pre-training of Deep Bidirectional Transformers*. arXiv:1810.04805.
- Liu, Y., et al. (2019). *RoBERTa*. arXiv:1907.11692.
- Lan, Z., et al. (2020). *ALBERT*. arXiv:1909.11942.