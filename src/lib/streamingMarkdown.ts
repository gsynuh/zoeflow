export enum MarkdownBlockKind {
  Heading = "heading",
  HorizontalRule = "horizontalRule",
  List = "list",
  Paragraph = "paragraph",
}

export enum MarkdownInlineKind {
  Text = "text",
  Link = "link",
}

export enum MarkdownListType {
  Ordered = "ordered",
  Unordered = "unordered",
}

export type MarkdownInlineToken =
  | {
      kind: MarkdownInlineKind.Text;
      text: string;
      bold: boolean;
      italic: boolean;
    }
  | {
      kind: MarkdownInlineKind.Link;
      href: string;
      label: MarkdownInlineToken[];
      bold: boolean;
      italic: boolean;
    };

export type MarkdownBlock =
  | {
      kind: MarkdownBlockKind.Heading;
      level: number;
      tokens: MarkdownInlineToken[];
    }
  | {
      kind: MarkdownBlockKind.HorizontalRule;
    }
  | {
      kind: MarkdownBlockKind.List;
      listType: MarkdownListType;
      start?: number;
      items: MarkdownInlineToken[][];
    }
  | {
      kind: MarkdownBlockKind.Paragraph;
      lines: MarkdownInlineToken[][];
    };

export type ParseStreamingMarkdownOptions = {
  isStreaming?: boolean;
  enableLinks?: boolean;
};

/**
 * Parse a small subset of Markdown progressively, allowing incomplete emphasis markers while streaming.
 *
 * Supported features:
 * - Headings (`#`..`######` + space)
 * - Unordered lists (`- item`, `* item`, `+ item`)
 * - Ordered lists (`1. item`, `1) item`)
 * - Horizontal rules (`---`)
 * - Bold (`**`)
 * - Italic (`_`)
 * - Links (`[label](https://...)` and `https://...`) when `enableLinks=true`
 *
 * @param text - Input Markdown text to parse.
 * @param options - Parsing options.
 */
export function parseStreamingMarkdown(
  text: string,
  options?: ParseStreamingMarkdownOptions,
): MarkdownBlock[] {
  const normalized = text.replaceAll("\r\n", "\n");
  const enableLinks = options?.enableLinks ?? !options?.isStreaming;
  const lines = normalized.split("\n");

  const blocks: MarkdownBlock[] = [];
  let currentParagraph: string[] = [];
  let currentList: {
    listType: MarkdownListType;
    start?: number;
    items: string[];
  } | null = null;

  const flushParagraph = () => {
    if (currentParagraph.length === 0) return;
    blocks.push({
      kind: MarkdownBlockKind.Paragraph,
      lines: currentParagraph.map((line) =>
        tokenizeInline(line, { enableLinks }),
      ),
    });
    currentParagraph = [];
  };

  const flushList = () => {
    if (!currentList) return;
    if (currentList.items.length === 0) {
      currentList = null;
      return;
    }
    blocks.push({
      kind: MarkdownBlockKind.List,
      listType: currentList.listType,
      start: currentList.start,
      items: currentList.items.map((item) =>
        tokenizeInline(item, { enableLinks }),
      ),
    });
    currentList = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();

    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push({
        kind: MarkdownBlockKind.Heading,
        level: headingMatch[1].length,
        tokens: tokenizeInline(headingMatch[2] ?? "", { enableLinks }),
      });
      continue;
    }

    if (isHorizontalRuleLine(trimmed)) {
      flushParagraph();
      flushList();
      blocks.push({ kind: MarkdownBlockKind.HorizontalRule });
      continue;
    }

    if (trimmed.length === 0) {
      flushParagraph();
      flushList();
      continue;
    }

    const unorderedMatch = /^\s*[-*+]\s+(.*)$/.exec(line);
    const orderedMatch = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    if (unorderedMatch || orderedMatch) {
      flushParagraph();
      const listType = orderedMatch
        ? MarkdownListType.Ordered
        : MarkdownListType.Unordered;
      const nextStart = orderedMatch
        ? Number.parseInt(orderedMatch[1] ?? "1", 10)
        : undefined;
      const itemText =
        (orderedMatch ? orderedMatch[2] : unorderedMatch?.[1]) ?? "";

      if (!currentList || currentList.listType !== listType) {
        flushList();
        currentList = {
          listType,
          start: listType === MarkdownListType.Ordered ? nextStart : undefined,
          items: [],
        };
      } else if (
        listType === MarkdownListType.Ordered &&
        typeof currentList.start !== "number" &&
        typeof nextStart === "number"
      ) {
        currentList.start = nextStart;
      }

      currentList.items.push(itemText);
      continue;
    }

    if (currentList) {
      flushList();
    }

    currentParagraph.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
}

type TokenizeInlineOptions = {
  enableLinks: boolean;
};

/**
 * Tokenize inline markdown into styled text and links.
 *
 * @param text - Line of text to tokenize.
 * @param options - Tokenization options.
 */
