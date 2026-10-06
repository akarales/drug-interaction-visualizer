// Shared setup for every test file. jsdom lacks ResizeObserver, which Radix
// poppers (tooltip, select, popover) need as soon as they open.
if (typeof window !== 'undefined' && typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}
