import { createRoot } from "react-dom/client";
import { App } from "./app";

export function mountUI(el: HTMLElement) {
  createRoot(el).render(<App />);
}
