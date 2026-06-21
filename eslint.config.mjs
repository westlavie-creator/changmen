import antfu from "@antfu/eslint-config";

export default antfu({
  vue: true,
  typescript: true,

  stylistic: {
    semi: true,
    quotes: "double",
  },

  ignores: [
    "node_modules",
    "**/dist/**",
    "**/storage/**",
    "client/web/src/modules/**",
    "client/chrome-extension/lib/**",
  ],

  rules: {
    // 项目里大量直接改 prop 对象属性，暂时关掉
    "vue/no-mutating-props": "off",
    // 一行多语句，风格偏好
    "style/max-statements-per-line": "off",
    // 开发阶段需要 console
    "no-console": "warn",
    // alert 在部分场景有用
    "no-alert": "warn",
    // 方法签名风格不强制
    "ts/method-signature-style": "off",
    // new Xxx() 不赋值（如 new WebSocket(...)）
    "no-new": "off",
    // 函数声明提升是正常行为
    "ts/no-use-before-define": "off",
    // JSDoc 参数名不强制
    "jsdoc/check-param-names": "warn",
  },
});
