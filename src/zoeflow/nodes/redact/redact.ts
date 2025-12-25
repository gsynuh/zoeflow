import { ZoeRedactionPlaceholderFormat } from "@/zoeflow/types";

type RedactTextOptions = {
  redactEmails: boolean;
  redactApiKeys: boolean;
  redactSdkKeys: boolean;
  placeholderFormat: ZoeRedactionPlaceholderFormat;
  replacement: string;
};

const EMAIL_REGEX =
  /\b[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}\b/g;

const EMAIL_TYPED_REPLACEMENT = "xxxx@xxxx.com";

const API_KEY_PATTERNS: Array<{
  regex: RegExp;
  replacer: (prefix: string, rest: string) => string;
}> = [
  {
    regex: /\b((?:sk|rk|pk)-(?:proj-)?)([A-Za-z0-9-]{16,})\b/g,
    replacer: (prefix, rest) => `${prefix}${maskPreservingDelimiters(rest)}`,
  },
  {
    regex: /\b((?:sk|pk|rk)_(?:test|live)_)([A-Za-z0-9]{10,})\b/g,
    replacer: (prefix, rest) => `${prefix}${maskPreservingDelimiters(rest)}`,
  },
  {
    regex: /\b(gh[pousr]_)([A-Za-z0-9]{20,})\b/g,
    replacer: (prefix, rest) => `${prefix}${maskPreservingDelimiters(rest)}`,
  },
  {
    regex: /\b(xox[baprs]-)([A-Za-z0-9-]{10,})\b/g,
    replacer: (prefix, rest) => `${prefix}${maskPreservingDelimiters(rest)}`,
  },
  {
    regex: /\b(AIza)([0-9A-Za-z\-_]{35})\b/g,
    replacer: (prefix, rest) => `${prefix}${maskPreservingDelimiters(rest)}`,
  },
  {
    regex: /\b((?:AKIA|ASIA))([0-9A-Z]{16})\b/g,
    replacer: (prefix, rest) => `${prefix}${maskPreservingDelimiters(rest)}`,
  },
];

const API_KEY_ASSIGNMENT_REGEX =
  /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|bearer)\b(\s*[:=]\s*)(["']?)([A-Za-z0-9_\-./+=]{8,})(\3)/gi;

const SDK_KEY_ASSIGNMENT_REGEX =
  /\b(sdk[_-]?key|sdkKey|sdk_key)\b(\s*[:=]\s*)(["']?)([A-Za-z0-9_\-./+=]{8,})(\3)/gi;

/**
 * Replace alphanumeric characters while preserving delimiter placement.
 *
 * @param value - Value to mask.
 * @param maskChar - Replacement character for masked positions.
 */
function maskPreservingDelimiters(value: string, maskChar = "x") {
  return value.replace(/[A-Za-z0-9]/g, maskChar);
}

/**
 * Mask a key-like token while preserving a common prefix and overall shape.
 *
 * @param value - Key string to mask.
 */
function maskKeyLikeValue(value: string) {
  for (const pattern of API_KEY_PATTERNS) {
    pattern.regex.lastIndex = 0;
    const match = value.match(pattern.regex);
    if (!match) continue;
    pattern.regex.lastIndex = 0;
    return value.replace(pattern.regex, (_m, prefix: string, rest: string) =>
      pattern.replacer(prefix, rest),
    );
  }

  const prefixMatch = value.match(/^([A-Za-z]{2,10}[-_])(.*)$/);
  if (prefixMatch) {
    const [, prefix, rest] = prefixMatch;
    return `${prefix}${maskPreservingDelimiters(rest)}`;
  }

  return maskPreservingDelimiters(value);
}

/**
 * Redact emails, API keys, and SDK keys from a text input using common patterns.
 *
 * @param text - Input text to redact.
 * @param options - Redaction settings.
 */
export function redactText(text: string, options: RedactTextOptions) {
  let next = text;

  const generic = options.replacement?.trim() || "[REDACTED]";
  const isTyped =
    options.placeholderFormat === ZoeRedactionPlaceholderFormat.Typed;
  const placeholders = {
    email: isTyped ? EMAIL_TYPED_REPLACEMENT : generic,
    apiKey: isTyped ? "[REDACTED_API_KEY]" : generic,
    sdkKey: isTyped ? "[REDACTED_SDK_KEY]" : generic,
  };

  if (options.redactEmails) {
    EMAIL_REGEX.lastIndex = 0;
    next = next.replace(EMAIL_REGEX, placeholders.email);
  }

  if (options.redactApiKeys) {
    for (const pattern of API_KEY_PATTERNS) {
      pattern.regex.lastIndex = 0;
      next = next.replace(
        pattern.regex,
        (_match, prefix: string, rest: string) =>
          isTyped ? pattern.replacer(prefix, rest) : placeholders.apiKey,
      );
    }

    API_KEY_ASSIGNMENT_REGEX.lastIndex = 0;
    next = next.replace(
      API_KEY_ASSIGNMENT_REGEX,
      (_match, label: string, sep: string, quote: string, value: string) => {
        const replacement = isTyped
          ? maskKeyLikeValue(value)
          : placeholders.apiKey;
        return `${label}${sep}${quote}${replacement}${quote}`;
      },
    );
  }

  if (options.redactSdkKeys) {
    SDK_KEY_ASSIGNMENT_REGEX.lastIndex = 0;
    next = next.replace(
      SDK_KEY_ASSIGNMENT_REGEX,
      (_match, label: string, sep: string, quote: string, value: string) => {
        const replacement = isTyped
          ? maskKeyLikeValue(value)
          : placeholders.sdkKey;
        return `${label}${sep}${quote}${replacement}${quote}`;
      },
    );
  }

  return next;
}
