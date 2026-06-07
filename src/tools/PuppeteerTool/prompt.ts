export const PUPPETEER_TOOL_NAME = 'Puppeteer'

export const DESCRIPTION = `
- Controls a headless Chromium browser to interact with web pages
- Maintains browser state between calls in the same session — navigate once, then interact
- Screenshots are returned as images you can see directly

Actions:
  navigate  — Go to a URL. Requires: url
  screenshot — Capture the current page as a PNG image. Optional: full_page (boolean, default false)
  content   — Get the page's text or HTML. Optional: format ("text" | "html", default "text")
  evaluate  — Run JavaScript in the page context and return the result. Requires: script
  click     — Click an element. Requires: selector
  type      — Type text into an element. Requires: selector, text
  wait_for  — Wait until a CSS selector appears (up to 10 s). Requires: selector
  scroll    — Scroll by pixels. Optional: x (default 0), y (default 500)
  close     — Close the browser and free all resources

Usage notes:
  - Always call navigate before any other action
  - Use screenshot after interactions to confirm the result visually
  - evaluate can return any JSON-serializable value from the page
  - selector uses standard CSS syntax (#id, .class, [attr], etc.)
`
