/** 对齐后端 parse_form_bool.js：form / JSON 布尔字段勿用 Boolean() */
export function parseFormBool(value: unknown): boolean {
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
