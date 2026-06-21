"use client";

import { useCallback, useRef } from "react";

const MIN_HEIGHT_PX = 80;
const HEIGHT_SLACK_PX = 8;

// Typographic defaults that match the app's "warm paper" feel without
// overriding the sender's intentional HTML structure.
const FRAME_STYLES = `
  html, body { margin: 0; padding: 0; }
  * { scrollbar-width: none; -ms-overflow-style: none; box-sizing: border-box; }
  *::-webkit-scrollbar { display: none; width: 0; height: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    font-size: 13.5px;
    line-height: 1.7;
    color: #1c1b1a;
    background: #ffffff;
    word-break: break-word;
    overflow-wrap: anywhere;
    padding: 24px 28px;
  }
  h1, h2, h3, h4, h5, h6 {
    line-height: 1.35;
    margin-top: 1.25em;
    margin-bottom: 0.4em;
    color: #111;
  }
  p { margin: 0 0 0.85em; }
  img { max-width: 100%; height: auto; display: block; }
  table { max-width: 100%; border-collapse: collapse; }
  td, th { padding: 6px 10px; }
  a { color: #1f6f54; text-decoration: underline; text-underline-offset: 2px; }
  a:hover { color: #145a42; }
  blockquote {
    margin: 10px 0;
    padding: 8px 0 8px 14px;
    border-left: 3px solid #d1d5db;
    color: #6b7280;
    font-style: italic;
  }
  pre {
    white-space: pre-wrap;
    background: #f3f4f6;
    border-radius: 6px;
    padding: 10px 14px;
    font-size: 12px;
    overflow-x: auto;
  }
  code { font-size: 12px; background: #f3f4f6; padding: 1px 4px; border-radius: 3px; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 16px 0; }
`;

function buildSrcDoc(html: string): string {
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<base target="_blank" rel="noopener noreferrer">',
    `<style>${FRAME_STYLES}</style>`,
    "</head><body>",
    html,
    "</body></html>",
  ].join("");
}

export function EmailHtmlView({ html, title }: { html: string; title: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);

  const resize = useCallback(() => {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    if (!frame || !doc?.body) return;
    const measured = Math.max(
      doc.documentElement.scrollHeight,
      doc.body.scrollHeight,
      doc.body.offsetHeight
    );
    frame.style.height = `${Math.max(MIN_HEIGHT_PX, measured + HEIGHT_SLACK_PX)}px`;
  }, []);

  // Measure on load, then keep in sync as late images/fonts reflow the body.
  const handleLoad = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    resize();
    if (!doc?.body) return;
    const observer = new ResizeObserver(() => resize());
    observer.observe(doc.body);
    void doc.fonts?.ready.then(resize).catch(() => undefined);
    for (const img of doc.querySelectorAll("img")) {
      if (!img.complete) img.addEventListener("load", resize, { once: true });
    }
  }, [resize]);

  return (
    <iframe
      ref={frameRef}
      title={title}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={buildSrcDoc(html)}
      onLoad={handleLoad}
      className="w-full bg-white"
      style={{ height: `${MIN_HEIGHT_PX}px` }}
    />
  );
}
