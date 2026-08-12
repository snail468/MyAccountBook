import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:path_provider/path_provider.dart';
import '../../api/api_client.dart';
import '../../core/constants.dart';

/// 带会话 Cookie 的图片加载组件（解决 /api/uploads/* 在 App 内不显示的问题）。[#7]
///
/// Flutter 原生 [Image.network] 使用独立的 HTTP 客户端，不共享 [ApiClient] 的
/// CookieJar，访问需要登录态的 `/api/uploads/*` 路由时因缺 `mab_session` Cookie
/// 被 401 / 404，只显示占位图。这里改用 [ApiClient.instance.dio] 取字节
/// （自动带回会话 Cookie），再以 [Image.memory] 渲染。
///
/// 本地缓存：首次加载后把字节写入临时目录（按解析后 URL 哈希命名），之后的
/// 缩略图/全屏查看直接读本地，秒开且可离线，避免每次重新走网络（用户反馈
/// 「加载慢、不存本地」）。缓存永不过期（活动图片极少变更）。
class AuthenticatedImage extends StatefulWidget {
  final String url;
  final BoxFit fit;
  final double? width;
  final double? height;
  final Widget? placeholder;
  final Widget? errorWidget;

  const AuthenticatedImage({
    super.key,
    required this.url,
    this.fit = BoxFit.cover,
    this.width,
    this.height,
    this.placeholder,
    this.errorWidget,
  });

  @override
  State<AuthenticatedImage> createState() => _AuthenticatedImageState();
}

class _AuthenticatedImageState extends State<AuthenticatedImage> {
  Uint8List? _bytes;
  bool _failed = false;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  /// 解析后 URL → 临时目录下的缓存文件。
  static Future<File> _cacheFile(String resolved) async {
    final dir = await getTemporaryDirectory();
    final cacheDir = Directory('${dir.path}/mab_img_cache');
    if (!await cacheDir.exists()) {
      await cacheDir.create(recursive: true);
    }
    final key = resolved.hashCode.abs().toString();
    return File('${cacheDir.path}/$key${_ext(resolved)}');
  }

  /// 从路径取扩展名（仅保留常见图片格式），其它情况留空。
  static String _ext(String url) {
    final path = Uri.tryParse(url)?.path ?? url;
    final dot = path.lastIndexOf('.');
    if (dot < 0 || dot == path.length - 1) return '';
    final e = path.substring(dot + 1).toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].contains(e) ? '.$e' : '';
  }

  Future<void> _fetch() async {
    final resolved = AppConfig.resolveImageUrl(widget.url);
    // 1) 命中本地缓存 → 直接渲染（秒开 / 离线可用）。
    try {
      final file = await _cacheFile(resolved);
      if (await file.exists()) {
        final cached = await file.readAsBytes();
        if (cached.isNotEmpty) {
          if (!mounted) return;
          setState(() {
            _bytes = cached;
            _loading = false;
          });
          return;
        }
      }
    } catch (_) {
      // 缓存读取失败不致命，继续走网络。
    }

    // 2) 缓存未命中 → 带 Cookie 取字节并写回缓存。
    try {
      final resp = await ApiClient.instance.dio.get<Uint8List>(
        resolved,
        options: Options(responseType: ResponseType.bytes),
      );
      if (!mounted) return;
      final data = resp.data;
      if (data == null || data.isEmpty) {
        setState(() {
          _loading = false;
          _failed = true;
        });
      } else {
        try {
          final file = await _cacheFile(resolved);
          await file.writeAsBytes(data);
        } catch (_) {
          // 写缓存失败不影响本次显示。
        }
        setState(() {
          _bytes = data;
          _loading = false;
        });
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _failed = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return widget.placeholder ??
          const Center(
            child: SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          );
    }
    if (_failed || _bytes == null) {
      return widget.errorWidget ??
          const Center(child: Icon(Icons.broken_image, size: 28));
    }
    return Image.memory(
      _bytes!,
      fit: widget.fit,
      width: widget.width,
      height: widget.height,
    );
  }
}
