---
description: "独立 Harness 配置层，提供 Fast Resume 画布编辑器、文档管理和 Session 工具。"
kind: "package-bundle"
---

# dsh-fast-resume

[English](README.md) | 中文

## 概览

此可选配置层将完整 Fast Resume 画布编辑器嵌入 Harness，并提供配置目录内的简历管理与智能体工具，包含六套模板、递归图层、属性、页面、导入、历史版本及 PDF、PNG、JSON 导出。智能体辅助使用普通 Harness Session 及其已配置模型，不接入 Fast Resume 登录、账号管理或独立模型凭据。

简历工作台提供真实首页预览、名称搜索与排序、实际简历及页数统计和清晰的编辑操作。极光光晕与克制动效适配 Harness 浅色/深色、键盘焦点及减少动态效果偏好；仅加载可见卡片预览，失效时取消并释放。 删除确认框展示准确的简历及修订信息，说明版本历史删除后果，并提供支持键盘操作的取消/确认、处理中和失败反馈。 编辑器上方仅保留简历空间、标题和状态，下方图标工具栏集中保存、历史及面板操作。版本历史提供真实保存页面缩略图、页面选择和命名版本保存；恢复会创建新的当前修订，并要求草稿已保存。 左右编辑侧栏按比例缩放，越过最小阈值后自动收起，可通过分隔条或工具栏重新展开，并恢复此前展开宽度。

## 目录

- [使用此包](#use-this-package)
- [配置与存储](#configuration-and-storage)
- [实现说明](#understand-the-implementation)
- [构建与发布](#build-and-publish)
- [模型体验](#model-experience)
- [已知限制与待办](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

需要 Harness **0.2.1-rc.2**、PATH 中的 pnpm，以及 Node `^22.19.0 || >=24.0.0`。将构建后的安装包加入实际使用的配置：

```sh
dsh plugin --profile web add /absolute/path/dsh-fast-resume-0.1.0.tgz
dsh --profile web
```

安装后，在 Harness 侧栏打开**简历**。新建或导入简历，选择模板，使用原版画布、图层和属性面板编辑。保存执行版本检查；其他客户端或智能体修改同一文档时，保留未保存草稿，并提供重新加载、另存副本选项。恢复草稿需要明确选择。

使用编辑器的辅助控件，携带文档 ID、版本及选中图层打开普通 Harness 对话；模型仍在 Harness 中正常配置。在编辑器中检查持久化提案、应用或撤销已应用提案。撤销保留后续无关编辑，并拒绝重叠冲突。

```sh
dsh plugin --profile web remove dsh-fast-resume
```

移除插件保留配置目录中的简历和导出文件，重新安装到同一配置即可继续使用。对于已初始化的桌面配置，将 `web` 替换成 `desktop` 并重启应用。以下仓库安装命令仅在包所有者发布后可用：

```sh
dsh plugin --profile web add dsh-fast-resume@0.1.0
```

-----

<a id="configuration-and-storage"></a>
## 配置与存储

安装的[补丁](cordis.patch.yml)添加 `fast-resume` 和 `fast-resume-tools`。可在配置目录的 `cordis.patch.yml` 中覆盖 Host 配置行：

```yaml
- id: fast-resume
  config:
    autosaveDelayMs: 2000
    renderPixelRatio: 2
```

| 字段 | 默认值 | 含义 |
|---|---|---|
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

JSON 导出是可继续编辑的 Fast Resume 备份；PDF 导出全部页面，PNG 导出选中页面。PDF 和 PNG 需要连接到同一 Host 的 Harness 客户端，其后台渲染器在关闭简历面板后仍可工作。Host 检查完整二进制、尺寸和页数，存储制品后才返回回执。回执尺寸在 PDF、JSON 中使用毫米，在 PNG 中使用像素。

-----

<a id="understand-the-implementation"></a>
## 实现说明

<details>
<summary>实现细节</summary>

Host 负责乐观版本控制、原子文件替换、跨进程锁、持久化提案及幂等修改回执。生成的认证 Remote API 服务于轻量 Harness Client 插件；完整编辑器运行于打包的不透明来源 iframe，通过随机数绑定的 MessagePort 传输已校验请求。它不持有模型凭据，也不依赖原服务端；浏览器草稿恢复存储由父页面持有。

渲染器接收不可变的已提交文档及约定倍率；请求取消、超时、渲染器断开及插件卸载会使待处理导出失效。源代码分发保留上游源码和基线哈希；发布包附带 [upstream-content.json](upstream-content.json)、[LICENSE](LICENSE)、[NOTICE](NOTICE) 及[商业许可条款](COMMERCIAL_LICENSE.md)。

</details>

-----

<a id="build-and-publish"></a>
## 构建与发布

源代码项目可以脱离两个原始目录独立构建，在其根目录使用受支持的 Node 版本执行：

```sh
npm ci --workspaces=false
npm run build --workspaces=false
node node_modules/vitest/vitest.mjs run tests upstream --maxWorkers=1
node scripts/check-consumer.mjs
node scripts/check-release.mjs
npm pack --workspaces=false --ignore-scripts
```

包发布 ESM Host、工具、Client、公共类型及生成的 Typert 导出，并包含编辑器 HTML 和安装补丁，不提供自定义应用启动程序。发布前通过 `dsh plugin` 测试安装包，再由所有者使用 npm 账号发布；npm 包名为 `dsh-fast-resume`，源码仓库为 [lianzxah/dsh-fast-resume](https://github.com/lianzxah/dsh-fast-resume)。已执行检查和验证范围见[验证报告](docs/verification.zh.md)。

源码项目还提供 `test:integration`、`test:e2e`、`test:snapshot` 和 `check:release`。安装检查需要 `DSH_TEST_CLI`、`DSH_TEST_REPLAY` 及安装包参数，`DSH_TEST_REGISTRY` 可选择包仓库。`test:snapshot` 从实际录制的真实 Session 派生两次模型调用，无模型凭据执行已安装的 `resume_read`。脚本化六工具集成检查分别覆盖卸载重装与禁用重启的数据保留。

-----

<a id="model-experience"></a>
## 模型体验

工具支持列出、新建、读取文档，提出和应用操作，撤销修改，检查或恢复历史，以及导出制品。它们在普通 Agent 作用域执行，请求和结果保留在 Session 日志中。读取结果将内嵌图片字节替换成稳定的资源引用，导出工具结果仅包含制品路径和实测元数据，不传入 base64 负载。编辑器提示引用文档，智能体通过已记录的工具读取内容。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与待办

Fast Resume 保留 **PolyForm Noncommercial 1.0.0** 许可证，商业使用需要上游所有者另行书面许可，插件不改变这些条款。原编辑器标签仍为中文，Harness 外层支持中英双语。Word 和 PDF 导入提取语义内容，不复刻任意源文档版式。无界面的 PDF、PNG 导出需要连接浏览器渲染器；不可信的远程图片可能加载失败或阻止画布导出，此时明确报告错误。真实模型优化需要用户正常配置 Harness 模型。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护说明</summary>

无需修改 Harness 循环或已发布 Session 格式，项目使用自身的依赖锁文件独立构建。

</details>
