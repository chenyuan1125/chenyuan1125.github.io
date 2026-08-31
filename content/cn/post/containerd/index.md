---
title: "containerd 通信机制分析"
author: "chenyuan"
description: "从源码出发，拆解 containerd 的 gRPC、TTRPC、UDS 三层通信架构，理解一个容器运行时如何管理进程生命周期。"
date: 2026-08-28
slug: "containerd-通信机制"
image: ""
tags: ["containerd", "容器", "gRPC", "IPC", "源码分析"]
categories: ["容器"]
---

## 引子：containerd 在容器生态里的位置

用 Docker 或 Kubernetes 时，你很少直接接触 containerd。但它是**容器生态的基石**：

```
Docker CLI → Docker Engine → containerd → runc → 容器进程
Kubelet    → (CRI)        → containerd → runc → 容器进程
```

Containerd 是一个**容器生命周期管理器**，它不直接拉起容器，而是通过 OCI 标准调用 runc 去拉。Containerd 自己负责：镜像下载/存储、rootfs 生成、容器的启停守护、以及底层存储和网络的管理。

它的通信架构很有意思——**一个守护进程，三个 socket 文件，两种 RPC 协议，一种通信方式串起全部**。

## 通信架构总览

Containerd 启动后会在 `/run/containerd/` 下创建多个 socket 文件：

```bash
$ ls -la /run/containerd/
srw-rw---- 1 root root 0 /run/containerd/containerd.sock     # gRPC 主端点
srw-rw---- 1 root root 0 /run/containerd/containerd.sock.ttrpc # TTRPC 端点
srw-rw---- 1 root root 0 /run/containerd/debug.sock            # Debug 端点
```

所有通信都基于 **Unix Domain Socket (UDS)**，协议有两种：

| 协议 | 用途 | 监听地址 |
|---|---|---|
| **gRPC** (HTTP/2 + Protobuf) | 外部客户端：ctr、Docker、K8s Kubelet | `/run/containerd/containerd.sock` |
| **TTRPC** (TTTRPC) | 内部插件通信：containerd ↔ 插件 | `/run/containerd/containerd.sock.ttrpc` |
| gRPC TCP (可选) | 外部监听（一般不用） | 127.0.0.1 或空 |

**为什么用两套 RPC 协议？** 这是 containerd 架构设计的关键决策，后面会讲。

## 启动流程：通信通道的初始化

入口在 `cmd/containerd/main.go`，核心逻辑在 `command.App()`：

```go
func main() {
    app := command.App()
    app.Run(os.Args)
}
```

`App()` 中按顺序初始化了多个监听器：

```go
// 1. Debug 端点（UDS 或 TCP）
if config.Debug.Address != "" {
    l, _ := sys.GetLocalListener(config.Debug.Address, ...)
    serve(ctx, l, server.ServeDebug)
}

// 2. gRPC 主端点（UDS）
l, _ := sys.GetLocalListener(config.GRPC.Address, ...)
serve(ctx, l, server.ServeGRPC)

// 3. TTRPC 端点（UDS）
tl, _ := sys.GetLocalListener(config.TTRPC.Address, ...)
serve(ctx, tl, server.ServeTTRPC)
```

`sys.GetLocalListener` 是关键函数——它根据地址字符串决定创建 UDS 还是 TCP 监听器，并**设置 socket 文件的权限和所有者**：

```go
func GetLocalListener(path string, uid, gid int) (net.Listener, error) {
    // 删除旧 socket 文件（避免 bind 失败）
    os.Remove(path)

    // 监听 UDS
    l, _ := net.Listen("unix", path)

    // 设置文件权限（默认 0660，只有 root 和同组可访问）
    os.Chmod(path, 0660)

    // 设置文件所有者（让 Docker 等非 root 进程也能连接）
    os.Chown(path, uid, gid)

    return l, nil
}
```

