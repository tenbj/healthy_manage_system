# localhost 与 127 访问差异根因分析

## 问题

为什么 `http://localhost:5273` 能访问，但 `http://127.0.0.1:5273` 访问不了？

## 现场证据

本机解析结果显示 `localhost` 同时有 IPv6 和 IPv4 回环地址：

```text
localhost AAAA ::1
localhost A    127.0.0.1
```

5273 端口当前只监听在 IPv6 回环地址：

```text
TCP [::1]:5273 [::]:0 LISTENING 21236
```

HTTP 探测结果：

```text
http://localhost:5273   -> 200
http://[::1]:5273       -> 200
http://127.0.0.1:5273   -> 无法连接到远程服务器
```

监听进程是 Vite：

```text
node ...\trading-ops-mvp\node_modules\vite\bin\vite.js
```

## 第一性原理

`localhost` 不是一个具体 IP，而是一个特殊主机名。RFC 6761 规定，`localhost` 名称应解析到对应的 IP loopback 地址，因此同一台机器上它可能解析到 IPv4 的 `127.0.0.1`，也可能解析到 IPv6 的 `::1`。

`127.0.0.1` 是明确的 IPv4 回环地址；`::1` 是明确的 IPv6 回环地址。浏览器访问哪个地址，服务端就必须在同一个地址族上监听。监听 `[::1]:5273` 的服务不能自动等同于监听 `127.0.0.1:5273`。

Vite 的 `server.host` 用来指定开发服务器监听哪些地址。Vite 文档说明，`server.host` 默认是 `localhost`，也可以设置为 `0.0.0.0` 或 `true` 来监听更多地址。

## 根因分析

**现象**：`localhost:5273` 能访问，`127.0.0.1:5273` 不能访问。

**直接原因**：当前 Vite 只监听了 `[::1]:5273`，也就是 IPv6 loopback。`localhost` 在本机优先走到了 `::1`，所以能通；`127.0.0.1` 强制走 IPv4，但没有任何进程监听 `127.0.0.1:5273`，所以连接失败。

**深层机制**：`localhost` 是名称，需要经过解析；`127.0.0.1` 是固定 IPv4 地址，不经过名称选择。只要服务端绑定地址族和客户端访问地址族不一致，就会出现“localhost 能访问，但 127.0.0.1 不能访问”的情况。

**根因判断**：Vite 当前没有显式绑定 IPv4 loopback，导致开发服务器只落在 IPv6 loopback 上。

**验证方式**：

```powershell
Resolve-DnsName localhost
netstat -ano | Select-String ':5273'
Invoke-WebRequest http://localhost:5273 -UseBasicParsing
Invoke-WebRequest http://127.0.0.1:5273 -UseBasicParsing
Invoke-WebRequest http://[::1]:5273 -UseBasicParsing
```

## 修正建议

如果只想让 `127.0.0.1:5273` 能访问，可以临时这样启动 Vite：

```powershell
npm run dev:web -- --host 127.0.0.1
```

也可以在 `vite.config.ts` 里固定：

```ts
server: {
  host: '127.0.0.1',
  port: Number(env.VITE_PORT ?? 5173),
  proxy: {
    '/api': env.VITE_API_PROXY ?? 'http://127.0.0.1:4310',
  },
}
```

如果还需要让局域网设备访问，可以用：

```ts
server: {
  host: '0.0.0.0',
  port: Number(env.VITE_PORT ?? 5173),
}
```

但 `0.0.0.0` 会把开发服务器暴露到更多网卡地址上，只适合可信网络环境。日常本机开发更建议统一使用 `localhost`，或者把 Vite 明确绑定到 `127.0.0.1` 后统一使用 `127.0.0.1`。

## 结论

这不是端口号问题，也不是浏览器缓存问题。当前 5273 端口只监听 IPv6 的 `[::1]`，所以 `localhost` 解析到 IPv6 时能打开，而 `127.0.0.1` 作为 IPv4 地址没有对应监听服务。最小修正是让 Vite 显式监听 `127.0.0.1`。

## 参考文献

- RFC Editor, RFC 6761: Special-Use Domain Names, `localhost` reservation: https://www.rfc-editor.org/info/rfc6761/
- Vite Docs, Server Options, `server.host`: https://vite.dev/config/server-options
