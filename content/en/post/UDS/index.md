---
title: "Unix Domain Socket Source Code Analysis (OLK 6.6)"
author: "chenyuan"
description: "Kernel source dive: how UDS creates sockets and moves data, and why local IPC beats the network stack."
date: 2026-08-28
slug: "uds-源码分析"
image: "cover.jpg"
tags: ['IPC', 'UDS', 'Linux Kernel', 'Source Analysis']
categories: ["Linux Kernel"]
---

*(This article is primarily code analysis and course notes; the original is in Chinese. English version is a summary — see the source code and diagrams below.)*

