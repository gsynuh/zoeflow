# Instructions for LLM AGENTS

## Introduction

This file is for every LLM Assistant or coding agent to follow a similar philosophy to work on this project.
(GPT, Codex, Opus, Sonnet, Claude, Composer ...)

## Conversation start

To be familiar with the project and answer the user, read README.md and its associated files.

## Development

### Code

- If no code has been read yet, before you start coding read at least one other file of the same type to copy coding preferences if one exists. for example to see how .tsx files are written, or module.scss files.
- You may websearch for docs given your knowledge cutoff
- For big features,refactors or changes, design/change the API (function names and signatures) first before creating their body.
- NO inline dynamic imports
- Anticipate error handling with try/catch and clear messages through the relevant channel (server side and client side)

### New features, nodes, using OpenRouter

Ensure all usages of a pay as you go service (here OpenRouter) are properly reported (see usage reporting for Completion nodes or Document processing) via the appropriate events/callbacks/logs.

### Types and enums

- To facilitate user understanding of the code base and navigation through finding references or string search, use string enums instead of hardcoded strings for "type of things" or "kind of things" where the attribute values are expected to be of a limit number or explicit and different string or int values

Ex : a message object may have metadata such as a "role" attribute. instead of role:"user"|"admin" create enum MessageRole { USER="user, ADMIN="admin}

- split types and enums into files where concerns are clearly split otherwise use common files at root of src/

### Accessibility

- Use ARIA
- Use better html tags (and change them if they change or move in structure)
- Consider alt navigation
- Consider screen readers
- if the app has a highly visual or a visually centered interactive/edition space, its ok to let it go and have an alternate component describing the space or its use. for example, an interactive three.js canvas would be associated with an alt/ARIA non displayed text to describe the component

### Styles and stylesheets

- Use SimpleBar for any section, area, div, that would end up being scrollable such that we have crossplatform styling/sizing for scroll bars.

- NO inline style if you can avoid it (create a new stylesheet/module if necessary)

- do not wrap var(--something) inside hsl() if var is already a color.

- don't invent colors if the project already has a defined palette or color variables that are consistent with the task and its UI/UX use.

- Only use oklch when declaring colors. keep css lines that involve color tight and broadly compatible

- OKLCH in CSS is a perceptual color space where L controls lightness, C chroma, H hue. Before using them, consider if the app already has a defined palette either through tailwind, global css variables or local ones, and use these. If no palettes are clear, create one in rgb format such that the user would have a single location to transform rgb to oklch when needed. you should avoid altering oklch yourself.

## Long tasks / data processing / dev tooling

- Sometimes tasks could take long or involve data processing or even simply needing to search accross many files etc. Instead of reading files / grepping many times, prefer writing a simple helper script (create utils/ next to src/) wherein you can write .ts / .js files returning exactly what you need for such tasks and they could be run instantly via npx ts-node with or without arguments.
- Keep tools there for future uses, at the start of each file comment what its intent is.

## Comments and policy

- you must add jsdoc style comments (descriptions, arguments/params) on top of functions whenever they are missing or you create a new function.
- Simple and clear code does NOT require comments to be written.
- You may add comments on classes definitions and type definition if describing them would take longer than a sentence.

## Documentation

- Do not write a README file unless asked to.
- If one exists, alter it or associated files once concepts, terminology, file location or usage changes for any task

## Validating your work

- Before running lint/type checks, format all code using Prettier:
  - **Check if Prettier is installed:** Check `package.json` for `prettier` in `devDependencies`. If missing, install it: `npm install --save-dev prettier` . the "organize import" prettier plugin should also be installed.
  - **Check if format script exists:** Check `package.json` for a `format` script. If missing, add: `"format": "prettier --write . --ignore-path .gitignore"`
  - **Check if batch formatting tool exists:** Check if `utils/format-all.ts` exists. If missing, create it to batch format files using `npm run format` (see the existing script for reference)
  - Run `npm run format` to format all files (uses the npm script which calls prettier from node_modules)
  - Alternatively, use the batch script `npx ts-node utils/format-all.ts` which also uses `npm run format`
  - We use npm scripts instead of calling prettier directly because the prettier command may not exist in PATH
  - This ensures consistent formatting across all files before validation

- run lint tests and fix lint errors.

- run npx tsc --noEmit and fix type errors.

- For changes you feel may require a new build ot compilation, Instead or running a command, stop and ask the user to test themselves for any specific features that you implemented or changed, once your turn is done.

If you run into a loop (fixing but tsc/lint failing more than 4 times) stop, ask the user for help. The loop might be caused by an unknown you won't be able to guess yourself.

## Commit

- if git is not initialized, do so.
- commit titles should follow "Conventional Commits 1.0.0 specification" :  
  type(scope): description
