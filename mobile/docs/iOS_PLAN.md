# iOS 上架方案（心愿便利贴 / myaccountbook）

> 目标：把现有 Flutter App（当前仅 Android）扩展到 iOS，并可提交 App Store。
> 现状结论：**代码几乎可直接复用**，但项目里 `ios/` 目录不存在、部分插件需要
> iOS 权限声明、Bundle ID 仍是占位符，需要一台 Mac 完成构建与签名。

---

## 1. 现状盘点（已核对本仓库）

| 项 | 现状 | 对 iOS 的影响 |
| --- | --- | --- |
| `mobile/ios/` 目录 | **不存在**（项目是 Android-only 生成的） | 需 `flutter create` 补生成 iOS 工程 |
| Flutter | 3.24.5 stable | 支持 iOS，无需升级 |
| 纯 Dart 逻辑（state/sync/data/api） | 与平台无关 | 无需改动 |
| `dart:io` 使用 | 仅 `File`/`Directory`/`Platform`（api_client、connectivity、backup_sheets、travel_page、authenticated_image） | iOS 同样支持，无需改 |
| 调试 API 地址 | `constants.dart` 写死 `http://10.0.2.2:3000`（仅安卓模拟器可用） | iOS 模拟器要用 `localhost`，见 §4 |
| 发布 API 地址 | `https://jz.686295.xyz`（HTTPS） | 满足 iOS ATS，无需额外例外 |
| Bundle/包名 | `com.example.mobile`（占位） | 上架前必须换成自有反域名 ID |
| Android 签名 | 仍用 debug key（`build.gradle` 里有 TODO） | iOS 需单独的证书/描述文件，见 §6 |

### 插件的 iOS 适配（全部支持 iOS，标注需要的配置）

| 插件 | iOS 支持 | 需要的 iOS 配置 |
| --- | --- | --- |
| dio / dio_cookie_manager / cookie_jar | ✅ | 无 |
| sqflite / path / path_provider | ✅ | 无 |
| provider / shared_preferences / intl / uuid | ✅ | 无 |
| **image_picker** | ✅ | `Info.plist`：`NSPhotoLibraryUsageDescription`（相册），如用相机再加 `NSCameraUsageDescription` |
| **local_auth** | ✅ | `Info.plist`：`NSFaceIDUsageDescription`（面容 ID 文案） |
| **audioplayers** 6.x | ✅ | 需部署目标 iOS 12+ |
| **file_picker** 8.x | ✅ | 文档选择开箱可用；如启用相册来源则复用相册权限文案 |
| **connectivity_plus** 5.0.2 | ✅ | 无（注意：与安卓端一样固定 5.0.2） |

> 结论：**没有任何一个依赖是 Android 独占**，无需替换插件。主要工作量在
> "补 iOS 工程 + 权限文案 + 签名上架"，而非改业务代码。

---

## 2. 前置条件（硬性）

1. **一台 macOS 机器**（Apple Silicon 或 Intel）。Windows/Linux **无法**编译、签名或提交 iOS 包——这是 Apple 工具链限制，绕不开。
   - 没有 Mac 的可行替代：
     - **云端 Mac CI**：Codemagic / GitHub Actions `macos-latest` runner / Bitrise —— 可无人值守出包并上传 TestFlight。
     - **租用 Mac**：MacStadium、MacinCloud 等远程 Mac。
2. **Xcode**（最新正式版）+ 命令行工具（`xcode-select --install`）。
3. **CocoaPods**（`sudo gem install cocoapods`）—— Flutter iOS 插件靠它集成。
4. **Apple Developer Program 账号**（个人/公司，99 美元/年）——真机调试、TestFlight、App Store 都需要。仅模拟器跑通可暂不付费。

---

## 3. 生成 iOS 工程

在 `mobile/` 目录执行（会保留现有 `lib/`、`android/`、`pubspec.yaml`，只补 iOS 脚手架）：

```bash
flutter create --platforms=ios --org com.yourcompany --project-name myaccountbook .
```

- `--org` 决定 Bundle ID 前缀，最终为 `com.yourcompany.myaccountbook`。请换成你实际拥有的反域名（一旦上架不可改）。
- 生成后执行 `cd ios && pod install`（在 Mac 上）拉取插件的原生依赖。

---

## 4. 必要的工程配置

### 4.1 Info.plist 权限文案（`ios/Runner/Info.plist`）
```xml
<key>NSPhotoLibraryUsageDescription</key>
<string>用于选择记账的票据/花费图片</string>
<key>NSFaceIDUsageDescription</key>
<string>用于用面容 ID 解锁应用</string>
<!-- 若开启相机拍照上传再加： -->
<key>NSCameraUsageDescription</key>
<string>用于拍摄记账票据</string>
```
> 缺这些字符串会导致 App 在调用相册/面容时**直接崩溃**（iOS 强制要求）。

