/** 对齐 A8 `String.prototype.toHashNumber`（console bundle） */
export function stringToHashNumber(value: string): number {
  let hash = 0;
  const seed = 31;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * seed + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}
