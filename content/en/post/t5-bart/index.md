---
title: "T5 / BART: Unifying Every NLP Task as Text-to-Text"
author: "chenyuan"
description: "T5's unified text-to-text framework swallows all NLP tasks; BART fuses BERT's bidirectional understanding with GPT's generation via denoising — the peak of the encoder-decoder line."
date: 2026-09-05
slug: "t5-bart"
image: "cover.jpg"
tags: ["T5", "BART", "Encoder-Decoder", "Pretraining"]
categories: ["LLM Architecture"]
---

## Prologue: The Gaps in BERT and GPT

By 2018-2019, NLP was split across two lines:

- **BERT (encoder-only)**: strong bidirectional understanding, but cannot generate
- **GPT (decoder-only)**: strong generation, but unidirectional attention hurts understanding tasks

Could one architecture do both? The answer is **encoder-decoder** — the original Transformer, which BERT and GPT each tore apart.

In 2019, Google's T5 and Facebook's BART gave two different but complementary answers.

## T5: Everything Is Text-to-Text

T5 (Text-to-Text Transfer Transformer) made a radical claim: **rewrite every NLP task as "input text → output text"**.

| Task | Input | Output |
|---|---|---|
| Translation | `translate English to German: That is good.` | `Das ist gut.` |
| Classification | `sst2 sentence: This movie is great.` | `positive` |
| Similarity | `stsb sentence1: ... sentence2: ...` | `3.8` |
| Summarization | `summarize: <long text>` | `<summary>` |

The model needs no task-specific output layer — classification emits the token sequence "positive", regression emits the numeric string "3.8". **What's unified isn't the architecture, it's the interface.**

### Relative Position Encoding

T5 uses a simplified relative position bias: each attention head learns a set of scalar biases indexed by query-key relative distance, added to attention scores. Compared to absolute positions, it extrapolates better to unseen lengths.

### Pretraining Objective: Span Corruption

T5 doesn't mask individual tokens like BERT — it masks **contiguous spans**:

```
Original:  The quick brown fox jumps over the lazy dog
Corrupted: The <X> fox jumps <Y> dog
Target:    <X> quick brown <Y> over the lazy
```

Each span is replaced by a sentinel token (`<X>`, `<Y>`), and the model must emit all masked spans. Average span length 3, 15% masked.

This is harder than token masking and closer to a generation task.

### The C4 Dataset

T5 built **C4** (Colossal Clean Crawled Corpus, 750GB) — English text cleaned from Common Crawl. Rules included: keep only lines ending in punctuation, deduplicate, filter profanity pages.

### Model Sizes

| Model | Params | Layers | d_model |
|---|---|---|---|
| T5-Small | 60M | 6/6 | 512 |
| T5-Base | 220M | 12/12 | 768 |
| T5-Large | 770M | 24/24 | 1024 |
| T5-3B | 3B | 24/24 | 1024 |
| T5-11B | 11B | 24/24 | 1024 |

One of T5's most valuable contributions is its **systematic ablation study**: encoder-decoder vs decoder-only, denoising vs language modeling objectives, C4 vs other datasets, pretraining data volume. The conclusion: encoder-decoder + span corruption wins at equal compute budget.

## BART: A Denoising Autoencoder

BART (Bidirectional and Auto-Regressive Transformer) takes a different angle: **corrupt text with arbitrary noise, then reconstruct the original**.

Its structure is the full Transformer encoder-decoder:
- Encoder uses bidirectional attention (like BERT)
- Decoder uses causal attention (like GPT) plus cross-attention over encoder output

### Five Noise Types

BART tested several noise functions; the best combination was:

1. **Token Masking**: random token masking (same as BERT)
2. **Token Deletion**: random deletion — the model must infer both position and content
3. **Text Infilling**: mask contiguous spans with a single mask (same as SpanBERT)
4. **Sentence Permutation**: shuffle sentence order
5. **Document Rotation**: rotate the document, forcing the model to find the true start

The final configuration used **text infilling + sentence permutation**: 30% of tokens masked (span lengths Poisson λ=3), with sentences shuffled.

{{< figure src="t5-vs-bart.svg" title="Figure 1: T5 span corruption vs BART denoising reconstruction (generated with Diagram Design)" >}}

### Why BART Excels at Generation

BART's decoder is autoregressive, so it naturally does summarization, translation, and dialogue. Its encoder is bidirectional, so it fully understands the input. This combination is especially strong for summarization — BART beats T5 on XSum.

## T5 vs BART

| Dimension | T5 | BART |
|---|---|---|
| Architecture | Encoder-Decoder | Encoder-Decoder |
| Objective | Span corruption (predict masked spans) | Denoising reconstruction (rebuild the whole input) |
| Corruption | Contiguous spans → sentinels | Text infilling + sentence shuffle |
| Strength | Classification, translation, multi-task unification | Summarization, generation |
| Position encoding | Relative position bias | Learned absolute positions |
| Scale | 60M - 11B | 140M - 400M |

**Core difference**: T5 predicts only the corrupted parts; BART reconstructs the full sequence. The former is more compute-efficient, the latter more generation-friendly.

## The Rise and Fall of Encoder-Decoder

After 2020, decoder-only became dominant (GPT-3, LLaMA, DeepSeek are all decoder-only). Why?

1. **Scaling efficiency**: no encoder-decoder communication overhead; same parameter count buys more depth
2. **Training simplicity**: one language-modeling objective, no noise design needed
3. **Generality**: in-context learning lets "understanding" tasks be solved by generation too

But encoder-decoder didn't vanish: T5 remains the backbone of many RAG, translation, and summarization systems, and Flan-T5 is still a strong choice among open small models.

## Takeaways

1. **Unified interface > unified architecture**: T5's text-to-text proved the value of a common interface — an idea inherited by instruction tuning
2. **The denoising design space is large**: T5's span corruption and BART's text infilling are both denoising, but details determine task fit
3. **Ablation studies are rarer than architecture novelty**: T5's most valuable artifact is that ablation table, not the model itself

## References

- Raffel, C., et al. (2019). *Exploring the Limits of Transfer Learning with a Unified Text-to-Text Transformer*. arXiv:1910.10683.
- Lewis, M., et al. (2019). *BART: Denoising Sequence-to-Sequence Pre-training for Natural Language Generation, Translation, and Comprehension*. arXiv:1910.13461.
- Hugging Face T5 docs: https://huggingface.co/docs/transformers/model_doc/t5