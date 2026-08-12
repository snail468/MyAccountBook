import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../../api/api_client.dart';
import '../../core/constants.dart';

/// 带会话 Cookie 的图片加载组件（解决 /api/uploads/* 在 App 内不显示的问题）。[#7]
///
/// Flutter 原生 [Image.network] 使用独立的 HTTP 客户端，不共享 [ApiClient] 的
/// CookieJar，访问需要登录态的 `/api/uploads/*` 路由时因缺 `mab_session` Cookie
/// 被 401 / 404，只显示占位图。这里改用 [ApiClient.instance.dio] 取字节
/// （自动带回会话 Cookie），再以 [Image.memory] 渲染。
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

  Future<void> _fetch() async {
    try {
      final resp = await ApiClient.instance.dio.get<Uint8List>(
        AppConfig.resolveImageUrl(widget.url),
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
