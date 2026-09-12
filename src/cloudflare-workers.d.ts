/**
 * Cloudflare Workers type declarations for the SEO engine.
 * These are available in the Cloudflare Workers runtime but not in the Vite/browser context.
 * 
 * We use a module augmentation pattern to avoid colliding with DOM Element type.
 */

// Cloudflare Workers HTMLRewriter Element (different from DOM Element)
interface CFElement {
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  setAttribute(name: string, value: string): CFElement;
  removeAttribute(name: string): CFElement;
  before(content: string, options?: { html?: boolean }): CFElement;
  after(content: string, options?: { html?: boolean }): CFElement;
  prepend(content: string, options?: { html?: boolean }): CFElement;
  append(content: string, options?: { html?: boolean }): CFElement;
  replace(content: string, options?: { html?: boolean }): CFElement;
  remove(): CFElement;
  setInnerContent(content: string, options?: { html?: boolean }): CFElement;
  removeAndKeepContent(): CFElement;
  readonly tagName: string;
  readonly attributes: IterableIterator<[string, string]>;
  readonly removed: boolean;
  readonly namespaceURI: string;
}

interface CFText {
  readonly text: string;
  readonly lastInTextNode: boolean;
  readonly removed: boolean;
  before(content: string, options?: { html?: boolean }): CFText;
  after(content: string, options?: { html?: boolean }): CFText;
  replace(content: string, options?: { html?: boolean }): CFText;
  remove(): CFText;
}

interface CFComment {
  text: string;
  readonly removed: boolean;
  before(content: string, options?: { html?: boolean }): CFComment;
  after(content: string, options?: { html?: boolean }): CFComment;
  replace(content: string, options?: { html?: boolean }): CFComment;
  remove(): CFComment;
}

interface CFDoctype {
  readonly name: string | null;
  readonly publicId: string | null;
  readonly systemId: string | null;
}

interface CFDocumentEnd {
  append(content: string, options?: { html?: boolean }): CFDocumentEnd;
}

interface CFElementHandler {
  element?: (element: CFElement) => void | Promise<void>;
  comments?: (comment: CFComment) => void | Promise<void>;
  text?: (text: CFText) => void | Promise<void>;
}

interface CFDocumentHandler {
  doctype?: (doctype: CFDoctype) => void | Promise<void>;
  comments?: (comment: CFComment) => void | Promise<void>;
  text?: (text: CFText) => void | Promise<void>;
  end?: (end: CFDocumentEnd) => void | Promise<void>;
}

declare class HTMLRewriter {
  constructor();
  on(selector: string, handlers: CFElementHandler): HTMLRewriter;
  onDocument(handlers: CFDocumentHandler): HTMLRewriter;
  transform(response: Response): Response;
}