**注意**：先 `Remove` 再 `Listen`，这是 UDS 的惯用模式——socket 文件在进程退出后不会自动删除，不清理下次 bind 会失败。

## gRPC 和 TTRPC：为什么需要两套

gRPC 是标准的外部接口，但 containerd 内部插件之间用的是 **TTRPC**。为什么？

1. **gRPC 太重**：gRPC 基于 HTTP/2，有完整的流控、头部压缩、多路复用。对 containerd 内部插件通信来说，这些是开销，不是收益。
2. **TTRPC 是 containerd 自己的轻量级 RPC**：基于 Protobuf（和 gRPC 一样），但去掉了 HTTP/2 层，直接在 UDS 上传输 Protobuf 二进制数据。没有流控、没有头部压缩、没有 service 发现——就是**序列化 → 发送 → 反序列化**。
3. **插件不暴露给外部**：gRPC 端点对 Docker/K8s 开放，TTRPC 端点只对 containerd 自身和它的插件开放。两套协议隔开了外部和内部，**攻击面更小**。

### gRPC 服务注册

Containerd 在启动时注册了多个 gRPC 服务：

```go
// services/server/server.go
func New(ctx context.Context, config *srvconfig.Config) (*Server, error) {
    s := &Server{}

    // 注册 gRPC 服务
    s.RegisterServices(grpcServer)

    return s, nil
}

func (s *Server) RegisterServices(grpcServer *grpc.Server) {
    // 每个服务都是一个 plugin
    for _, p := range s.plugins {
        if service, ok := p.(grpcService); ok {
            service.Register(grpcServer)  // 插件注册自己的 gRPC 服务
        }
    }
}
```

每个插件（containers、images、snapshots、tasks 等）都实现了 `grpcService` 接口，在启动时注册到 gRPC server。**这是一种 service 插件化架构**——核心不依赖具体实现，只依赖接口。

### TTRPC 服务注册

TTRPC 的注册方式类似，但更轻量：

```go
// 每个插件同时注册到 gRPC 和 TTRPC
func (s *Service) Register(server *grpc.Server) {
    apitypes.RegisterService(server, ...)
}

func (s *Service) RegisterTTRPC(server *ttrpc.Server) {
    apitypes.RegisterServiceTTRPC(server, ...)
}
```

**同一个业务逻辑，两个 RPC 协议入口**——外部走 gRPC，内部走 TTRPC。

## 服务端处理请求的完整链路

以创建容器为例，看一个请求从接收到处理完成的完整路径：

```
1. Docker/ctr → gRPC 请求 → containerd.sock
2. gRPC Server 反序列化 Protobuf → CreateContainerRequest
3. Server 路由到 containersService.Create()
4. containersService 调用内部 API（如 tasksService）
5. tasksService 通过 TTRPC 调用 shim 进程
6. Shim 通过 runc 拉起容器
7. 结果原路返回
```

**第 5 步值得展开**：containerd 和 shim 之间的通信就是 TTRPC + UDS。

## Containerd-Shim 通信模型

每个容器都有一个独立的 `containerd-shim` 进程。Shim 的作用是**隔离开 containerd 和容器进程**：

```
containerd 崩溃 → 不影响运行中的容器
容器进程退出 → 不影响 containerd（shim 报回去）
```

Containerd 和 shim 通过 TTRPC over UDS 通信：

```go
// containerd 创建 shim 后，建立 TTRPC 连接
func (s *Service) startShim(ctx context.Context, ...) {
    // 1. 启动 shim 进程（传一个 bundle 目录）
    shim, _ := s.shimManager.Start(ctx, ...)

    // 2. 通过 UDS 连接 shim 的 TTRPC 端点
    conn, _ := ttrpc.Dial(shim.Address())

    // 3. 调用 shim 的 TTRPC 服务
    client := shimapi.NewTaskClient(conn)
    client.Create(ctx, request)
}
```

