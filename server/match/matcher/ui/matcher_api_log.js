function flattenMessage(msg) {
  return String(msg || "")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);
}

/** 将 API 结果写入 matcher 进程控制台（多行、含队名/id 等细节） */
export function logMatcherApiOk(route, result) {
  const lines = [];
  if (Array.isArray(result?.logLines) && result.logLines.length) {
    lines.push(...result.logLines);
  }
  else if (result?.summary) {
    lines.push(result.summary);
  }
  else if (result?.detail) {
    lines.push(result.detail);
  }

  const mm = result?.matchMerge ?? result?.rebuild;
  if (mm?.matchCount != null) {
    lines.push(`matchMerge 完成 · client_matches ${mm.matchCount} 场`);
  }

  console.log(`[matcher] ${route} ok`);
  for (const line of lines) {
    console.log(`[matcher]   ${line}`);
  }
  if (!lines.length) {
    console.log("[matcher]   (无附加详情)");
  }
}

export function logMatcherApiWarn(route, err, label = "skip") {
  const lines = flattenMessage(err?.message || err);
  console.warn(`[matcher] ${route} ${label}`);
  for (const line of lines) {
    console.warn(`[matcher]   ${line}`);
  }
}

export function logMatcherApiErr(route, err) {
  const lines = flattenMessage(err?.message || err);
  console.error(`[matcher] ${route} error`);
  for (const line of lines) {
    console.error(`[matcher]   ${line}`);
  }
}
