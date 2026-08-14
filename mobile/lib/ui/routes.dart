import 'package:flutter/material.dart';
import '../core/constants.dart';
import '../data/models/ledger.dart';
import 'general/general_ledger_page.dart';
import 'work/work_summary_page.dart';
import 'taoyuan/taoyuan_page.dart';
import 'travel/travel_page.dart';

/// 按账本 kind 路由到对应页面。
Widget pageForLedger(Ledger ledger) {
  switch (ledger.kind) {
    case AppConfig.kindWork:
      return WorkSummaryPage(ledger: ledger);
    case AppConfig.kindTaoyuan:
      return TaoyuanPage(ledger: ledger);
    case AppConfig.kindTravel:
      return TravelPage(ledger: ledger);
    case AppConfig.kindGeneral:
    default:
      return GeneralLedgerPage(ledger: ledger);
  }
}
