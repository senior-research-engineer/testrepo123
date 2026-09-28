This file provides guidance to Claude Code when working with code in this repository.

## Stack & Conventions

**Hard constraint: vanilla HTML, CSS, and JavaScript only — no frameworks, no build step.**

- No frameworks or libraries (React, Vue, Angular, jQuery, etc.).
- No build tooling — no bundlers (Webpack, Vite, esbuild), no transpilers (Babel, TypeScript), no `package.json`-driven build pipeline.
- Files must run directly in the browser as-is, with no compile step required.
