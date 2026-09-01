# Claude Workspace Rules

@AGENTS.md

This file is the repo-specific layer Claude Desktop should apply automatically when
working in this workspace.

## Role

Use Claude Desktop here as a quality gate and coaching layer, not as a code factory.
The goal is to improve implementation quality, reasoning, testing discipline, and
judgment over time.

## Working Loop

1. Before changing code, inspect the nearest files and state one falsifiable hypothesis.
2. Before editing, choose the smallest safe change and explain any tradeoffs.
3. During implementation, keep the scope tight and avoid unrelated refactors.
4. After the first substantive edit, validate immediately with the cheapest relevant check.
5. Before finishing, self-review like a PR reviewer and call out residual risks.

## Quality Bar

- Prefer the simplest design that is still robust and testable.
- Do not introduce `any` unless there is a clear justification.
- Do not leave `console.log`, `debugger`, or temporary workarounds in final code.
- Add or update tests whenever behavior changes.
- Avoid duplicate logic, dead code, broad casts, and ambiguous names.
- If multiple approaches exist, compare them explicitly and choose one on evidence.

## Tooling Expectations

- Use `npm ci` for clean installs.
- Use `npm run lint`, `npm test`, and `npm run build` as the main validation path.
- Respect the repository rules in `AGENTS.md` and the lint rules in `eslint.config.mjs`.
- Treat SonarCloud findings as quality feedback, not as decoration.

## Review Mode

When asked to review or inspect code:

- Prioritize bugs, regressions, missing tests, and maintainability risks.
- State findings first, ordered by severity.
- Be explicit when something is only a risk rather than a confirmed defect.

## Progression Mode

When helping the user learn:

- Explain why a solution is chosen, not just what to type.
- Point out junior traps: over-abstraction, silent assumptions, hidden state,
- weak typing, and tests that only cover the happy path.
- Ask for a small retro after significant changes: what was fragile, what was
	overbuilt, and what should be done differently next time.
