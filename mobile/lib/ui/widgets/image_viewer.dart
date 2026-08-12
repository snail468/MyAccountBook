import 'package:flutter/material.dart';

import 'authenticated_image.dart';

/// 原生全屏看图：左右滑动切换 + 双指放大缩小 + 关闭按钮 + 1/N 指示器。[#7]
///
/// 用 [PageView] 承载多张图（桃源活动可能有多图，可左右滑动），每张套
/// [InteractiveViewer] 实现平移与双指缩放；图片走 [AuthenticatedImage]（带登录态
/// Cookie + 本地缓存），因此能显示需鉴权的 /api/uploads/* 且加载快。

/// 打开全屏看图。urls 为图片地址列表，initialIndex 为起始图索引。
void openImageViewer(BuildContext context, List<String> urls, int initialIndex) {
  if (urls.isEmpty) return;
  Navigator.of(context).push(
    MaterialPageRoute(
      fullscreenDialog: true,
      builder: (_) => _ImageViewerScaffold(
        urls: urls,
        initialIndex: initialIndex.clamp(0, urls.length - 1),
      ),
    ),
  );
}

class _ImageViewerScaffold extends StatefulWidget {
  final List<String> urls;
  final int initialIndex;

  const _ImageViewerScaffold({
    required this.urls,
    required this.initialIndex,
  });

  @override
  State<_ImageViewerScaffold> createState() => _ImageViewerScaffoldState();
}

class _ImageViewerScaffoldState extends State<_ImageViewerScaffold> {
  late final PageController _pageController;
  late int _current;

  @override
  void initState() {
    super.initState();
    _current = widget.initialIndex;
    _pageController = PageController(initialPage: widget.initialIndex);
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final multi = widget.urls.length > 1;
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Stack(
          children: [
            // 图片区：PageView 支持左右滑动切换。
            PageView.builder(
              controller: _pageController,
              itemCount: widget.urls.length,
              onPageChanged: (i) => setState(() => _current = i),
              itemBuilder: (_, i) => InteractiveViewer(
                // 双指放大缩小 + 拖拽平移。
                minScale: 0.5,
                maxScale: 4.0,
                panEnabled: true,
                scaleEnabled: true,
                child: Center(
                  child: AuthenticatedImage(
                    url: widget.urls[i],
                    fit: BoxFit.contain,
                    errorWidget: const Center(
                      child: Icon(Icons.broken_image,
                          size: 48, color: Colors.white54),
                    ),
                  ),
                ),
              ),
            ),
            // 顶部：关闭按钮 + 1/N 指示器。
            Positioned(
              top: 8,
              left: 8,
              right: 8,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  IconButton(
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close, color: Colors.white),
                    tooltip: '关闭',
                  ),
                  if (multi)
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: Colors.black54,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        '${_current + 1} / ${widget.urls.length}',
                        style: const TextStyle(color: Colors.white, fontSize: 14),
                      ),
                    )
                  else
                    const SizedBox.shrink(),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
