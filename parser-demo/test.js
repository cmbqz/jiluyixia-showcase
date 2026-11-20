/**
 * test.js —— quantifier.js 的断言集
 *
 * 运行：node test.js
 * 退出码：0 = 全部通过；非 0 = 失败条数
 *
 * 断言分三组：
 *   A. 该剥的剥掉（数词+量词 / 个 / 量词+白名单命中）
 *   B. 不该剥的留着（无动词 / 量词后接表外词）—— 这组才是这套设计的价值所在
 *   C. 边界（金额形态、空输入）
 */

"use strict";

const { parseItem, stripQuantifier } = require("./quantifier.js");

let pass = 0, fail = 0;
const failures = [];

function eq(actual, expected, label) {
  if (String(actual) === String(expected)) {
    pass++;
  } else {
    fail++;
    failures.push(`${label}\n    期望: ${JSON.stringify(expected)}\n    实际: ${JSON.stringify(actual)}`);
  }
}

/* ── A. 该剥的剥掉 ─────────────────────────────────────── */

// 数词 + 量词：无条件剥，剥完名字仍可读
eq(parseItem("买了一杯咖啡15").name,      "咖啡",   "A1 数词+量词");
eq(parseItem("买了两箱苹果30").name,      "苹果",   "A2 数词+量词(两)");
eq(parseItem("买了一盒牛奶12").name,      "牛奶",   "A3 数词+量词(一)");
eq(parseItem("买了3盒鸡蛋20").name,       "鸡蛋",   "A4 数词+量词(阿拉伯)");
eq(parseItem("买了一杯茅台288").name,     "茅台",   "A5 数词+量词，即使后词不在白名单也剥");

// 「个」单独处理
eq(parseItem("买了个苹果5").name,         "苹果",   "A6 孤立「个」");
eq(parseItem("买了一个苹果5").name,       "苹果",   "A7 数词+个");
eq(parseItem("买了十个鸡蛋10").name,      "鸡蛋",   "A8 中文数词+个");

// 量词 + 白名单命中
eq(parseItem("买了盒月饼68").name,        "月饼",   "A9 量词+白名单命中");
eq(parseItem("买了盒草莓25").name,        "草莓",   "A10 量词+白名单命中(草莓)");
eq(parseItem("买了双鞋199").name,         "鞋",     "A11 量词+白名单命中(双/鞋)");
eq(parseItem("买瓶洗发水39").name,        "洗发水", "A12 量词+白名单命中(瓶/洗发水)");
eq(parseItem("买了两斤排骨45").name,      "排骨",   "A13 数词+量词(斤)");
eq(parseItem("买了一套护肤品299").name,   "护肤品", "A14 数词+量词(套)");

/* ── B. 不该剥的留着 ───────────────────────────────────── */

// 无消费动词 → 完全不碰量词
eq(parseItem("台灯89").name,              "台灯",   "B1 无动词不剥(台灯)");
eq(parseItem("盘心20").name,              "盘心",   "B2 无动词不剥(盘心)");
eq(parseItem("双人床1200").name,          "双人床", "B3 无动词不剥(双人床)");

// 量词后接表外词 → 保留，这是黑名单方案被击穿的那个点
eq(parseItem("买了盒仔茶12").name,        "盒仔茶", "B4 量词+表外词保留(盒仔茶)");
eq(parseItem("买了双筒袜35").name,        "双筒袜", "B5 量词+表外词保留(双筒袜)");
eq(parseItem("买瓶茅台399").name,         "瓶茅台", "B6 量词+表外词保留(瓶茅台)");

// 词表未收录的量词 → 原样不动
eq(parseItem("买了袋装薯片6").name,       "袋装薯片", "B7 表外量词不动(袋)");
eq(parseItem("买了包邮零食9").name,       "包邮零食", "B8 表外量词不动(包)");

/* ── C. 边界 ───────────────────────────────────────────── */

eq(parseItem("买了一杯咖啡15").amount,    15,       "C1 末尾纯数字金额");
eq(parseItem("买了一杯咖啡15块").amount,  15,       "C2 带「块」");
eq(parseItem("买了一杯咖啡15元").amount,  15,       "C3 带「元」");
eq(parseItem("买了一杯水3.5").amount,     3.5,      "C4 小数金额");
eq(parseItem("买了一杯水3.5").name,       "水",     "C5 小数金额下名称仍正确");
eq(parseItem("买了咖啡").name,            "咖啡",   "C6 只有动词没有量词");
eq(stripQuantifier(""),                   "",       "C7 空输入不崩");
eq(parseItem("买了咖啡").amount,          null,     "C8 无金额返回 null");

/* ── 报告 ─────────────────────────────────────────────── */

console.log("─".repeat(52));
if (fail === 0) {
  console.log(`全部通过：${pass}/${pass}`);
} else {
  console.log(`通过 ${pass} / 失败 ${fail}`);
  console.log("");
  for (const f of failures) console.log("  ✗ " + f + "\n");
}
console.log("─".repeat(52));
process.exit(fail);
