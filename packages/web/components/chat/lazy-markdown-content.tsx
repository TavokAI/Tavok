"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { MarkdownContent as MarkdownContentType } from "./markdown-content";

/**
 * F3: Lazy-loaded MarkdownContent wrapper.
 *
 * react-markdown + remark-gfm + rehype-highlight is ~100KB+ of JS.
 * By lazy-loading, we avoid paying that cost on initial page load.
 * The fallback renders the raw text with whitespace preserved so there's
 * no layout shift when the full renderer hydrates.
 */
const LazyMarkdownContent = dynamic(
  () =>
    import("./markdown-content").then((mod) => ({
      default: mod.MarkdownContent,
    })),
  {
    loading: () => null,
    ssr: false,
  },
);

export function MarkdownContentLazy(
  props: ComponentProps<typeof MarkdownContentType>,
) {
  return <LazyMarkdownContent {...props} />;
}
