import { createRoot } from "react-dom/client";
import { App } from "./app";
import { setIcon } from "./mark";

export function mountUI(el: HTMLElement) {
  setIcon();
  createRoot(el).render(<App />);
}
