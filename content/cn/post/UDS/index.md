---
title: "Unix Domain Socket 源码实现分析 (OLK 6.6)"
author: "chenyuan"
description: "深入内核源码，拆解 UDS 从 socket 创建到数据收发全过程，理解为什么本地 IPC 不走网络栈反而更快。"
date: 2026-08-28
slug: "uds-源码分析"
image: "cover.jpg"
tags: ["IPC", "UDS", "Linux内核", "源码分析"]
categories: ["Linux内核"]
---

## 引子：TCP loopback 有什么问题？

两台机器通信要经过复杂的网络栈：路由、拥塞控制、校验和、分片重组。但**同一台机器上两个进程通信**，走 TCP loopback 也能通，只是杀鸡用牛刀了——数据包绕了一大圈网卡环路才回来，CPU 白白做了大量不需要的协议处理。

Unix Domain Socket（UDS）就是为这个场景设计的：**不走网络层，直接在进程间共享内存缓冲**。它比 TCP loopback 快 2-3 倍，CPU 消耗低一个数量级，而且在同一台机器上，UDS 的安全性天然可控（文件权限就能限制访问）。

## UDS 最重要的设计决策：地址用路径名

TCP 用 IP:Port 标识端点，UDS 则用**文件系统路径**（或抽象命名空间的名字）。这是理解 UDS 一切设计的关键：

```c
// include/uapi/linux/un.h
#define UNIX_PATH_MAX   108
struct sockaddr_un {
    __kernel_sa_family_t sun_family; /* AF_UNIX */
    char sun_path[UNIX_PATH_MAX];   /* 路径名 */
};
```

bind 到这个路径上时，内核会在文件系统创建一个**特殊的 socket 文件**（type=S_IFSOCK），ls 能看到：

```bash
$ ls -l /run/containerd/containerd.sock
srw-rw---- 1 root root 0 Aug 28 10:00 /run/containerd/containerd.sock
# ↑ 开头的 s 就是 socket 文件类型
```

路径名地址带来了两个好处：
- **权限控制天然继承自文件系统**：chmod 就能控制谁能连接
- **生命周期可见**：socket 文件存在就是有人监听，删了就是停了

但路径名还有个缺点：**需要创建文件**，用完还要清理（unlink）。所以 Linux 后来加了**抽象命名空间**（abstract namespace），把 sun_path 第一个字节设为 `\0`，socket 名字只存在于内核内存中，不落盘：

```c
// 抽象命名空间示例：地址为 "@containerd"
struct sockaddr_un addr;
addr.sun_family = AF_UNIX;
addr.sun_path[0] = '\0';  // 首字节为 \0 表示抽象命名空间
memcpy(addr.sun_path + 1, "containerd", 10);
```

## 创建 socket：比 TCP 少一层

UDS 的 socket 创建入口和 TCP 一样，都是 `socket(AF_UNIX, SOCK_STREAM, 0)`，但内核路径完全不同。

### socket() 系统调用

```c
// net/socket.c
SYSCALL_DEFINE3(socket, int, family, int, type, int, protocol)
{
    return __sys_socket(family, type, protocol);
}

int __sys_socket(int family, int type, int protocol)
{
    struct socket *sock;
    sock = __sys_socket_create(family, type, protocol);
    if (IS_ERR(sock))
        return PTR_ERR(sock);
    return sock_map_fd(sock, type & (O_CLOEXEC | O_NONBLOCK));
}
```

核心是两步：**创建 socket 对象** → **映射到文件描述符**。

### 创建 socket 对象：__sys_socket_create → sock_create → __sock_create

`__sock_create` 会调用 `net_families[AF_UNIX]->create`，也就是 `unix_create`：

```c
// net/unix/af_unix.c
static const struct net_proto_family unix_family_ops = {
    .family = AF_UNIX,
    .create = unix_create,
    .owner  = THIS_MODULE,
};
```

`unix_create` 做的事情很简单：

