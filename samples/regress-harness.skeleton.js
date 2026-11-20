/**
 * regress-harness.skeleton.js —— 二次回归取证台骨架（脱敏示例）
 *
 * 用途：把「改一条数据 → 打开另外几个页面 → 看数据是否一致」这类问题
 *      从「读代码猜」变成「跑起来看」。
 *
 * 核心思路：
 *   桩只打在平台边界（wx.*），业务代码全部真跑。
 *   打了业务桩 = 测的是桩；只打平台桩 = 测的是真实链路。
 *
 * 注意：这是骨架，不是完整实现。真实项目的 wx 桩需要覆盖到
 *      页面实际调用到的每一个 API（缺一个就会抛错，测出假失败）。
 *
 * 用法示例：
 *   const h = require("./regress-harness.skeleton.js")("./miniprogram");
 *   const home = h.page("home");
 *   h.send(home, "/ledger 午饭 28");          // 走首页真实输入链路
 *   const ledger = h.page("ledger");
 *   console.log(ledger.data.records.length);  // 断言跨页一致
 */

"use strict";

const path = require("path");

module.exports = function createHarness(rootRelative) {
  const ROOT = path.resolve(rootRelative);

  /* ---------------- 1. 内存 storage ---------------- */
  const mem = Object.create(null);

  /* ---------------- 2. 回调工具 ---------------- */
  const noop = () => {};
  const ok = (o) => {
    if (o && typeof o.success === "function") o.success(o.__res || {});
    if (o && typeof o.complete === "function") o.complete({});
  };
  const fail = (o, msg) => {
    if (o && typeof o.fail === "function") o.fail({ errMsg: msg || "stub-fail" });
    if (o && typeof o.complete === "function") o.complete({});
  };

  /* ---------------- 3. 选择器 / Canvas 桩 ---------------- */
  // 返回自身即可满足链式调用；真实项目里这里还要区分 Canvas / 普通节点
  const chain = () => {
    const self = {
      in() { return self; },
      select() { return self; },
      selectAll() { return self; },
      selectViewport() { return self; },
      fields() { return self; },
      boundingClientRect(cb) {
        if (cb) cb({ width: 300, height: 400, top: 0, left: 0, bottom: 400, right: 300 });
        return self;
      },
      scrollOffset(cb) { if (cb) cb({ scrollTop: 0 }); return self; },
      exec(cb) { if (cb) cb([{ width: 300, height: 400, node: fakeNode() }]); },
    };
    return self;
  };

  const fakeNode = () => {
    // Canvas 上下文：任何方法调用都返回空对象，任何属性赋值都静默成功
    const ctx = new Proxy({}, { get: () => () => ({}), set: () => true });
    return { width: 600, height: 600, getContext: () => ctx, toDataURL: () => "data:image/png;base64,AAA" };
  };

  /* ---------------- 4. wx 全量桩 ---------------- */
  global.wx = {
    /* storage：真读写内存，这是跨页一致性的观测点 */
    getStorageSync: (k) => (k in mem ? mem[k] : ""),
    setStorageSync: (k, v) => { mem[k] = v; },
    removeStorageSync: (k) => { delete mem[k]; },
    getStorageInfoSync: () => ({ keys: Object.keys(mem), currentSize: 10, limitSize: 10240 }),
    clearStorageSync: () => { for (const k of Object.keys(mem)) delete mem[k]; },

    /* 导航 */
    navigateTo: ok, redirectTo: ok, switchTab: ok, reLaunch: ok, navigateBack: ok,

    /* 交互 */
    showToast: ok, hideToast: ok, showLoading: ok, hideLoading: ok,
    showModal: (o) => { if (o && o.success) o.success({ confirm: true, cancel: false }); if (o && o.complete) o.complete({}); },
    showActionSheet: (o) => { if (o && o.success) o.success({ tapIndex: 0 }); if (o && o.complete) o.complete({}); },

    /* 界面 */
    createSelectorQuery: () => chain(),
    createCanvasContext: () => fakeNode().getContext(),
    nextTick: (fn) => { if (fn) fn(); },
    getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 667, platform: "devtools", SDKVersion: "2.0.0" }),

    /* 网络 / 云：默认失败，让「降级路径」被真实触发 */
    request: (o) => fail(o, "stub: no network"),
    cloud: {
      init: noop,
      callFunction: (o) => fail(o, "stub: no cloud"),
      database: () => { throw new Error("stub: no database"); },
    },

    /* 剩余 API 统一兜底，避免「某方法不存在」导致假失败 */
  };

  /* ---------------- 5. Page / App 捕获 ---------------- */
  const pages = Object.create(null);
  global.Page = (cfg) => { cfg.__isPage = true; pages.__last = cfg; };
  global.Component = (cfg) => { pages.__lastComp = cfg; };
  global.App = (cfg) => { global.__app = cfg; };
  global.getApp = () => global.__app || { globalData: {} };

  /* 清掉 require 缓存，保证每次都能拿到新模块 */
  const purge = () => {
    for (const k of Object.keys(require.cache)) {
      if (k.startsWith(ROOT)) delete require.cache[k];
    }
  };

  /* ---------------- 6. 实例构造 ---------------- */
  const clone = (o) => (o === null || typeof o !== "object" ? o : JSON.parse(JSON.stringify(o)));

  /** 支持 setData("a.b.c", v) 路径写法 */
  function applySetData(data, key, val) {
    if (!key.includes(".") && !key.includes("[")) { data[key] = val; return; }
    const segs = key.replace(/\[(\d+)\]/g, ".$1").split(".");
    let cur = data;
    for (let i = 0; i < segs.length - 1; i++) {
      const s = segs[i];
      if (cur[s] == null) cur[s] = /^\d+$/.test(segs[i + 1]) ? [] : {};
      cur = cur[s];
    }
    cur[segs[segs.length - 1]] = val;
  }

  /**
   * 打开一个页面：走真实 onLoad / onShow，等异步链跑完，返回实例。
   * 页面路径通过 require 真实加载，所以页面 js 里的所有依赖都会真跑。
   */
  function page(name) {
    const modPath = path.join(ROOT, "pages", name, name + ".js");
    delete require.cache[require.resolve(modPath)];
    require(modPath);                       // 触发 Page(cfg)
    const cfg = pages.__last;
    if (!cfg) throw new Error("Page() 未捕获：" + modPath);

    const inst = Object.create(cfg);
    inst.data = clone(cfg.data || {});
    inst.setData = function (patch, cb) {
      if (typeof patch === "string") { applySetData(this.data, patch, cb); return; }
      for (const k in patch) applySetData(this.data, k, patch[k]);
      if (typeof cb === "function") cb();
    };
    inst.route = "pages/" + name + "/" + name;

    if (typeof inst.onLoad === "function") inst.onLoad.call(inst, {});
    if (typeof inst.onShow === "function") inst.onShow.call(inst);
    return inst;
  }

  /**
   * 走首页真实输入链路（强制前缀 + 解析 + 落库）。
   * 不直接调用解析函数 —— 那样测的是函数，不是用户路径。
   */
  function send(inst, text) {
    const fn = inst && (inst.onConfirm || inst.onSubmit || inst.handleSend || inst.onInputConfirm);
    if (typeof fn !== "function") throw new Error("未找到输入入口方法，请按实际页面调整");
    fn.call(inst, { detail: { value: text } });
    return inst;
  }

  return {
    page,
    send,
    purge,
    /* 直读存储，用于验证「数据到底在不在」——诊断第一步 */
    dump: () => JSON.parse(JSON.stringify(mem)),
    reset: () => { for (const k of Object.keys(mem)) delete mem[k]; },
  };
};
