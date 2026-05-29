import hljs from "highlight.js";
import "highlight.js/styles/github-dark.css";
import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({
  highlight: function (code, lang) {
    const language = hljs.getLanguage(lang) ? lang : "plaintext";
    return hljs.highlight(code, { language }).value;
  },
  langPrefix: "hljs language-",
});

/**
 * Render untrusted Markdown to sanitized HTML safe to inject into the DOM.
 * Always run model/user output through here — never assign raw Markdown HTML.
 *
 * @param {string} raw Markdown source text.
 * @returns {string} Sanitized HTML.
 */
export function renderMarkdown(raw) {
  return DOMPurify.sanitize(marked.parse(raw));
}
