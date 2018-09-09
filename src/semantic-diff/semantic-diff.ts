import { parseFragment } from 'bundled-parse5';
import { deepDiff } from 'bundled-deep-diff';
import { TemplateResult, html, render } from 'lit-html';

import { sanitizeHtmlString } from './sanitize-html-string';
import { normalizeAST } from './normalize-ast';
import { getDiffMessage } from './get-diff-message';
import { findDiffedObject } from './find-diffed-object';
import { getDiffPath } from './get-diff-path';
import { ASTNode } from './types';

export interface DiffConfig {
  ignoredTags?: string[]
}

// deep-diff types for the module is incorrect
type Diff = deepDiff.IDiff;

/**
 * Creates the DiffResult for two AST trees.
 *
 * @param leftTree the left tree
 * @param rightTree the right tree
 * @param diff the semantic difference between the two trees
 *
 * @returns the diff result containing the human readable semantic difference
 */
function createDiffResult(leftTree: ASTNode, rightTree: ASTNode, diff: Diff): DiffResult {
  const leftDiffObject = findDiffedObject(leftTree, diff.path);
  const rightDiffObject = findDiffedObject(rightTree, diff.path);

  return {
    message: getDiffMessage(diff, leftDiffObject, rightDiffObject),
    path: getDiffPath(leftTree, diff.path),
  };
}

interface DiffResult {
  message: string;
  path: string;
}

/**
 * Turns a value into a HTML string to be processed as HTML AST. If the value is
 * already a string, it is returned as is. Otherwise it is passed to lit-html
 * and rendered to an empty container.
 *
 * @param value the value to string
 * @returns the html as string
 */
function asHTMLString(value: unknown) {
  if (typeof value === 'string') {
    return sanitizeHtmlString(value);
  }

  const container = document.createElement('div');

  // TODO: from lit-html 0.11 onwards we can render directly, no need to wrap in a template
  if (value instanceof TemplateResult) {
    render(value, container);
  } else {
    render(html`${value}`, container);
  }

  return sanitizeHtmlString(container.innerHTML);
}

export function getAST(value: any, config: DiffConfig = {}) {
  const ast = parseFragment(asHTMLString(value)) as ASTNode;
  normalizeAST(ast, config.ignoredTags);
  return ast;
}

/**
 * Parses two HTML trees, and generates the semantic difference between the two trees.
 * The HTML is diffed semantically, not literally. This means that changes in attribute
 * and class order and whitespace/newlines are ignored. Also, script and style
 * tags ignored.
 *
 * @param leftHTML the left HTML tree
 * @param rightHTML the right HTML tree
 * @returns the diff result, or undefined if no diffs were found
 */
export function getDOMDiff(leftHTML: any, rightHTML: any, config: DiffConfig = {}): DiffResult | undefined {
  const leftTree = getAST(leftHTML);
  const rightTree = getAST(rightHTML);

  normalizeAST(leftTree, config.ignoredTags);
  normalizeAST(rightTree, config.ignoredTags);

  // parentNode causes a circular reference, so ignore them.
  const ignore = (path: string, key: string) => key === 'parentNode'
  const diffs = deepDiff(leftTree, rightTree, ignore) as Diff[] | undefined;

  if (!diffs || !diffs.length) {
    return undefined;
  }

  return createDiffResult(leftTree, rightTree, diffs[0]);
}

/**
 * Asserts that the two given HTML trees are semantically equal. See getDiff().
 * Throws a human readable error when there is a difference.
 *
 * @param leftHTML the left HTML tree
 * @param rightHTML the right HTML tree
 */
export function assertDOMEquals(leftHTML: unknown, rightHTML: unknown, config: DiffConfig = {}) {
  const result = getDOMDiff(leftHTML, rightHTML, config);

  if (result) {
    throw new Error(`${result.message}, at path: ${result.path}`);
  }
}

/** See assertDOMEquals() */
export function expectDOMEquals(leftHTML: unknown, rightHTML: unknown, config: DiffConfig = {}) {
  assertDOMEquals(leftHTML, rightHTML, config);
}