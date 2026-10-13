# dsh-rea-mcp

**从 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 到 [REA —— Reverse Engineer Anything](https://github.com/morluto/rea) 的纯配置型桥。**

[English](README.md) | 中文

它挂载 DSH 本体自带的 MCP 客户端桥，用 stdio 指向 REA 的 MCP 服务器。整个集成就只有 [`cordis.patch.yml`](cordis.patch.yml) 一个文件——约 20 行，没有 JavaScript，装之前你能整屏读完。

```text
DSH agent
  └─ mcp__rea__analyze_binary / search / decompile / ...
       └─ @deepseek-ai/dsh-mcp-client        （DSH 自带）
            └─ npx -y rea-agents@6.4.0 mcp   （stdio 子进程）
                 └─ REA 分析引擎
                      ├─ 静态 JavaScript / .NET   （无需原生引擎）
                      ├─ 原生二进制                （Hopper / Ghidra / IDA）
                      └─ 运行时与网页捕获           （以你的用户权限）
```

[REA](https://rea.tools/) 让 agent 能检查原生二进制、JavaScript 和 Electron 应用、.NET 程序集、网站、网络捕获、Android APK、固件、SQLite 快照等等，分析在本地运行，结论自带证据和局限说明。本插件把它接进 DeepSeek Harness。

## 它刻意不做的事

这是设计取舍，不是"功能缺失清单"：

- **没有宿主插件。** 没有 `index.js`，我们的代码绝不跑在你的 harness 进程里。
- **没有 web 路由。** 不新增 HTTP 端点，因此不新增未鉴权的攻击面，也不会多一个"必须绑回环"的理由。
- **没有状态文件。** 不写 `~/.dsh/...state.json`。
- **没有会改你 profile 的安装器。** `npm run prewarm` 在你自己的终端里装好并验证上游服务器，绝不替你改 profile patch。
- **没有运行时依赖、没有构建步骤。** `dependencies` 为空，不需要编译，也不需要授予 `allowBuilds`。
- **不含针对某台机器的绝对路径。** 桥从 `PATH` 调 `npx`；仓库里的测试会在任何机器相关路径泄漏进发布文件时让构建失败。
- **没有 `peerDependencies`。** 那一行只是**点名** `@deepseek-ai/dsh-mcp-client`，从不 import 它，而 DSH 会从自己的安装里解析随附包——与 DSH 官方的 `templates/mcp` 组合包形态一致。声明 peer 会变成硬性激活门禁，其 SemVer 预发布规则会静默拒掉合法宿主；宿主范围改由 `engines.dsh` 声明，供市场卡片展示。
- **没有 `screenshots.json`。** 没有界面可拍。

如果你要的是应用内依赖安装器或 doctor 诊断工具，这个生态里别的插件提供了。这个插件用它们换的是"小到一屏能审完"。

## 前置条件

- **带内置 MCP 客户端桥的 DeepSeek Harness。** 声明范围 `>=0.2.0-rc.1 <0.3.0-0`；作者在 **0.2.0-rc.2**（桌面版）实测。声明的是范围，实测的是那一版，两者别混。
- **运行 DSH 的那个进程的 `PATH` 上有可用的 Node.js。** `npx` 拉起 `rea-agents`，而 REA 需要 **Node 22.x（≥22.19）、24.x（≥24.11）或 26+** 与 npm。作者在 Node 24 上实测。
- 可选——**深度二进制分析用的原生引擎**：已有 Hopper、Ghidra 或 IDA 安装。静态 JavaScript / .NET 分析不需要。

## 安装

应用内：**设置 → 插件 → 添加插件**，填其中一种：

```text
dsh-rea-mcp                                  # npm 包名（推荐）
github:sheilacraig/dsh-rea-mcp               # GitHub 仓库
```

CLI 持有的 profile：

```sh
dsh plugin --profile <profile> add dsh-rea-mcp
```

Electron 桌面版的 `desktop` profile 属于应用本身，请走应用的插件面板。

**本地开发时不要用外部目录的 link 安装。** 对本地 checkout 做正式验证，请先打包再安装（写到 DSH 自己的插件目录，而不是指向工作区的链接）：

```sh
cd dsh-rea-mcp
npm pack                          # 产出 dsh-rea-mcp-<version>.tgz
# 在 DSH 插件面板添加插件时，填这个 tarball 的本地路径即可
```

发布后，用户直接装 `dsh-rea-mcp` 包名即可，无需 tarball。

装完**重启 DSH**，让新的补丁层在启动时合成。

## 第一次启动最慢

`npx` 第一次要为 `rea-agents@6.4.0` 及其依赖建立缓存，需要下载。慢网下这是好一会儿，而桥等初始连接的时间远不到那么久。放到 harness 外面做，那里没有超时：

```sh
npm run prewarm
```

脚本会跑 `npx -y rea-agents@6.4.0 mcp`——**与桥完全相同的 argv**——对它说初始化 + `tools/list`，打印服务器身份、耗时和完整工具清单，然后退出。它拉起的正是桥将要拉起的那个进程，所以这一步成功就说明 harness 那侧再没有要下载或要发现的东西。

## 模型能用到什么

工具名形如 `mcp__rea__<工具>`。具体集合就是上游 `rea-agents@6.4.0` 发布的、随版本可能略有差异，所以本插件不声明固定数量——跑 `npm run prewarm` 看实时清单。能力覆盖：

| 领域 | REA 返回 |
| --- | --- |
| 原生二进制 | 伪代码、汇编、字符串、符号、调用与引用 |
| Go 二进制 | 内嵌编译器版本、模块、替换、构建设置 |
| WASM / EVM / 固件 | section、WAT 形式、dispatch 选择器、区域提取 |
| JavaScript / Electron | 模块、导入、source map、路由、IPC、原生插件 |
| .NET 程序集 | 元数据、CIL 指令、原生依赖、构建对比 |
| Android APK / 设备 | manifest、反编译方法、包、进程、转储 |
| 网站 | 页面结构、脚本、网络观察、截图 |
| SQLite / 崩溃 / 抓包 | 表结构、寄存器/信号、请求、暴露的载荷、报文 |

静态 JavaScript 与 .NET 分析只读文件、不运行程序。运行时捕获与设备工作流会以**你的用户权限**去运行所选目标——启用前请先读对应 REA 指南。

## 验证

1. 先跑一次 `npm run prewarm`（见上），它同时验证服务器与钉住的版本。
2. 在 DSH 里让 agent 调只读调用，例如对你拥有的 Go 二进制调 `mcp__rea__inspect_go_binary`，或做一次静态 `.NET` 检查。

## 安全

装上的效果是，agent 能读取并分析你机器上的二进制（对于原生分析，还能驱动你已装的 Hopper/Ghidra/IDA）。

- **stdio，不是监听端口。** 桥启动的是管道连接的子进程，不绑任何端口。
- **默认尽量不惊吓。** `failOnStartupError: false`——REA 起不来就记日志并让其余部分照常工作，而不是让整行激活失败。
- **Harness 的文件沙箱管不到它。** MCP 工具调用是普通工具调用，审批策略能拦；沙箱实现在 harness 自己的文件与 shell 工具里，不约束这个子进程。
- **只分析你拥有或已获授权的目标。** REA 自带负责使用声明；本桥不再额外加戏。
- **钉住上游版本。** `rea-agents@6.4.0` 固定，上游发版不会悄悄改变这座桥的行为。要升级就显式改一行并重跑 `npm run prewarm`。
- **装之前请读 [`cordis.patch.yml`](cordis.patch.yml)。** 那个文件就是插件本体，其余都是元数据、文档和测试。

## 排障

| 现象 | 原因与处理 |
| --- | --- |
| 完全没有 `mcp__rea__*` 工具 | 桥没能拉起服务器。在终端跑 `npm run prewarm`，它会以同样的原因失败并给提示。最常见原因：**运行 DSH 的那个进程**的 `PATH` 上没有可用 Node/npm——桌面快捷方式或编辑器带的 `PATH` 可能和你装 Node 的终端不一样。harness 日志里有 `mcp-client(rea)` 那一行。 |
| 原生分析报 "provider unavailable" | REA 没找到可用的 Hopper/Ghidra/IDA 去解该二进制格式。静态 JavaScript / .NET 分析不需要。按 REA 安装指南配置 provider，或在 `env` 里给大二进制调高 `REA_GHIDRA_STARTUP_TIMEOUT_MS` / `REA_HOPPER_STARTUP_TIMEOUT_MS`。 |
| 升级后工具变少了/变名了 | 工具集由钉住的版本决定。改 pin 可能改名或增减工具；对照 `npm run prewarm` 的输出和自己的提示词。 |
| 运行时捕获暴露了不该暴露的文件 | 这类工作流以你的权限运行。管好你喂给 REA 的目标范围，别用它去打敏感目标。 |

## 开发

```sh
npm install     # 唯一 devDependency：js-yaml，只给测试用
npm test        # node --test，校验本仓库的各类断言
npm run prewarm # 安装并验证上游 REA 服务器
```

`npm test` 会强制检查：有且只有一行 insert 指向 `@deepseek-ai/dsh-mcp-client`；`serverName` 符合工具名命名规则；钉住的 `rea-agents@<x.y.z>` 与 prewarm 脚本一致；`failOnStartupError` 与超时是文档值；市场入口符合 curated list 的提交规则；以及**任何发布文件里都不允许出现绝对路径或盘符**。

## 卸载

在**设置 → 插件**里移除这个 bundle，或删掉 profile patch 里的那一行。卸载会连同整行配置一起撤掉。不会留残留：本插件不写任何文件。

## 许可与致谢

MIT —— 见 [LICENSE](LICENSE)。

- 真正干活的逆向能力全部来自 [morluto/rea](https://github.com/morluto/rea)（MIT），本仓库只负责接线。
- MCP 客户端桥属于 DeepSeek Harness，本仓库不分发它。
- 与 DeepSeek 官方及 REA 作者均无隶属关系。