### 4.2 部署目标
`ios/Podfile` 顶部与 Xcode 里 `Runner` 的 Deployment Target 设为 **iOS 12.0**（audioplayers 6.x / local_auth 2.x 的下限）。Flutter 3.24 默认即 12，一般无需改。

### 4.3 调试用 API 地址（重要）
`lib/core/constants.dart` 的调试地址是 `http://10.0.2.2:3000`，**只对安卓模拟器有效**。iOS 模拟器访问本机后端要用 `localhost`：

```bash
flutter run --dart-define=API_BASE_URL=http://localhost:3000
```
（`AppConfig.apiBaseUrl` 已支持 `String.fromEnvironment('API_BASE_URL')` 覆盖，无需改源码。）
发布包走 HTTPS 的 `https://jz.686295.xyz`，满足 ATS，无需在 Info.plist 里开明文例外。

### 4.4 资源
`assets/`（logo、两段 mp3）已在 `pubspec.yaml` 声明，iOS 自动打包，无需额外处理。

### 4.5 App 图标 / 启动屏
用 `flutter_launcher_icons` / `flutter_native_splash`（或 Xcode Assets）生成 iOS 图标集与 LaunchScreen。

---

## 5. 本地验证顺序

```bash
flutter pub get
cd ios && pod install && cd ..
flutter run --dart-define=API_BASE_URL=http://localhost:3000   # iOS 模拟器
```
逐项冒烟测试（重点验证平台相关能力）：
- SQLite 读写、离线记账 / 重连后自动同步（connectivity_plus）
- 相册选图上传（image_picker + 权限弹窗）
- 面容/指纹解锁（local_auth，模拟器可用 Features → Face ID）
- 点击音效（audioplayers）
- 备份导出 / 导入选文件（file_picker + path_provider）
然后接真机 `flutter run --release` 跑一遍（真机需要开发者账号签名）。

---

## 6. 签名与上架

1. **Bundle ID**：在 [App Store Connect](https://appstoreconnect.apple.com) + Developer 后台注册 `com.yourcompany.myaccountbook`。
2. **签名**：Xcode → Runner → Signing & Capabilities，选 Team，开启 **Automatically manage signing**（Xcode 自动生成证书 + Provisioning Profile）。
3. **出包**：
   ```bash
   flutter build ipa --dart-define=API_BASE_URL=https://jz.686295.xyz
   ```
   产物在 `build/ios/ipa/*.ipa`。
4. **上传 TestFlight**：Xcode Organizer 或 `xcrun altool` / Transporter 上传，先内测。
5. **提交审核**：App Store Connect 填写元数据（截图、隐私政策链接、App Privacy 问卷——需如实声明本 App 收集的数据仅用于账本同步）、分级、定价，提交。

---

## 7. 建议的隐私合规要点（审核常见卡点）
- **App Privacy 问卷**：声明数据用途（账本同步）、是否关联用户身份、是否用于追踪（本 App 无第三方广告/追踪 → 选"不追踪"）。
- **隐私政策 URL**：需提供一个可访问的隐私政策页面（可挂在 `jz.686295.xyz` 下）。
- **生物识别**：仅本地校验、不上传，可在文案中说明。

---

## 8. 工作量与路径建议

| 阶段 | 估时（有 Mac 的前提下） |
| --- | --- |
| 生成 iOS 工程 + pod install + 权限/图标配置 | 0.5–1 天 |
| 模拟器 + 真机全功能冒烟、修边角问题 | 1–2 天 |
| 证书/描述文件、首次 TestFlight 打通 | 0.5–1 天 |
| App Store 元数据 + 隐私问卷 + 提审 | 0.5–1 天（审核排队另计 1–3 天） |

**推荐路径**
- 有 Mac：按 §3–§6 直接推进。
- 无 Mac 且想低成本先验证：用 **Codemagic** 免费额度接本仓库，配 iOS workflow 自动 `flutter build ipa` 并推 TestFlight——全程不碰本地 Mac。真机长期调试仍建议备一台 Mac 或云 Mac。

---

## 9. 一句话结论
业务代码无需重写，iOS 化的实质是**补一个 iOS 工程壳 + 4 条权限文案 + 换正式 Bundle ID + 在 Mac/云 Mac 上签名出包**。唯一硬门槛是"必须有 macOS 环境"，其余都是标准 Flutter 上架流程。
