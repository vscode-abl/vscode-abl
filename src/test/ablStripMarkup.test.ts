import * as assert from 'node:assert';
import { test } from 'node:test';
import { stripAppBuilderMarkup } from '../ablStripMarkupCore';

test('Preserves standard ABL code and normal comments', () => {
  const code = `/* This is a normal comment */
define variable i as integer no-undo.

/* Normal multi-line comment
   that does not contain any metadata */
message i.
`;
  const result = stripAppBuilderMarkup(code);
  assert.strictEqual(result, code);
});

test('Strips single-line &ANALYZE- preprocessor directives', () => {
  const code = `&ANALYZE-SUSPEND _VERSION-NUMBER UIB_v9r12
define variable c as character no-undo.
&ANALYZE-RESUME
`;
  const expected = `define variable c as character no-undo.
`;
  const result = stripAppBuilderMarkup(code);
  assert.strictEqual(result, expected);
});

test('Strips single-line /* _UIB- comments', () => {
  const code = `/* _UIB-CODE-BLOCK _CUSTOM _DEFINITIONS */
message "hello".
`;
  const expected = `message "hello".
`;
  const result = stripAppBuilderMarkup(code);
  assert.strictEqual(result, expected);
});

test('Strips multi-line Settings for THIS blocks', () => {
  const code = `/* Settings for THIS Procedure
   Type: Procedure
   Allow: 
   Frames: 1
*/
message "world".
`;
  const expected = `
message "world".
`;
  const result = stripAppBuilderMarkup(code);
  assert.strictEqual(result, expected);
});

test('Strips multi-line comments containing "(used by the UIB)"', () => {
  const code = `/* DESIGN Window definition (used by the UIB)
   CREATE WINDOW Procedure ASSIGN
          HEIGHT             = 34.67
          WIDTH              = 61.2.
   /* END WINDOW DEFINITION */
*/
define button b_ok.
`;
  const expected = `
define button b_ok.
`;
  const result = stripAppBuilderMarkup(code);
  assert.strictEqual(result, expected);
});

test('Preserves line endings (LF vs CRLF)', () => {
  // LF
  const lfCode = `&ANALYZE-SUSPEND\nmessage 1.\n`;
  const lfExpected = `message 1.\n`;
  assert.strictEqual(stripAppBuilderMarkup(lfCode), lfExpected);

  // CRLF
  const crlfCode = `&ANALYZE-SUSPEND\r\nmessage 1.\r\n`;
  const crlfExpected = `message 1.\r\n`;
  assert.strictEqual(stripAppBuilderMarkup(crlfCode), crlfExpected);
});
