import "@testing-library/jest-dom/vitest";

// jsdom does not implement the native <dialog> methods, so any component that
// renders a <dialog> (our Dialog primitive) throws on mount. Polyfill the
// minimal surface our components touch so they can be tested.
if (typeof HTMLDialogElement !== "undefined") {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.open = true;
    };
  }
  if (!HTMLDialogElement.prototype.show) {
    HTMLDialogElement.prototype.show = function show() {
      this.open = true;
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close() {
      this.open = false;
    };
  }
}
