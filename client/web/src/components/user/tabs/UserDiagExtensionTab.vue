<template>
  <el-form label-width="120px" class="user-diag-extension">
    <el-form-item label="比例 9999:">
      <p class="hint title">单边模式（changmen 扩展，A8 无此语义）</p>
    </el-form-item>
    <el-form-item>
      <ul class="hint list">
        <li>在账号「投注比例」某区间填 <strong>9999</strong>：该侧<strong>不参与</strong>自动下单。</li>
        <li>出现套利机会时，系统在对侧平台<strong>真下单</strong>（单边敞口，非假单）。</li>
        <li>LinkID 为负时间戳，后台展示为 <code>gb&#123;时间戳&#125;</code>。</li>
        <li>Telegram 仍用双腿版式：9999 侧标注「本侧不下单」，对侧显示真实结果。</li>
        <li>缺腿若因余额不足、暂停等（非 9999），则整单跳过，与 A8 一致。</li>
      </ul>
    </el-form-item>
  </el-form>
</template>

<style scoped>
.hint {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.6;
}
.hint.title {
  color: var(--el-text-color-primary);
  font-weight: 500;
}
.list {
  padding-left: 1.2em;
}
.list li {
  margin-bottom: 0.35em;
}
</style>
