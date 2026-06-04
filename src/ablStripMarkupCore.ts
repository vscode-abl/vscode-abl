/**
 * Strips AppBuilder-specific visual layout metadata and comment blocks.
 * Does NOT alter general blank spacing or code structures.
 */
export function stripAppBuilderMarkup(sourceText: string): string {
  if (!sourceText) {
    return sourceText;
  }

  // 1. Detect line endings to preserve file format (CRLF vs LF)
  const lineEnding = sourceText.includes('\r\n') ? '\r\n' : '\n';

  // 2. Split into individual lines for fast single-line scanning
  const lines = sourceText.split(/\r?\n/);
  const outputLines: string[] = [];

  // 3. Process single-line directives and headers
  for (const line of lines) {
    const trimmed = line.trim();

    // Skip single-line preprocessor directives (e.g., &ANALYZE-SUSPEND)
    if (trimmed.startsWith('&ANALYZE-')) {
      continue;
    }

    // Skip single-line AppBuilder metadata comments (e.g., /* _UIB-CODE-BLOCK...)
    if (trimmed.startsWith('/* _UIB-')) {
      continue;
    }

    outputLines.push(line);
  }

  // 4. Recombine lines to process multi-line comments
  let content = outputLines.join(lineEnding);

  // 5. Strip multi-line /* Settings for THIS ... */ blocks
  // Tracks nested comment depth to safely support nested OpenEdge comments
  let scanIdx = 0;
  while (true) {
    const startIdx = content.indexOf('/* Settings for THIS', scanIdx);
    if (startIdx === -1) {
      break;
    }

    let depth = 1;
    let currentSearchIdx = startIdx + 20; // Length of "/* Settings for THIS"
    let trueEndIdx = -1;

    while (depth > 0) {
      const nextStart = content.indexOf('/*', currentSearchIdx);
      const nextEnd = content.indexOf('*/', currentSearchIdx);

      if (nextEnd === -1) {
        break;
      }

      if (nextStart !== -1 && nextStart < nextEnd) {
        depth++;
        currentSearchIdx = nextStart + 2;
      } else {
        depth--;
        trueEndIdx = nextEnd;
        currentSearchIdx = nextEnd + 2;
      }
    }

    if (trueEndIdx !== -1) {
      content = content.substring(0, startIdx) + content.substring(trueEndIdx + 2);
      scanIdx = startIdx; // Reset scan index since content length shortened
    } else {
      break;
    }
  }

  // 6. Strip multi-line comments containing "(used by the UIB)"
  // Tracks nested comment depth to safely support nested OpenEdge ABL comments and prevent syntax errors
  scanIdx = 0;
  while (true) {
    const startIdx = content.indexOf('/*', scanIdx);
    if (startIdx === -1) {
      break;
    }

    let depth = 1;
    let currentSearchIdx = startIdx + 2;
    let trueEndIdx = -1;

    while (depth > 0) {
      const nextStart = content.indexOf('/*', currentSearchIdx);
      const nextEnd = content.indexOf('*/', currentSearchIdx);

      if (nextEnd === -1) {
        break;
      }

      if (nextStart !== -1 && nextStart < nextEnd) {
        depth++;
        currentSearchIdx = nextStart + 2;
      } else {
        depth--;
        trueEndIdx = nextEnd;
        currentSearchIdx = nextEnd + 2;
      }
    }

    if (trueEndIdx !== -1) {
      const commentLength = trueEndIdx - startIdx + 2;
      const commentBody = content.substring(startIdx, startIdx + commentLength);

      if (commentBody.includes('(used by the UIB)')) {
        content = content.substring(0, startIdx) + content.substring(trueEndIdx + 2);
        scanIdx = startIdx; // Reset scan index since content length shortened
      } else {
        scanIdx = trueEndIdx + 2; // Keep this comment and skip past it
      }
    } else {
      break;
    }
  }

  return content;
}