Shim 进程启动后也会监听一个 UDS，路径通常是 `/run/containerd/containerd-task-<container_id>.sock`。这个 socket 文件**只有 containerd 和 shim 知道**，外部无法连接。

**为什么不是 gRPC？** 同一个宿主机上可能有几百个容器，每个都有一个 shim 进程。如果 shim 都用 gRPC（HTTP/2），每个连接都要维护 HTTP/2 帧、流控窗口、头部表——几百个 shim 的 gRPC 开销是不可忽视的。TTRPC 的轻量级设计在这里体现了价值。

## 插件通信机制

Containerd 的插件系统是它的核心架构。每个插件是一个独立的 Go 接口实现，但**运行在同一个进程内**：

```go
// 插件注册
func init() {
    plugin.Register(&plugin.Registration{
        Type: plugin.ServicePlugin,
        ID:   "containers",
        InitFn: func(ic *plugin.InitContext) (interface{}, error) {
            return NewService(ic), nil
        },
    })
}
```

插件之间通过**接口调用**（不是 RPC）直接在进程内通信：

```go
// containers 服务需要调用 snapshots 服务
func (s *Service) Create(ctx context.Context, req *api.CreateContainerRequest) {
    // 从全局注册表拿到 snapshots 插件实例
    snapshots := plugin.Get("snapshots")
    // 直接调用 Go 接口方法
    snapshots.Prepare(ctx, ...)
}
```

**插件在同一个进程内，所以不需要 RPC 通信**——这是最直接的架构选择。但对外暴露时，每个插件把自己的服务注册到 gRPC/TTRPC server，让外部进程也能调用。

## 从 AI 安全视角看 containerd 通信

**UDS 权限控制**：containerd 的 socket 文件默认 0660（owner root + group root）。Docker 要连接的话，要么把 Docker 加入 root 组，要么修改 socket 组的权限。这在实际部署中经常被配置错误——有人图方便改成 `0777`，这意味着任何进程都能操作容器。在容器逃逸攻击中，攻击者第一步就是扫描宿主机上可写的 socket 文件。

**TTRPC 的攻击面更小**：TTRPC 端点不暴露给外部，攻击者无法直接通过 gRPC 端口拿到所有服务。但如果有恶意进程在宿主机上运行，它也能连 TTRPC socket（如果文件权限没设好）。

**Shim 隔离的安全价值**：如果 containerd 被攻破，攻击者只能控制那一组 gRPC 服务，不能直接操作运行中的容器（shim 是独立进程）。反过来，容器进程崩溃也不会影响 containerd。这种**双向隔离**是安全架构的好设计。

**fd 传递的安全风险**：containerd 通过 UDS 的 SCM_RIGHTS 把容器 stdin/stdout/stderr 的 fd 传递给 shim。如果接收方没验证发送方身份，可能被恶意利用。所以 containerd 的 shim 会用 `SO_PEERCRED` 确认连接方是 containerd 进程。

## 总结

Containerd 的通信架构可以用三个关键词概括：

1. **UDS 底座**：所有通信都跑在 Unix Domain Socket 上，性能好、安全可控
2. **双 RPC 协议**：gRPC 对外、TTRPC 对内，隔离开外部和内部，各取所长
3. **插件化服务注册**：每个业务模块是一个插件，启动时注册到 gRPC 和 TTRPC server，内聚外松

这种架构让 containerd 即能满足外部客户端的标准接口需求（gRPC），又能保持内部插件通信的轻量高效（TTRPC），同时通过 UDS 的权限模型提供安全保障。

## 参考资料

- containerd 源码：https://github.com/containerd/containerd (v2.x)
- containerd 架构文档：https://github.com/containerd/containerd/blob/main/docs/architecture.md
- CRI 架构：https://github.com/containerd/containerd/blob/main/docs/cri/architecture.md
- TTRPC 协议：https://github.com/containerd/ttrpc
- gRPC 文档：https://grpc.io/docs/