# Project Streamline procedure

This document describes the steps to cleanup and have the entire project be long term maintainable for a human.

## Condition to execute the procedure

This should be run ONLY if the user asked for it explicitly. Do NOT run parts of all of the procedure if they didn't.

**IMPORTANT:** This procedure requires **both documentation AND action**. Each pass includes an audit phase (documenting issues) followed by a fix phase (actually resolving them). Do not stop after creating audit files—you must proceed to fix the issues identified.

## Procedure Overview

This procedure follows a pattern: **Audit → Fix → Verify** for each major area:

1. **Pass 0:** Snapshot current state (documentation only)
2. **Pass 1:** Audit structure/naming → **Fix structure/naming issues**
3. **Pass 2:** Audit semantics/consistency → **Fix semantics/consistency issues**
4. **Pass 3:** Set up tooling → **Run tooling and fix formatting/type errors**
5. **Pass 4:** **Fix documentation drift**
6. **Final Verification:** Confirm all fixes are complete

**Do not skip the fix phases.** Creating audit reports without fixing issues is incomplete work.

---

## Pass 0: Freeze + snapshot (prevent more chaos)

**Goal:** stop concurrent drift and get a "truth snapshot".

**⚠️ IMPORTANT:** All audit files created in this procedure are **historical snapshots**. They document the state at a specific point in time and should NOT be used to determine current tool availability, folder structures, file contents, or system state. Always verify current state directly before taking action—test tool availability, check actual folder structures, and read current file contents rather than relying on audit snapshots.

- Ensure you're on one branch, no running agents editing.
- Produce a clean project tree snapshot:
  - `git status`
  - `git diff --stat`
  - Generate directory tree (platform-agnostic options):
    - PowerShell: `Get-ChildItem -Recurse -Directory | Where-Object {$_.FullName -notmatch '\\node_modules\\|\\\.next\\|\\dist\\|\\build\\|\\\.git\\|\\\.audit\\'} | Select-Object FullName | Out-File .audit/tree.txt`
    - Unix/Git Bash: `tree -a -I 'node_modules|.next|dist|build|.git|.audit' > .audit/tree.txt`
    - Or use a Node script: `node -e "const fs=require('fs');const path=require('path');function walk(dir,prefix=''){...}"` (or use a package like `tree-cli`)

- Record environment assumptions (node version, package manager):
  - `node -v`
  - Check package manager: `pnpm -v` OR `yarn -v` OR `npm -v` (whichever is used)
  - Save into `.audit/env.txt`

**Checkpoint artifact:** `.audit/tree.txt`, `.audit/env.txt`

---

## Pass 1: Structure + naming alignment (no file contents)

This answers your "stray files / dupes / misnamed stuff" concerns without opening files.

### 1A) Stray files and duplicate-ish names

**Note:** Exclude common build/dependency directories (`node_modules`, `.next`, `dist`, `build`, `.git`, `.audit`) from all file searches to avoid false positives.

- Find suspicious files:
  - wrong-case duplicates (case-insensitive filesystem issues):
    - PowerShell: `git ls-files | Group-Object -Property {$_.ToLower()} | Where-Object {$_.Count -gt 1}`
    - Unix/Git Bash: `git ls-files | sort -f | uniq -d`
    - Note: `git ls-files` automatically excludes files in `.gitignore`, but verify `node_modules` is ignored
  - common "oops" dirs (files created one level up):
    - PowerShell: `Get-ChildItem .. -File | Select-Object Name`
    - Unix/Git Bash: `ls -la ..`
  - "typo droppings" (files with spaces, temp files, copies):
    - PowerShell: `Get-ChildItem -Recurse -Depth 3 -File | Where-Object {$_.FullName -notmatch '\\node_modules\\|\\\.next\\|\\dist\\|\\build\\|\\\.git\\|\\\.audit\\' -and $_.Name -match ' |\.tmp$|copy'}`
    - Unix/Git Bash: `find . -maxdepth 3 -type f -not -path '*/node_modules/*' -not -path '*/.next/*' -not -path '*/dist/*' -not -path '*/build/*' -not -path '*/.git/*' -not -path '*/.audit/*' \( -name '* *' -o -name '*.tmp' -o -name '*copy*' \)`

