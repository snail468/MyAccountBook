import 'package:flutter/material.dart';
import 'share/share_page.dart';
import 'invite/invite_page.dart';
import 'work/work_expenses_page.dart';

/// 集中注册与网页端同语义的深链路由，便于通过 `Navigator.pushNamed` 或平台深链直达：
///   /share/<token>  → 只读分享页（对齐网页 src/app/share/[token]）
///   /invite/<token> → 邀请接受页（对齐网页 src/app/invite/[token]）
///   /work/expenses  → 工作出项汇总页（对齐网页 src/app/work/expenses）
Route<dynamic>? appOnGenerateRoute(RouteSettings settings) {
  final name = settings.name ?? '/';
  final segments = Uri.parse(name).pathSegments;
  if (segments.length == 2 && segments[0] == 'share') {
    return MaterialPageRoute(builder: (_) => SharePage(token: segments[1]));
  }
  if (segments.length == 2 && segments[0] == 'invite') {
    return MaterialPageRoute(builder: (_) => InvitePage(token: segments[1]));
  }
  if (name == '/work/expenses') {
    return MaterialPageRoute(builder: (_) => const WorkExpensesPage());
  }
  return null;
}
