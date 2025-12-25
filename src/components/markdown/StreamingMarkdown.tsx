import type { ReactNode } from "react";

import {
  MarkdownBlockKind,
  MarkdownInlineKind,
  MarkdownListType,
  parseStreamingMarkdown,
  type MarkdownBlock,
  type MarkdownInlineToken,
} from "@/lib/streamingMarkdown";
import { classNames } from "@/lib/utils";
import styles from "./StreamingMarkdown.module.scss";

export type StreamingMarkdownProps = {
  text: string;
  isStreaming?: boolean;
  className?: string;
  baseUrl?: string;
};

/**
 * Render markdown progressively while text streams in, avoiding unsafe HTML rendering.
 *
 * @param props - Renderer props.
 */
export function StreamingMarkdown({
  text,
  isStreaming = false,
  className,
  baseUrl,
}: StreamingMarkdownProps) {
  const blocks = parseStreamingMarkdown(text, { isStreaming });

  if (blocks.length === 0) {
    return null;
  }

  return (
    <div className={classNames(styles.root, className)}>
      {blocks.map((block, index) => renderBlock(block, index, baseUrl))}
    </div>
  );
}

/**
 * Render a parsed markdown block as React nodes.
 *
 * @param block - Parsed markdown block.
 * @param key - List key for the block.
 * @param baseUrl - Optional base URL for resolving relative links.
 */
function renderBlock(block: MarkdownBlock, key: number, baseUrl?: string) {
  if (block.kind === MarkdownBlockKind.Heading) {
    return renderHeading(block.level, block.tokens, key, baseUrl);
  }

  if (block.kind === MarkdownBlockKind.HorizontalRule) {
    return <hr key={key} className={styles.hr} />;
  }

  if (block.kind === MarkdownBlockKind.List) {
    const items = block.items.map((itemTokens, index) => (
      <li key={`${key}:${index}`} className={styles.listItem}>
        {itemTokens.map((token, tokenIndex) =>
          renderInlineToken(token, `${key}:${index}:${tokenIndex}`, baseUrl),
        )}
      </li>
    ));

    return block.listType === MarkdownListType.Ordered ? (
      <ol key={key} className={styles.list} start={block.start}>
        {items}
      </ol>
    ) : (
      <ul key={key} className={styles.list}>
        {items}
      </ul>
    );
  }

  return (
    <p key={key} className={styles.paragraph}>
      {block.lines.map((line, lineIndex) => (
        <span key={lineIndex}>
          {line.map((token, tokenIndex) =>
            renderInlineToken(
              token,
              `${key}:${lineIndex}:${tokenIndex}`,
              baseUrl,
            ),
          )}
          {lineIndex < block.lines.length - 1 ? <br /> : null}
        </span>
      ))}
    </p>
  );
}

/**
 * Render a heading block, using the correct semantic tag based on level.
 *
 * @param level - Heading level (1-6).
 * @param tokens - Inline tokens inside the heading.
 * @param key - List key for the heading.
 * @param baseUrl - Optional base URL for resolving relative links.
 */
function renderHeading(
  level: number,
  tokens: MarkdownInlineToken[],
  key: number,
  baseUrl?: string,
) {
  const content = tokens.map((token, index) =>
    renderInlineToken(token, `${key}:${index}`, baseUrl),
  );
  const className = classNames(
    styles.heading,
    level === 1
      ? styles.h1
      : level === 2
        ? styles.h2
        : level === 3
          ? styles.h3
          : level === 4
            ? styles.h4
            : level === 5
              ? styles.h5
              : styles.h6,
  );

  switch (level) {
    case 1:
      return (
        <h1 key={key} className={className}>
          {content}
        </h1>
      );
    case 2:
      return (
        <h2 key={key} className={className}>
          {content}
        </h2>
      );
    case 3:
      return (
        <h3 key={key} className={className}>
          {content}
        </h3>
      );
    case 4:
      return (
        <h4 key={key} className={className}>
          {content}
        </h4>
      );
    case 5:
      return (
        <h5 key={key} className={className}>
          {content}
        </h5>
      );
    default:
      return (
        <h6 key={key} className={className}>
          {content}
        </h6>
      );
  }
}

/**
 * Resolve a relative URL against a base URL.
 *
 * @param href - URL to resolve (may be relative or absolute).
 * @param baseUrl - Base URL to resolve against.
 */
function resolveUrl(href: string, baseUrl?: string): string {
  if (!baseUrl) return href;
  if (href.startsWith("/")) {
    // Remove trailing slash from baseUrl if present
    const base = baseUrl.replace(/\/$/, "");
    return `${base}${href}`;
  }
  return href;
}

/**
 * Render an inline markdown token.
 *
 * @param token - Inline token to render.
 * @param key - Stable key for the element.
 * @param baseUrl - Optional base URL for resolving relative links.
 */
function renderInlineToken(
  token: MarkdownInlineToken,
  key: string,
  baseUrl?: string,
) {
  if (token.kind === MarkdownInlineKind.Text) {
    return wrapEmphasis(token.text, token.bold, token.italic, key);
  }

  const resolvedHref = resolveUrl(token.href, baseUrl);
  const linkNode = (
    <a
      key={`${key}:link`}
      href={resolvedHref}
      className={styles.link}
      target="_blank"
      rel="noreferrer noopener"
    >
      {token.label.map((labelToken, index) =>
        renderInlineToken(labelToken, `${key}:label:${index}`, baseUrl),
      )}
    </a>
  );

  return wrapEmphasis(linkNode, token.bold, token.italic, key);
}

/**
 * Wrap a node with emphasis tags based on current bold/italic state.
 *
 * @param node - Node to wrap.
 * @param bold - Whether to render within a strong tag.
 * @param italic - Whether to render within an em tag.
 * @param key - Base key for wrappers.
 */
function wrapEmphasis(
  node: ReactNode,
  bold: boolean,
  italic: boolean,
  key: string,
) {
  let wrapped = node;
  if (italic) {
    wrapped = <em key={`${key}:em`}>{wrapped}</em>;
  }
  if (bold) {
    wrapped = <strong key={`${key}:strong`}>{wrapped}</strong>;
  }
  return wrapped;
}
