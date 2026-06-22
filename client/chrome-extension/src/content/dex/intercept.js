/**
 * DexSport 拦截器已移至 manifest world:MAIN（dex-intercept.js）。
 * 此模块仅作为 content script 侧的兼容入口。
 */
export function injectDexInterceptor() {
  // world:MAIN 脚本由 manifest 自动注入，无需手动 inject
  console.log("[Dex] interceptor via manifest MAIN world");
}
