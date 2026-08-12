import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../api/api_client.dart';
import '../../api/upload_api.dart';
import '../../core/constants.dart';
import '../../core/exceptions.dart';
import '../../theme/design_tokens.dart';

/// 记账图片选择：本地相册选择 → 上传到服务端 → 返回 URL 列表。
///
/// 取代原先"填图片链接"的文本框（需求 [#8]）。离线或上传失败时给出提示，
/// 并保留"粘贴链接"作为兜底，避免用户在网络异常时彻底无法添加图片。
class ImagePickerField extends StatefulWidget {
  final List<String> value;
  final ValueChanged<List<String>> onChanged;
  final int max;
  final String label;

  const ImagePickerField({
    super.key,
    required this.value,
    required this.onChanged,
    this.max = 4,
    this.label = '小票/图片',
  });

  @override
  State<ImagePickerField> createState() => _ImagePickerFieldState();
}

class _ImagePickerFieldState extends State<ImagePickerField> {
  final _url = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _url.dispose();
    super.dispose();
  }

  void _toast(String msg) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(msg)));
  }

  String _errMsg(Object e) {
    if (e is ApiException) return e.message;
    if (e is NetworkException) return '网络不可用，无法上传图片';
    return '图片上传失败';
  }

  Future<void> _pickAndUpload() async {
    final picked = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      maxWidth: 1800,
      maxHeight: 1800,
      imageQuality: 85,
    );
    if (picked == null) return;
    if (widget.value.length >= widget.max) {
      _toast('最多 ${widget.max} 张');
      return;
    }
    setState(() => _busy = true);
    try {
      final url = await UploadApi(ApiClient.instance).uploadImage(picked);
      if (mounted) widget.onChanged(<String>[...widget.value, url]);
    } catch (e) {
      if (mounted) _toast(_errMsg(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pasteLink() async {
    _url.clear();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('粘贴图片链接'),
        content: TextField(
          controller: _url,
          autofocus: true,
          decoration: const InputDecoration(hintText: 'https://...'),
          onSubmitted: (_) => Navigator.of(ctx).pop(true),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('添加'),
          ),
        ],
      ),
    );
    final v = _url.text.trim();
    if (ok == true && v.isNotEmpty && widget.value.length < widget.max) {
      widget.onChanged(<String>[...widget.value, v]);
    }
  }

  Widget _thumb(String url) => Image.network(
        AppConfig.resolveImageUrl(url),
        fit: BoxFit.cover,
        width: double.infinity,
        height: double.infinity,
        errorBuilder: (_, __, ___) => const Center(
          child: Icon(Icons.broken_image_outlined, size: 28),
        ),
        loadingBuilder: (_, child, progress) => progress == null
            ? child
            : const Center(child: CircularProgressIndicator(strokeWidth: 2)),
      );

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink500 = isDark ? AppColors.darkInk500 : AppColors.lightInk500;
    final ink400 = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final tileBg =
        isDark ? AppColors.darkSurface : AppColors.lightSurfaceSubtle;
    final dashed =
        isDark ? AppColors.darkBorderDashed : AppColors.lightBorderDashed;
    final red = isDark ? AppColors.darkSemanticRed : AppColors.lightSemanticRed;
    final iconColor = isDark ? AppColors.darkInk100 : AppColors.lightSurface;
    final addIcon = isDark ? AppColors.darkInk400 : AppColors.lightInk400;
    final linkColor =
        isDark ? AppColors.darkSemanticBlue : AppColors.lightSemanticBlue;

    final children = <Widget>[
      for (var i = 0; i < widget.value.length; i++)
        Stack(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Container(color: tileBg, child: _thumb(widget.value[i])),
            ),
            Positioned(
              top: 4,
              right: 4,
              child: InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: () {
                  final next = <String>[...widget.value]..removeAt(i);
                  widget.onChanged(next);
                },
                child: Container(
                  width: 22,
                  height: 22,
                  decoration: BoxDecoration(
                    color: red,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  alignment: Alignment.center,
                  child: Icon(Icons.close, size: 14, color: iconColor),
                ),
              ),
            ),
          ],
        ),
      if (widget.value.length < widget.max)
        InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: _busy ? null : _pickAndUpload,
          child: Container(
            decoration: BoxDecoration(
              color: tileBg,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: dashed, width: 2),
            ),
            child: _busy
                ? const Center(child: CircularProgressIndicator(strokeWidth: 2))
                : Center(child: Icon(Icons.add, size: 28, color: addIcon)),
          ),
        ),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(widget.label, style: TextStyle(color: ink500, fontSize: 12)),
        const SizedBox(height: 8),
        GridView.count(
          crossAxisCount: 3,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 8,
          crossAxisSpacing: 8,
          childAspectRatio: 1,
          children: children,
        ),
        const SizedBox(height: 4),
        Row(
          children: [
            Text('从相册选择，最多 ${widget.max} 张',
                style: TextStyle(color: ink400, fontSize: 10)),
            const SizedBox(width: 8),
            GestureDetector(
              onTap: _busy ? null : _pasteLink,
              child: Text('或粘贴链接',
                  style: TextStyle(color: linkColor, fontSize: 10)),
            ),
          ],
        ),
      ],
    );
  }
}
