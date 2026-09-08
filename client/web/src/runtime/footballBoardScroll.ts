/**
 * 列表内部若有 overflow-x:auto 的盘口列，浏览器会把竖向滚轮吞掉。
 * 内层不能竖滚时，把 deltaY 交给 .matchs。
 */
export function nestedCapturesVerticalWheel(
  target: EventTarget | null,
  scroller: HTMLElement,
  deltaY: number,
): boolean {
  let el: Element | null = target instanceof Element ? target : null;
  while (el && el !== scroller) {
    if (el instanceof HTMLElement) {
      const y = getComputedStyle(el).overflowY;
      if (y === "auto" || y === "scroll") {
        const can = el.scrollHeight > el.clientHeight + 1;
        if (can) {
          const atStart = el.scrollTop <= 0 && deltaY < 0;
          const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 1 && deltaY > 0;
          if (!atStart && !atEnd)
            return true;
        }
      }
    }
    el = el.parentElement;
  }
  return false;
}

export function applyVerticalWheel(scroller: HTMLElement, deltaY: number): boolean {
  const max = scroller.scrollHeight - scroller.clientHeight;
  if (!(max > 0) || !deltaY)
    return false;
  const next = Math.max(0, Math.min(max, scroller.scrollTop + deltaY));
  if (next === scroller.scrollTop)
    return false;
  scroller.scrollTop = next;
  return true;
}

export function onNestedVerticalWheel(scroller: HTMLElement, event: WheelEvent): void {
  if (Math.abs(event.deltaY) < Math.abs(event.deltaX))
    return;
  if (nestedCapturesVerticalWheel(event.target, scroller, event.deltaY))
    return;
  if (applyVerticalWheel(scroller, event.deltaY))
    event.preventDefault();
}