```c
static int unix_create(struct net *net, struct socket *sock, int protocol, int kern)
{
    struct sock *sk;

    // 校验协议类型：只支持 SOCK_STREAM / SOCK_DGRAM / SOCK_SEQPACKET
    if (protocol && protocol != PF_UNIX)
        return -EPROTONOSUPPORT;

    // 分配 sock 结构（这才是真正的内核 socket 对象）
    sk = unix_sk_alloc(net);
    if (!sk)
        return -ENOMEM;

    // 根据类型初始化不同的 ops 表
    switch (sock->type) {
    case SOCK_STREAM:
        sock->ops = &unix_stream_ops;    // TCP 风格
        break;
    case SOCK_DGRAM:
        sock->ops = &unix_dgram_ops;     // UDP 风格
        break;
    case SOCK_SEQPACKET:
        sock->ops = &unix_seqpacket_ops; // 流式 + 保边界
        break;
    default:
        return -ESOCKTNOSUPPORT;
    }

    // 初始化 sock 结构（锁、等待队列等）
    unix_insert_socket(unix_sk(sk));
    return 0;
}
```

**关键区别**：UDS 不需要像 TCP 那样分配 port、初始化路由表、设置拥塞控制。`unix_sk_alloc` 只是分配一个 `struct unix_sock`（比 `struct inet_sock` 小得多），加上基本的锁和队列初始化。

### 映射到文件描述符

```c
static int sock_map_fd(struct socket *sock, int flags)
{
    struct file *newfile;
    int fd = get_unused_fd_flags(flags);  // 取一个空闲 fd 号
    newfile = sock_alloc_file(sock, flags, NULL);
    fd_install(fd, newfile);              // 关联 fd 和 file
    return fd;
}
```

`sock_alloc_file` 分配一个**伪文件**（pseudo file），它的 `file_operations` 是 `socket_file_ops`——这是 UDS 能以 `read/write` 方式操作的关键。

## bind：把 socket 和路径绑定

```c
// net/unix/af_unix.c
static int unix_bind(struct socket *sock, struct sockaddr *uaddr, int addr_len)
{
    struct sock *sk = sock->sk;
    struct unix_sock *u = unix_sk(sk);
    struct sockaddr_un *sunaddr = (struct sockaddr_un *)uaddr;
    char *path = sunaddr->sun_path;
    int err;

    // 已经是 bound 状态 → 拒绝
    if (u->addr)
        return -EINVAL;

    // 校验地址格式
    struct unix_address *addr = kmalloc(sizeof(*addr) + addr_len, GFP_KERNEL);
    addr->len = addr_len;
    memcpy(addr->name, sunaddr, addr_len);

    if (path[0] == '\0') {
        // ★ 抽象命名空间：名字存在内核内存，不落盘
        addr->hash = unix_abstract_hash(addr->name, addr_len, sk->sk_type);
    } else {
        // ★ 路径名命名空间：在文件系统创建一个 socket 文件
        struct path parent;
        err = kern_path(sunaddr->sun_path, LOOKUP_PARENT, &parent);
        // ... 创建 S_IFSOCK 文件
        addr->hash = unix_autobind_hash(sk);
    }

    // 获取 hash 锁，插入到全局 hash 表
    spin_lock(&unix_table_lock);
    __unix_insert_socket(unix_sk(sk));
    spin_unlock(&unix_table_lock);

    u->addr = addr;
    return 0;
}
```

**两种绑定路径的区别**：

