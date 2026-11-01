/** Preserve the rendered card when its drag ghost leaves board-scoped frame/typography CSS. */
export function cloneRenderedCard(source: HTMLElement): HTMLElement {
  const ghost = source.cloneNode(true) as HTMLElement;
  const originals = [source, ...source.querySelectorAll<HTMLElement>("*")],
    copies = [ghost, ...ghost.querySelectorAll<HTMLElement>("*")];
  const properties = [
    "font-family",
    "font-size",
    "font-weight",
    "line-height",
    "color",
    "text-shadow",
    "background-color",
    "filter",
    "transform",
    "transform-origin",
    "translate",
    "scale",
    "rotate",
    "width",
    "height",
    "min-width",
    "max-width",
    "min-height",
    "max-height",
    "object-fit",
    "object-position",
  ] as const;
  originals.forEach((node, i) => {
    const clone = copies[i],
      style = getComputedStyle(node);
    clone.removeAttribute("id");
    for (const key of properties)
      clone.style.setProperty(key, style.getPropertyValue(key));
  });
  // getBoundingClientRect already includes the source pose; do not apply it twice.
  const rect = source.getBoundingClientRect();
  // Board cards use percentage/important sizing inside a slot. A fixed ghost has no slot.
  for (const key of ["width", "min-width", "max-width"])
    ghost.style.setProperty(key, rect.width + "px", "important");
  for (const key of ["height", "min-height", "max-height"])
    ghost.style.setProperty(key, rect.height + "px", "important");
  ghost.style.transform = "none";
  ghost.style.translate = "none";
  ghost.style.scale = "none";
  ghost.style.rotate = "none";
  return ghost;
}
