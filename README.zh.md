---
description: "在 DeepSeek Harness 内创建、管理和优化简历，使用完整画布编辑器与智能体辅助。"
kind: "package-bundle"
---

# Fast Resume for DeepSeek Harness

[English](README.md) | 中文

## 项目介绍

在 DeepSeek Harness 内完成简历创建、管理、编辑与智能体优化。通过多页画布自由调整文字、图片、形状和嵌套图层，从六套模板开始创作，并导出 PDF、PNG 或可继续编辑的 JSON。直接使用 Harness 已配置的模型提出措辞或排版修改，预览后应用到同一份简历。`dsh-fast-resume` 作为可选插件配置层安装，无需注册额外的 Fast Resume 账号。

![简历工作台：真实缩略图、搜索与文档管理](docs/images/resume-workspace.jpg)

## 目录

- [功能亮点](#features)
- [界面预览](#screenshots)
- [安装插件](#use-this-package)
- [使用方式与实例](#usage)
- [配置与存储](#configuration-and-storage)
- [开发与构建](#understand-the-implementation)
- [智能体交互](#model-experience)
- [使用边界与许可证](#known-limitations-and-deferred-work)

-----

<a id="features"></a>
## 功能亮点

将可视化编辑与智能体辅助放在同一个工作流中。

| 能力 | 可以做什么 |
|---|---|
| 多图层画布 | 编辑文字、图片和形状，组合嵌套图层，调整层级、可见性、锁定、对齐及元素属性。 |
| 模板与页面 | 从六套模板开始，管理多页简历、缩放画布，自由拖拽或收起左右侧栏。 |
| 简历管理 | 浏览真实首页缩略图，按名称搜索、排序、重命名、创建副本及删除简历。 |
| 版本历史 | 保存命名版本，预览历史页面，将选定版本恢复为新的当前修订。 |
| 智能体辅助 | 将当前简历和所选图层上下文带入普通 Harness 对话，预览、应用或撤销持久化修改提案。 |
| 导入与导出 | 导入 JSON、Markdown、Word 或 PDF；将全部页面导出为 PDF、当前页面导出为 PNG，或保存可编辑 JSON 备份。 |

-----

<a id="screenshots"></a>
## 界面预览

以下截图来自实际安装的 Harness Web 插件，使用验证流程中的合成简历展示功能。

### 简历画布

需要更大画布时可收起侧栏，也可通过右侧工具栏重新展开模板、图层和属性面板。拖拽越过最小阈值时，侧栏会自动收起。

![简历画布：左右侧栏收起后的双页简历编辑区](docs/images/resume-editor.jpg)

### 可视化版本历史

通过真实保存页面的缩略图识别不同版本。选中版本后可切换预览页面，恢复时保留已有历史。

![版本历史：缩略图、命名保存与页面预览](docs/images/version-history.jpg)

-----

<a id="use-this-package"></a>
## 安装插件

需要 **DeepSeek Harness 0.2.1-rc.2**、Node **`^22.19.0 || >=24.0.0`**，并确保 PATH 中可用 pnpm。当前仓库中的插件版本为 `0.1.0`。

获取已构建的 `.tgz` 安装包，或按[源码构建步骤](#understand-the-implementation)生成安装包，然后安装到实际使用的配置：

```sh
dsh plugin --profile web add /absolute/path/dsh-fast-resume-0.1.0.tgz
dsh --profile web
```

在 Harness 侧栏打开**简历**，即可看到已保存的简历以及新建、导入入口。

如果所用 npm 仓库已发布 `dsh-fast-resume@0.1.0`，也可以直接通过包名安装：

```sh
dsh plugin --profile web add dsh-fast-resume@0.1.0
```

对于已初始化的桌面配置，可将 `web` 替换为 `desktop` 并重启应用。已有浏览器验收覆盖 Web，未声称完成桌面交互验证。

-----

<a id="usage"></a>
## 使用方式与实例

### 1. 创建与编辑简历

1. 点击**新建简历**，输入名称，通过缩略预览选择模板或空白文档。已保存的简历可点击名称或**进入编辑**打开。
2. 在左侧面板切换模板、查看图层和管理页面；选中元素后，在属性面板调整文字、尺寸、颜色或链接。
3. 拖拽分隔条调整工作区宽度，通过工具栏面板图标收起或展开侧栏；当前工作区会记住展开宽度。
4. 等待状态显示已保存，或点击保存图标、使用 `Ctrl+S`。

编辑器进入后，默认按中间画布宽度尽量放大简历，长页面可纵向滚动。工具栏缩放保持视口中心，滚轮缩放保持鼠标位置；放大超过画布宽度后可横向滚动。“适应宽度”和“适应窗口”可分别恢复自动宽度适配和整页适配，手动缩放不会被面板调整覆盖。

### 2. 让 Harness 智能体辅助优化

先在 Harness 配置模型并保存当前草稿，然后打开编辑器中的 **AI助手**并提交指令。插件会将文档 ID、修订及所选图层带入普通 Harness Session。

示例：在保留事实的前提下优化表述。

> 请读取当前简历，面向前端工程师岗位优化工作经历的表述。
> 保留已有事实、日期和数据，不要虚构成果或技能。
> 先生成修改提案，待我预览确认后再应用。

在助手面板查看修改前后预览，再应用需要的提案。已应用提案可撤销；若与后续修改重叠，会报告冲突而不是覆盖。

### 3. 保存阶段版本与对比历史

点击版本历史图标，输入“前端岗位投递版”等名称并保存命名版本。选中缩略图即可查看该快照，多页简历可切换预览页面。当前草稿保存后才能恢复历史；恢复会创建新修订并保留已有版本。

### 4. 导入与导出文档

通过**导入**打开已有 JSON 备份、Markdown、Word 或 PDF。导出 PDF 可保留全部页面，PNG 导出当前页面，JSON 用于可继续编辑的备份。PDF/Word 导入提取语义内容，不保证复刻原版式；PDF/PNG 导出需要连接的 Harness 客户端渲染器。

可将文件拖放到导入区，也可粘贴 Markdown 文本。读取文件和导入期间弹窗保持打开，校验或导入失败会直接在弹窗内提示。

-----

<a id="configuration-and-storage"></a>
## 配置与存储

简历、历史、提案和导出文件保存在当前配置目录内，默认位置为 `<profile>/data/fast-resume`。自动保存会检查修订；其他客户端或智能体修改同一简历时，未保存草稿会被保留，并提供重新加载及另存副本选项。恢复草稿需要明确选择。

<details>
<summary>高级配置</summary>

安装的[补丁](cordis.patch.yml)添加 `fast-resume` 和 `fast-resume-tools`。可在配置目录的 `cordis.patch.yml` 中覆盖 Host 配置行：

```yaml
- id: fast-resume
  config:
    autosaveDelayMs: 2000
    renderPixelRatio: 2
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `wheelZoomDirection` | `auto` | Ctrl/⌘ + 滚轮缩放方向：`auto` 根据浏览器设备反转标记校正，`standard` 按原始滚动增量处理，`reversed` 用于实际体验反向的设备。不按修饰键时仍正常滚动画布。显式反向也会反转以 Ctrl+wheel 传递的触控板捏合；触控板原生捏合应使用 `auto`。 |
| `storageDir` | `<profile>/data/fast-resume` | 原子文档封套、历史、提案、回执和导出文件 |
| `autosaveDelayMs` | `2000` | 浏览器保存防抖间隔 |
| `maxDocumentBytes` / `maxImportBytes` | 各 `10485760` | 文档及渲染响应、导入文件的字节上限 |
| `maxVersions` | `100` | 保留的文档版本数 |
| `renderTimeoutMs` / `rendererLeaseMs` | `30000` / `15000` | 渲染截止时间与可续期客户端租约 |
| `maxRenderRequests` / `maxRenderPixels` | `8` / `32000000` | 等待渲染的请求数及解码后的 PNG 像素上限 |
| `renderPixelRatio` | `2` | PNG 栅格倍率，允许范围 `0.1`–`4` |
| `lockWaitMs` / `maxProposalOperations` | `10000` / `256` | 跨进程锁等待及每个提案的操作上限 |
| `frameConnectTimeoutMs` / `rendererPollIntervalMs` | `15000` / `1000` | 编辑器连接期限及后台渲染轮询；轮询必须短于租约 |
| `refreshIntervalMs` / `bridgeTimeoutMs` | `2000` / 渲染期限加连接期限 | 文档刷新及消息请求期限；消息期限不得短于导出期限 |

</details>

卸载插件：

```sh
dsh plugin --profile web remove dsh-fast-resume
```

卸载后保留配置目录内的简历和导出文件，重新安装到同一配置即可继续使用。

-----

<a id="understand-the-implementation"></a>
## 开发与构建

源码项目可以脱离原 Fast Resume 和 Harness 项目目录独立构建。在插件项目根目录执行：

```sh
npm ci --workspaces=false
npm run build --workspaces=false
npm pack --workspaces=false --ignore-scripts
```

构建得到 `dsh-fast-resume-0.1.0.tgz`。发布前应通过 `dsh plugin` 测试实际安装包；包内包含 Host、工具、Client、编辑器 HTML、安装补丁及文档。

### 本地 Harness 联调

确保 Node 和 pnpm 在 PATH 中，`npm run dev:setup --workspaces=false` 会构建并检查两个编译面，通过 `dsh plugin` 将 `link:` 依赖安装到 `.dev/home/profiles/web`。在 Harness 工作区内，先执行 `pnpm run build:artifacts` 构建 Harness；辅助脚本会使用 `apps/cli/lib/bin.js`。在其他目录中，它使用 PATH 上的 `dsh`，也可以通过 `DSH_DEV_CLI` 指定启动器文件。

```sh
npm run dev:setup --workspaces=false
npm run dev --workspaces=false
```

打开 Harness 在终端打印的带认证信息的地址（默认端口 `58358`），进入简历空间。辅助脚本监听源码、上游代码、语言资源及构建配置，重新构建前停止 Web，两个编译面均通过后重启。构建失败时 Web 保持停止，修复并保存源码后会重新构建。修改代码前请保存编辑器内容；中断的草稿使用正常的恢复流程。Ctrl+C 停止监听器及其子进程。仅构建并启动、不监听时使用 `npm run dev:start --workspaces=false`；Web 参数放在 `--` 后，例如 `npm run dev --workspaces=false -- --port 58359`。

`.dev/` 已被 Git 忽略，用于保存开发 profile、简历及本地配置。测试智能体辅助功能时，在这个开发 Web 界面配置模型；脚本不会复制其他 profile 的凭据。可显式设置 `DSH_HOME` 使用其他目录。全新克隆 Harness 后，执行 `git submodule update --init --recursive plugins/fast-resume` 初始化此目录。插件改动在此目录内提交并推送，再在 Harness 中暂存更新后的子模块版本。

<details>
<summary>实现概览</summary>

[安装补丁](cordis.patch.yml)添加 `fast-resume` 与 `fast-resume-tools`。Host 负责修订、原子文件写入、持久化提案及修改回执。编辑器在不透明来源 iframe 内运行，通过校验后的 MessagePort 通信，不持有模型凭据，也不调用原 Fast Resume 服务端。保留的上游源码及其哈希记录在 [upstream-content.json](upstream-content.json)。

</details>

-----

<a id="model-experience"></a>
## 智能体交互

简历工具在普通 Agent 作用域执行，请求和结果保留在 Harness Session 日志中。智能体可以读取当前文档、提出修改、应用或撤销提案、检查历史并导出制品。读取图片使用资源引用，导出结果包含制品路径与元数据，而非内嵌 base64 数据。

-----

<a id="known-limitations-and-deferred-work"></a>
## 使用边界与许可证

- 原编辑器标签目前为中文，Harness 集成外层支持中英双语。
- 智能体辅助使用 Harness 中的模型配置；应用到简历前请预览修改提案。
- 远程图片可能加载失败或阻止画布导出，插件会明确报告此类失败。
- Fast Resume 保留 **PolyForm Noncommercial 1.0.0** 许可证。商业使用需要上游所有者另行书面许可，详见 [LICENSE](LICENSE)、[NOTICE](NOTICE) 和[商业许可条款](COMMERCIAL_LICENSE.md)。

已执行检查及平台覆盖范围见[验证报告（English）](docs/verification.md)（[中文](docs/verification.zh.md)）。源码与问题反馈：[lianzxah/dsh-fast-resume](https://github.com/lianzxah/dsh-fast-resume)。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护说明</summary>

截图使用合成简历；使用流程变化时，同步更新两种语言的文档。

</details>
