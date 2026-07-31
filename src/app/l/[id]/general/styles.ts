// 普通账本各表单共用的样式类。
//
// 拆分前它定义在 GeneralView.tsx 末尾、被文件内多个组件直接引用；
// 拆开之后必须显式共享，否则每个文件各抄一份，改样式时必然漏掉某一处。
//
// 注：TripExpenseModal.tsx 里有一份逐字相同的定义。是否合并到全局共用，
// 等旅游账本那边也拆完再一起判断 —— 现在合并等于在两个尚未稳定的结构之间
// 提前建立耦合。
export const inputCls =
  'w-full px-4 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 focus:outline-none focus:ring-2 focus:ring-ink-400';
