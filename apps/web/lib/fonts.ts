/** The loaded web fonts by the hashed family names next/font gave them, for canvases that draw their own text. */
export function uiFont(kind: "body" | "display" = "body"): string {
  const fallback = "Familjen Grotesk, Helvetica, sans-serif";
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue("--font-familjen").trim();
  return v ? `${v}, sans-serif` : fallback;
}
