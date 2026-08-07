# 安卓 APK（TWA）构建与跨设备同步

本项目是 PWA，安卓上最干净的"安装包"方案是 **TWA（Trusted Web Activity）**：
APK 本身只是个壳，运行时加载你**已部署的 PWA**。包最小、随网页自动更新、
构建在 GitHub Actions 里用纯 Node 的 Bubblewrap 完成，无需维护 Android 工程。

## 跨设备同步原理（重要）

应用数据**本就集中存在服务端 SQLite**（你已有的 Docker 部署），不是存在手机本地。
因此：

> 多台手机/平板用**同一个账号**登录你部署的那个 HTTPS 地址，数据自然跨设备同步。
> 离线时记的账会通过 `offlineQueue`（clientId 幂等）在网络恢复后合并。

**APK 不参与数据存储，也不新增任何同步代码。** 同步的前提只有一个：
你的 Docker 部署必须是 **HTTPS 公网可达**的域名。

## 前置条件

1. 你的云服务器已用 Docker 部署本项目，且配置了 **HTTPS 域名**（如 `https://book.example.com`）。
   TWA 强制 HTTPS，纯 http / 内网地址都无法加载。
2. 该域名公网可访问（GitHub Actions 构建时要能拉到 `/manifest.json`）。

## 配置仓库 Secrets / Variables

在 GitHub 仓库 **Settings → Secrets and variables → Actions** 里：

| 类型 | 名称 | 说明 |
|---|---|---|
| Variable | `TWA_HOST` | PWA 公网地址，含 `https://`、不含末尾斜杠，如 `https://book.example.com` |
| Secret | `TWA_KEYSTORE_BASE64` | 签名密钥库 base64（首次构建会自动生成并打印，复制进来即可） |
| Secret | `TWA_KEYSTORE_PASSWORD` | 密钥库密码（首次自举默认 `twa12345`，见下） |

## 触发构建

`.github/workflows/android.yml` 不会在每次 push 时跑，避免浪费时长。触发方式：

- **打标签**：`git tag v1.0.0 && git push origin v1.0.0`
- **手动**：Actions 页面 → Android APK (TWA) → Run workflow（可填 host 覆盖变量）

构建完成后：

- 在 Actions 运行的 **Artifacts** 里下载 `myaccountbook-apk`（universal APK），传到手机安装即可。
- 在任务 **Summary** 里会打印两段内容：
  1. 若本次是"自举密钥"，会给出密钥库 base64 → 存为 `TWA_KEYSTORE_BASE64` Secret，
     并设 `TWA_KEYSTORE_PASSWORD`。**务必存**，否则下次密钥变化会导致已装 APK 无法覆盖更新。
  2. 可选的 `assetlinks.json` 片段（见下）。

## 可选：隐藏地址栏（数字资产校验）

不配置也能正常安装使用，仅可能多一条地址栏。要全屏无栏，把 Summary 里打印的
`assetlinks.json` 内容保存到项目 `public/.well-known/assetlinks.json`
（Docker 部署会自动托管到 `https://你的域名/.well-known/assetlinks.json` 即可）。
该指纹必须与签名密钥一致——所以请**先完成上面"存密钥库 secret"再配置此处**。

## 排错

- **build 报 host 未设置**：去 Settings 设 `TWA_HOST`，或手动触发时填 host。
- **Bubblewrap 拉不到 manifest**：确认 `TWA_HOST/manifest.json` 公网可访问且是 HTTPS。
- **首次构建后 APK 装不上/覆盖失败**：多半是密钥库每次都自举生成导致指纹变化，
  按 Summary 把 base64 存成 `TWA_KEYSTORE_BASE64` Secret 后重新构建即可。
- **Bubblewrap 版本告警**：工作流固定 `@bubblewrap/cli@1.20.0`；若官方大版本变更导致
  `init` 参数变化，按报错调整版本号或参数即可。
