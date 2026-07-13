/** x-www-form-urlencoded 布尔字段：Boolean("false") 为 true，须显式解析 */
export function parseFormBool(value) {
  if (value === true || value === 1 || value === "1")
    return true;
  if (value === false || value === 0 || value === "0")
    return false;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (s === "true" || s === "1")
      return true;
    if (s === "false" || s === "0" || s === "")
      return false;
  }
  return Boolean(value);
}