function tokenizeInline(
  text: string,
  options: TokenizeInlineOptions,
): MarkdownInlineToken[] {
  const tokens: MarkdownInlineToken[] = [];
  let buffer = "";
  let isBold = false;
  let isItalic = false;

  const flushText = () => {
    if (!buffer) return;
    tokens.push({
      kind: MarkdownInlineKind.Text,
      text: buffer,
      bold: isBold,
      italic: isItalic,
    });
    buffer = "";
  };

  for (let index = 0; index < text.length; index += 1) {
    const current = text[index] ?? "";

    if (options.enableLinks && current === "[") {
      const parsed = tryParseMarkdownLink(text, index);
      if (parsed) {
        flushText();
        tokens.push({
          kind: MarkdownInlineKind.Link,
          href: parsed.href,
          label: tokenizeEmphasisOnly(parsed.label),
          bold: isBold,
          italic: isItalic,
        });
        index = parsed.nextIndex - 1;
        continue;
      }
    }

    if (
      options.enableLinks &&
      (text.startsWith("https://", index) || text.startsWith("http://", index))
    ) {
      const parsed = tryParseAutoLink(text, index);
      if (parsed) {
        flushText();
        tokens.push({
          kind: MarkdownInlineKind.Link,
          href: parsed.href,
          label: [
            {
              kind: MarkdownInlineKind.Text,
              text: parsed.label,
              bold: false,
              italic: false,
            },
          ],
          bold: isBold,
          italic: isItalic,
        });
        index = parsed.nextIndex - 1;
        continue;
      }
    }

    if (current === "*" && text[index + 1] === "*") {
      flushText();
      isBold = !isBold;
      index += 1;
      continue;
    }

    if (current === "_") {
      const previous = index > 0 ? (text[index - 1] ?? null) : null;
      const next = index + 1 < text.length ? (text[index + 1] ?? null) : null;
      if (shouldToggleItalic(previous, next, isItalic)) {
        flushText();
        isItalic = !isItalic;
        continue;
      }
    }

    buffer += current;
  }

  flushText();
  return tokens;
}

/**
 * Tokenize inline emphasis only (bold/italic) for link labels.
 *
 * @param text - Label text to tokenize.
 */
function tokenizeEmphasisOnly(text: string): MarkdownInlineToken[] {
  return tokenizeInline(text, { enableLinks: false });
}

type ParsedLink = {
  href: string;
  label: string;
  nextIndex: number;
};

/**
 * Try parsing a markdown link of the form `[label](href)` at `startIndex`.
 *
 * @param text - Full line of text.
 * @param startIndex - Index of the `[` character.
 */
function tryParseMarkdownLink(
  text: string,
  startIndex: number,
): ParsedLink | null {
  const closingBracket = text.indexOf("]", startIndex + 1);
  if (closingBracket === -1) return null;
  if (text[closingBracket + 1] !== "(") return null;

  const closingParen = text.indexOf(")", closingBracket + 2);
  if (closingParen === -1) return null;

  const label = text.slice(startIndex + 1, closingBracket);
  const hrefRaw = text.slice(closingBracket + 2, closingParen).trim();
  const href = sanitizeHref(hrefRaw);
  if (!href) return null;

  return {
    href,
    label,
    nextIndex: closingParen + 1,
  };
}

type ParsedAutoLink = {
  href: string;
  label: string;
  nextIndex: number;
};

/**
 * Try parsing an auto link starting with `http(s)://` at `startIndex`.
 *
 * @param text - Full line of text.
 * @param startIndex - Index where the URL starts.
 */
function tryParseAutoLink(
  text: string,
  startIndex: number,
): ParsedAutoLink | null {
  let end = startIndex;
  while (end < text.length && !isWhitespace(text[end] ?? "")) {
    end += 1;
  }

  const raw = text.slice(startIndex, end);
  const trimmed = raw.replace(/[.,!?;:]+$/, "");
  const href = sanitizeHref(trimmed);
  if (!href) return null;

  return {
    href,
    label: trimmed,
    nextIndex: startIndex + trimmed.length,
  };
}

/**
 * Restrict link protocols to a safe allowlist.
 *
 * @param href - Raw href value.
 */
function sanitizeHref(href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (lower.startsWith("https://") || lower.startsWith("http://")) {
    if (/\s/.test(trimmed)) return null;
    return trimmed;
  }

  if (lower.startsWith("mailto:")) {
    if (/\s/.test(trimmed)) return null;
    return trimmed;
  }

  // Allow relative paths starting with /
  if (trimmed.startsWith("/")) {
    if (/\s/.test(trimmed)) return null;
    return trimmed;
  }

  return null;
}

/**
 * Decide whether an underscore should toggle italic state.
 *
 * @param previous - Previous character in the raw string.
 * @param next - Next character in the raw string.
 * @param isItalic - Current italic state.
 */
function shouldToggleItalic(
  previous: string | null,
  next: string | null,
  isItalic: boolean,
) {
  if (!isItalic) {
    return (
      next !== null &&
      next.length > 0 &&
      !isWhitespace(next) &&
      (previous === null || isWhitespace(previous) || isPunctuation(previous))
    );
  }

  return (
    previous !== null &&
    previous.length > 0 &&
    !isWhitespace(previous) &&
    (next === null ||
      next.length === 0 ||
      isWhitespace(next) ||
      isPunctuation(next))
  );
}

/**
 * Check if a character is whitespace.
 *
 * @param character - Single character to check.
 */
function isWhitespace(character: string) {
  return character === " " || character === "\t" || character === "\n";
}

/**
 * Check if a character is punctuation.
 *
 * @param character - Single character to check.
 */
function isPunctuation(character: string) {
  return /[.,!?;:()[\]{}"'`]/.test(character);
}

/**
 * Check whether a line should be treated as a horizontal rule.
 *
 * @param trimmedLine - Line with surrounding whitespace removed.
 */
function isHorizontalRuleLine(trimmedLine: string) {
  return /^-{3,}$/.test(trimmedLine);
}
