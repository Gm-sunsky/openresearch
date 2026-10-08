import { useLayoutEffect, useRef, useState } from "react";

export function cardTextPlan(available: number, fullHeight: number, overviewHeight: number, lineHeight: number) {
  const height = Math.max(0, available);
  const leading = Math.max(1, lineHeight);
  const lines = Math.max(0, Math.floor((height + .1) / leading));
  return {
    lines,
    expanded: fullHeight <= height + .5 || (lines > 14 && height >= overviewHeight + leading - .5),
    lineHeight: leading,
  };
}

/** Use actual card geometry; stored overviews never impose a limit on a roomy card. */
export function useCardTextLayout(input: { layoutKey: string; content: string; overview: string; width: number; height: number; imageHeight: number; compact: boolean; initialLines: number }) {
  const articleRef = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const [plan, setPlan] = useState({ lines: input.initialLines, expanded: false, lineHeight: 20 });
  useLayoutEffect(() => {
    const article = articleRef.current, text = textRef.current, footer = footerRef.current;
    if (!article || !text || !footer) return;
    let frame = 0;
    const measure = () => {
      const rect = article.getBoundingClientRect();
      if (!article.offsetHeight || !text.clientWidth || !rect.height) return;
      const scale = rect.height / article.offsetHeight;
      const style = getComputedStyle(text);
      const lineHeight = parseFloat(style.lineHeight) || (parseFloat(style.fontSize) || 12) * 1.7;
      const available = (footer.getBoundingClientRect().top - text.getBoundingClientRect().top) / scale;
      const probe = text.cloneNode(false) as HTMLParagraphElement;
      Object.assign(probe.style, { position: "absolute", left: "0", top: "0", visibility: "hidden", pointerEvents: "none", width: `${text.clientWidth}px`, display: "block", height: "auto", maxHeight: "none", margin: "0", overflow: "visible" });
      probe.style.setProperty("-webkit-line-clamp", "unset");
      probe.setAttribute("aria-hidden", "true");
      article.appendChild(probe);
      let fullHeight: number, overviewHeight: number;
      try {
        probe.textContent = input.content;
        fullHeight = probe.getBoundingClientRect().height / scale;
        probe.textContent = input.overview;
        overviewHeight = probe.getBoundingClientRect().height / scale;
      } finally { probe.remove(); }
      const next = cardTextPlan(available, fullHeight, overviewHeight, lineHeight);
      setPlan(current => current.lines === next.lines && current.expanded === next.expanded && current.lineHeight === next.lineHeight ? current : next);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(article); observer?.observe(footer); observer?.observe(text);
    window.addEventListener("resize", schedule);
    return () => { observer?.disconnect(); cancelAnimationFrame(frame); window.removeEventListener("resize", schedule); };
  }, [input.layoutKey, input.content, input.overview, input.width, input.height, input.imageHeight, input.compact]);
  return { articleRef, textRef, footerRef, ...plan, text: plan.expanded ? input.content : input.overview };
}