| | 路径名 | 抽象命名空间 |
|---|---|---|
| 标识方式 | `sun_path[0] != '\0'` | `sun_path[0] == '\0'` |
| 文件系统 | 创建 socket 文件 | 无文件 |
| 清理 | 需要 unlink | 进程退出自动释放 |
| 权限 | 文件权限控制 | 无（只有命名空间隔离） |
| 典型场景 | 生产服务（/run/*.sock） | 临时通信 |

## listen/accept：连接管理

UDS 的 listen/accept 和 TCP 在语义上完全一致，但实现简单得多：

```c
static int unix_listen(struct socket *sock, int backlog)
{
    struct sock *sk = sock->sk;
    // 只是设置两个字段：listen 状态 + 最大挂起数
    sk->sk_max_ack_backlog = backlog;
    sk->sk_state = TCP_LISTEN;
    return 0;
}
```

没有 TCP 的三次握手、没有 SYN 队列、没有定时器——就是**设个状态**。

accept 的核心是 `unix_stream_accept`：

```c
static int unix_stream_accept(struct socket *sock, struct socket *newsock,
                              struct proto_accept_arg *arg)
{
    struct sock *sk = sock->sk, *newsk;
    struct unix_sock *newu;

    // 从等待队列取一个已连接的客户端（如果没有就阻塞）
    newsk = skb_dequeue(&sk->sk_receive_queue);
    // 新 socket 继承监听 socket 的 credentials
    newu = unix_sk(newsk);
    // 返回新 socket 的文件描述符
    newsock->sk = newsk;
    return 0;
}
```

**注意**：当客户端 connect 时，它的 socket 已经被放入服务端的 `sk_receive_queue` 了。accept 只是在排队。

## connect：UDS 最关键的链路

```c
static int unix_stream_connect(struct socket *sock, struct sockaddr *uaddr,
                               int addr_len, int flags)
{
    struct sock *sk = sock->sk;
    struct sockaddr_un *sunaddr = (struct sockaddr_un *)uaddr;
    struct sock *other;

    // 1. 根据路径名找到服务端 socket
    other = unix_find_other(sock->sk->sk_net, sunaddr, addr_len,
                            sk->sk_type, hash, &err);
    if (!other)
        return err;

    // 2. 分配一个新 sock（用于这条连接）
    newsk = unix_create1(sock->sk->sk_net, NULL);
    // 新 sock 绑定一个临时地址（自动生成）

    // 3. 把新 sock 放到服务端的接收队列尾部
    skb = sock_alloc_send_skb(sk, 0, flags & O_NONBLOCK, &err);
    skb->sk = newsk;
    skb_queue_tail(&other->sk_receive_queue, skb);

    // 4. 唤醒服务端（如果它在 accept 上阻塞）
    other->sk_data_ready(other);

    // 5. 修改状态
    other->sk_state = TCP_ESTABLISHED;
    newsk->sk_state = TCP_ESTABLISHED;

    return 0;
}
```

**关键**：`unix_find_other` 根据路径名在全局 hash 表里找到服务端 socket。这一步不需要像 TCP 那样经过路由表查找、ARP 解析、网卡中断——**纯内存操作**。

## 数据收发：不走网络栈

### send：直接把数据放到接收队列

```c
static int unix_stream_sendmsg(struct socket *sock, struct msghdr *msg,
                                size_t len)
{
    struct sock *sk = sock->sk;
    struct sock *other = unix_peer(sk);  // 直接拿到对端

    // 分配 skb
    skb = sock_alloc_send_skb(sk, len, ...);

    // 从用户态拷贝数据到 skb
    err = skb_store_bits(skb, 0, msg->msg_iov->iov_base, len);

    // 直接把 skb 放到对端的接收队列
    skb_queue_tail(&other->sk_receive_queue, skb);

    // 通知对端有数据来了
    other->sk_data_ready(other);

    return len;
}
```

**对比 TCP 的路径**：

| 步骤 | TCP | UDS |
|---|---|---|
| 数据拷贝 | 用户→内核skb | 用户→内核skb |
| 路由查找 | 查路由表 | 无 |
| 拥塞控制 | 窗口管理、重传定时器 | 无 |
| 校验和 | 计算 IP/TCP 校验和 | 无 |
| 分片 | 可能分片、重组 | 无 |
| 中断 | 软中断、硬中断 | 无 |
| 投递 | 通过网卡发送 | 直接放到对端队列 |

UDS 的数据路径**只有 2 次拷贝**（用户→内核→对端），而 TCP loopback 要经过完整的协议栈，即使没出网卡，仍要经过路由、拥塞控制、校验和、softirq 等环节。

### recv：从接收队列取

```c
static int unix_stream_recvmsg(struct socket *sock, struct msghdr *msg,
                                size_t size, int flags)
{
    struct sock *sk = sock->sk;

    // 从接收队列取 skb
    skb = skb_dequeue(&sk->sk_receive_queue);
    if (!skb)
        return -EAGAIN;  // 或阻塞等待

    // 把数据拷贝到用户态
    skb_copy_datagram_msg(skb, 0, msg, size);

    return size;
}
```

## 进阶：UDS 独有的能力

### 1. 文件描述符传递（SCM_RIGHTS）

这是 UDS 最有价值的能力之一——**把一个进程的文件描述符传给另一个进程**，对端拿到的是同一个内核文件对象：

```c
// 发送端
struct msghdr msg;
struct cmsghdr *cmsg;
char buf[CMSG_SPACE(sizeof(int))];

cmsg = CMSG_FIRSTHDR(&msg);
cmsg->cmsg_level = SOL_SOCKET;
cmsg->cmsg_type = SCM_RIGHTS;
cmsg->cmsg_len = CMSG_LEN(sizeof(int));
*(int *)CMSG_DATA(cmsg) = fd_to_send;  // 要传递的 fd

sendmsg(sock, &msg, 0);
```

内核实现：`unix_scm_to_skb` 把文件指针从当前进程的 fd 表里取出，插入到 skb 的辅助数据中，对端接收时从 skb 取出文件指针，在它的 fd 表中分配一个新 fd。**整个过程不涉及文件内容拷贝**。

这在 containerd 中非常关键：containerd 通过 UDS 把容器标准输入/输出/错误的 fd 传递给 shim 进程。

### 2. 证书传递（SCM_CREDENTIALS）

UDS 可以**自动携带发送进程的 PID、UID、GID**：

```c
// 接收端可以获取对端进程的证书
struct ucred peercred;
socklen_t len = sizeof(peercred);
getsockopt(sock, SOL_SOCKET, SO_PEERCRED, &peercred, &len);
// peercred.pid, peercred.uid, peercred.gid
```

这个能力是**内核自动提供的，不需要发送端配合**。这意味着服务端可以**基于 PID 做细粒度权限控制**——比如只允许某个进程连接。

### 3. SOCK_SEQPACKET：流式 + 保边界

TCP 是流式（SOCK_STREAM），数据可能粘包；UDP 是报文（SOCK_DGRAM），有大小限制。UDS 的 SOCK_SEQPACKET 则**兼具两者优点**：

- 面向连接（像 TCP）
- 保消息边界（像 UDP）
- 数据可靠、有序

## 从 AI 安全视角看 UDS

UDS 虽然不经过网络，但它本身就有安全风险：

**路径名 socket 的权限风险**：socket 文件继承文件系统的权限。如果 `chmod 777` 一个 UDS 文件，任何用户都能连接。容器场景下，宿主机和容器可能共享挂载的 socket 文件——这是容器逃逸的常见攻击面。

**抽象命名空间不可控**：抽象命名空间的 socket 不落盘，不能用 `ls` 看到，也没有文件权限保护。恶意进程只要知道名字就能连上。这也是为什么 containerd 的默认 socket 是路径名（`/run/containerd/containerd.sock`）而不是抽象命名空间——路径名至少能用文件权限约束。

**fd 传递的攻击面**：SCM_RIGHTS 传递的是内核文件对象指针。如果恶意进程通过 UDS 接收 fd，可能拿到意外的系统资源。所以接收方应该用 `SO_PEERCRED` 验证发送方身份。

## 总结

UDS 是 Linux 本地 IPC 的最佳选择——**比 TCP loopback 快 2-3 倍，CPU 消耗低一个数量级，而且支持 fd 传递和证书传递这些独特能力**。它的核心设计思想是：既然两个进程在同一台机器上，那就绕过整个网络栈，直接在内存中传递数据。

回到 containerd 的通信架构，它的所有 gRPC 和 TTRPC 接口都基于 UDS 实现——这不是巧合，而是对安全性和性能的共同追求。

## 参考资料

- Linux kernel 6.6 源码：`net/unix/af_unix.c`
- `man 7 unix` — Unix sockets 手册
- `man 7 cmsg` — 辅助数据（fd 传递、证书传递）
- Stevens, *UNIX Network Programming*, Vol 1, Chapter 15 (Unix Domain Protocols)