- Compare to expected Next.js structure (your conventions):
  - `app/` vs `pages/` (pick one, don't half-and-half unless intentional)
  - `src/` or not (pick one)
  - `lib/`, `components/`, `styles/`, `public/` consistency

### 1B) File naming + wording alignment rules (declare them)

Write a short **Project Naming Charter** (literally 15 lines) that the project must obey:

- directories: `kebab-case`
- React components: `PascalCase.tsx`
- hooks: `useThing.ts`
- API routes: Next.js canonical layout
- "one concept, one name" glossary (e.g. `workspace` vs `project` vs `app`)

Store it in `.audit/naming-charter.md` or `CONTRIBUTING.md`.

**Checkpoint artifact:** `.audit/naming-charter.md` + "rename list" (a checklist you execute)

### 1C) Execute structure fixes

**ACTION REQUIRED:** Based on findings from 1A and 1B, actually fix the issues:

- Delete or move stray files identified in 1A
- Rename files/directories that violate the naming charter (update imports/exports accordingly)
- Remove duplicate files (case-insensitive or otherwise)
- Clean up typo droppings (temp files, copies with spaces in names)
- Ensure consistent directory structure (e.g., remove `pages/` if using `app/`, or vice versa)

**Verification:** Re-run the checks from 1A to confirm issues are resolved. Update `.audit/structure-fixes-applied.md` with a summary of changes made.

---

## Pass 2: Semantics alignment (read contents, but only for consistency)

This is your "agents invented different DSLs / APIs / names / routes / Next weirdness".

### 2A) Detect DSL drift mechanically

Generate an **alignment report** by grepping for competing vocabularies:

- Example patterns:
  - competing directories: `app/` and `pages/`
  - competing styling systems: `*.module.css` vs `styled-components` vs `tailwind` etc
  - naming collisions: `getUser` vs `fetchUser` vs `loadUser`

- Practical approach:
  - Identify core engine parts first (prioritize these):
    - Business logic / domain models (e.g., execution engines, state machines, rule evaluators)
    - Data transformation layers (parsers, serializers, validators)
    - Core abstractions (entities, services, repositories that define your domain)
    - API contracts (request/response types, route definitions)
  - Make a list of "terms that should be unique" within these core areas
  - Search for alternates and count occurrences (use your editor's search or `grep`/`Select-String`)
    - Exclude `node_modules`, `.next`, `dist`, `build`, `.git`, `.audit` from searches
    - Example: `grep -r --exclude-dir={node_modules,.next,dist,build,.git,.audit} "pattern" .`
  - **Note:** Document all findings first, then proceed to 2C to fix them. Do not skip the fix phase.

**Output:** `.audit/alignment-report.md` (sections: core engine, routes, data layer, UI layer, naming)

- Start with core engine sections—these are highest priority for consistency
- UI layer inconsistencies are less critical and can be addressed later

### 2B) Next.js correctness sweep (the "use client" + routes + conventions)

Create a tiny checklist and verify systematically:

- `"use client"`:
  - Only in components needing client-only APIs (hooks, window, event handlers).
  - Ensure server components aren't importing client components incorrectly (or fix by splitting).

- Route handlers:
  - `app/api/**/route.ts` usage consistent
  - response patterns consistent (`NextResponse.json`, status codes)

- Data fetching:
  - avoid mixing `getServerSideProps` with app router patterns if you're on app router

- Boundaries:
  - server-only modules (db, fs) not imported into client components

**Checkpoint artifact:** `.audit/nextjs-checklist.md` filled with ✅/❌ + file paths

### 2C) Execute semantics fixes

**ACTION REQUIRED:** Based on findings from 2A and 2B, actually fix the issues:

- **Standardize naming:** Choose one term per concept and rename all occurrences (e.g., if `getUser` and `fetchUser` both exist, pick one and refactor all usages)
- **Fix Next.js issues:**
  - Add/remove `"use client"` directives as needed
  - Fix route handler inconsistencies
  - Resolve server/client boundary violations
  - Remove deprecated patterns (e.g., `getServerSideProps` if using app router)
- **Consolidate styling systems:** If multiple systems exist, choose one and convert/delete the others
- Update imports, exports, and references throughout the codebase

**Verification:** Re-run the checks from 2A and 2B to confirm issues are resolved. Update `.audit/semantics-fixes-applied.md` with a summary of changes made.

---

## Pass 3: Convention lock + formatting automation (make it stay fixed)

This targets your formatting + "library switch made the code messy".

### 3A) Define and enforce the toolchain

- Pick: ESLint + Prettier (and maybe Stylelint if CSS heavy)
- **Check if Prettier is installed:** Check `package.json` for `prettier` in `devDependencies`. If missing, install it: `npm install --save-dev prettier`
- **Check if format script exists:** Check `package.json` for a `format` script. If missing, add scripts to `package.json`:
  - `format`: `prettier --write . --ignore-path .gitignore` (or explicitly ignore `node_modules`, `.next`, `dist`, `build`)
  - `lint`: `next lint` (+ `eslint . --ignore-path .gitignore` if needed)
  - `typecheck`: `tsc -p tsconfig.json --noEmit`
- **Check if batch formatting tool exists:** Check if `utils/format-all.ts` exists. If missing, create it to batch format files using `npm run format` (the script should call `npm run format` internally, not prettier directly)
- **Important:** Always use `npm run format` instead of calling `prettier` directly, as prettier is installed via npm and may not be available in PATH

- Add pre-commit hook (optional but powerful): `lint-staged`

### 3B) Library switch clean-up policy

If agents switched styling/library approaches midstream, you want **one decision**:

- Choose one styling system (example: CSS Modules OR Tailwind OR styled-components)
- Delete/convert the rest intentionally
- Add it to the Naming Charter / CONTRIBUTING so it doesn't regress

**Checkpoint artifact:** successful run of `format`, `lint`, `typecheck` with logs saved to `.audit/`

**⚠️ CRITICAL WARNING ABOUT AUDIT FILES:**

- All files in `.audit/` are **historical snapshots** from specific points in time
- **NEVER** use audit files to determine current state of:
  - Tool availability (Node.js, npm, etc.) — **ALWAYS** test directly in your current environment
  - Folder structures — **ALWAYS** check actual directory structure before making changes
  - File contents — **ALWAYS** read current files rather than trusting audit snapshots
- Audit files may contain outdated or incorrect information
- If an audit file reports "node missing", "file missing", "structure changed", or similar, verify this yourself before taking any action

### 3C) Execute formatting and tooling fixes

**ACTION REQUIRED:** Actually apply the tooling and fix issues:

- **Ensure Prettier is set up:** If Prettier is not installed or the format script doesn't exist, follow the steps in 3A to install and configure it
- **Ensure batch formatting tool exists:** If `utils/format-all.ts` doesn't exist, create it to batch format files using `npm run format` (the script should call `npm run format` internally, not prettier directly)
- Run formatting (Prettier) first: `npm run format` (or use the batch script `npx ts-node utils/format-all.ts` for better performance when formatting many files)
- Run `npm run lint` and fix all linting errors (do not ignore or suppress unless absolutely necessary)
- Run `npm run typecheck` and fix all type errors
- If library switches were identified in 3B, actually delete unused styling libraries and convert code to the chosen system
- Commit tooling configuration files (`.prettierrc`, `.eslintrc`, etc.) if they were created/modified

**Note:** Formatting should always be run before linting and type checking to ensure consistent code style. The project uses Prettier for code formatting. If Prettier is not installed, install it as a dev dependency via npm (`npm install --save-dev prettier`) and ensure the `format` script exists in `package.json`. Always use `npm run format` instead of calling prettier directly, as the prettier command may not exist in PATH. A batch formatting script should be available at `utils/format-all.ts` which uses `npm run format` internally.

**Verification:** All three commands (`format`, `lint`, `typecheck`) must pass without errors. Save final logs to `.audit/tooling-final-run.txt`.

---

## Pass 4: Fix Documentation drift

**ACTION REQUIRED:** Update documentation to reflect all changes made:

- Update `README.md` with current project structure, conventions, and setup instructions
- Update any documentation files that reference renamed files, changed APIs, or updated conventions
- Ensure the naming charter (from Pass 1B) is reflected in documentation
- Update API documentation if routes or function signatures changed

**Checkpoint artifact:** Updated documentation files with git diff showing changes.

---

## Final Verification

Before considering the procedure complete:

1. **Format all code:** Ensure Prettier is installed (`npm install --save-dev prettier` if missing), ensure the `format` script exists in `package.json`, and ensure `utils/format-all.ts` exists (create it if missing). Then run `npm run format` (or `npx ts-node utils/format-all.ts` which uses npm internally) to ensure consistent formatting.
2. **Re-run all audit checks** from Passes 1-3 to confirm no regressions
3. **Verify the project builds:** `npm run build` (or equivalent) succeeds
4. **Verify tests pass** (if tests exist): `npm test` succeeds
5. **Create summary:** Write `.audit/procedure-complete.md` listing:
   - All issues found and fixed
   - Files renamed/deleted/created
   - Breaking changes (if any) that require migration notes
   - Remaining known issues (if any) that were deferred

**The procedure is only complete when all identified issues have been fixed, not just documented.**
