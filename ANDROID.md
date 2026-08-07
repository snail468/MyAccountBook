# 安卓 APK（TWA）构建与跨设备同步

本项目是 PWA，安卓上最干净的"安装包"方案是 **TWA（Trusted Web Activity）**：
APK 本身只是个壳，运行时加载你**已部署的 PWA**。包最小、随网页自动更新、
不需要在手机本地维护应用逻辑。

本仓库直接提交了一份**手写的最小 TWA Android 工程**（`android/` 目录），
由 GitHub Actions 里的 Gradle 直接编译、用签名密钥库产出**自签名的 release APK**。
（早期方案用过 Bubblewrap，但其 `init`/`build` 在 CI 无 TTY 时会交互挂起，
故改为提交可读、可改的 Gradle 工程，更可控。）

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
2. 该域名公网可访问（手机上的 TWA 运行时要能打开它；但 CI 构建本身**不再**需要拉 manifest——
   工程里 host 通过构建变量 `TWA_HOST` 注入）。

## `android/` 工程简介

| 文件 | 作用 |
|---|---|
| `android/settings.gradle` / `build.gradle` / `gradle.properties` | Gradle 与 AGP 配置 |
| `android/app/build.gradle` | 包名、签名配置、`manifestPlaceholders`（host + 主题色注入） |
| `android/app/src/main/AndroidManifest.xml` | TWA `LauncherActivity` + 各项 meta-data |
| `android/app/src/main/res/...` | 启动图标（mipmap）、颜色、Splash 主题 |
| `android/app/proguard-rules.pro` | 空（未开启混淆） |

- 包名：`com.myaccountbook.twa`
- host：`build.gradle` 的 `manifestPlaceholders.defaultUrl` 读取环境变量 `TWA_HOST`，
  构建时注入，无需改动代码即可换部署地址。
- 主题色：状态栏/导航栏 `#c8a2d8`、Splash `#f5efff`，与 PWA 一致（同样走占位符，可改）。

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

CI 流程：`setup-java 17` → `android-actions/setup-android`（装 SDK + 接受许可）→
装 `platforms;android-34` + `build-tools;34.0.0` → 准备签名密钥库 →
下载 Gradle 8.9 → `gradle assembleRelease` 产出签名 APK → 上传 Artifact。

构建完成后：

- 在 Actions 运行的 **Artifacts** 里下载 `myaccountbook-apk`，文件名
  `myaccountbook-com.myaccountbook.twa.apk`，传到手机安装即可。
- 在任务 **Summary** 里会打印两段内容：
  1. 若本次是"自举密钥"，会给出密钥库 base64 → 存为 `TWA_KEYSTORE_BASE64` Secret，
     并设 `TWA_KEYSTORE_PASSWORD`。**务必存**，否则下次密钥变化会导致已装 APK 无法覆盖更新。
  2. 隐藏地址栏用的 `assetlinks.json` 已由构建流程**自动生成并提交到 main**（见下），无需手动保存。

## 隐藏地址栏（数字资产校验，已自动化）

不配置也能正常安装使用，仅可能多一条地址栏。要全屏无栏，需要 `assetlinks.json`
声明。这部分**已全自动**：

每次 Android 构建时，CI 会直接从当前签名密钥库算出 SHA256 指纹（十六进制冒号分隔格式，
Android 要求的正确格式），写入 `public/.well-known/assetlinks.json` 并**自动提交回 main**。
由于本仓库的 `ci.yml` 在 push 到 main 时会重建并推送 Docker 镜像，该文件会随下次部署
自动托管到 `https://你的域名/.well-known/assetlinks.json`，无需任何手动操作。

前提：必须先完成"存密钥库 secret"（第①步），指纹才稳定；否则每次自举密钥都会变，
自动提交的 assetlinks 指纹也会随之更新（同样可用，只是密钥不固定、无法覆盖升级旧 APK）。

## 排错

- **build 报 host 未设置**：去 Settings 设 `TWA_HOST`，或手动触发时填 host。
- **首次构建后 APK 装不上/覆盖失败**：多半是密钥库每次都自举生成导致指纹变化，
  按 Summary 把 base64 存成 `TWA_KEYSTORE_BASE64` Secret 后重新构建即可。
- **AGP / Gradle 版本不兼容**：`android/app/build.gradle` 用 AGP 8.5.2，
  `android.yml` 用 Gradle 8.9；如需升级请成对调整。
- **想改包名 / 图标 / 主题色**：直接改 `android/` 工程，重新打标签构建即可。
