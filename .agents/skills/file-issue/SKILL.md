---
name: file-issue
description: File a GitHub issue on this repo with structured acceptance criteria. Use when the user wants to create, file, or open a GitHub issue for a bug, feature, improvement, or task.
---

# File GitHub Issue

Create a well-structured GitHub issue on `justinchoo93/OtterFin` with auto-generated acceptance criteria.

## When to use

- User says "file an issue", "create an issue", "open an issue"
- User describes a bug or feature they want tracked as a GitHub issue
- User asks to log work as an issue

## Prerequisites

Before filing, ensure the `justinchoo93` GitHub account is the active account:

```bash
gh auth switch --user justinchoo93
```

Always run this before any `gh` commands. If it fails, stop and tell the user to authenticate:
```bash
gh auth login
```

## Gather information

Collect the following from the user (ask if not provided):

1. **Category** (required): `bug`, `enhancement`, `documentation`, or `question`
2. **Title** (required): Short summary of the issue
3. **Description** (required): What the issue is about — context, motivation, and details

If the category is `bug`, also gather:
- **Steps to reproduce** (if known)
- **Expected vs actual behavior**
- **Potential fix** (if investigated)

If the category is `enhancement`, also gather:
- **Motivation / user problem**
- **Potential approach** (if discussed)

## Generate acceptance criteria

This is the most important part. Generate specific, testable acceptance criteria following these rules:

### Rules for acceptance criteria

1. Each AC must be independently verifiable — someone should be able to check it off as done/not done
2. Use the format `AC-N: Short descriptive name` with bullet points underneath
3. Bullets describe observable outcomes, not implementation steps
4. Include both happy path and error/edge cases
5. Be specific about exact UI text, routes, status codes, and behaviors where applicable
6. If the change touches a **user journey or browser interaction**, each relevant AC MUST explicitly state:
   - What page/route the user is on
   - What the user sees or does
   - What happens in the browser (redirect, error message, disabled state, etc.)
7. Keep ACs scoped — 3 to 6 ACs is typical. Don't pad with trivial items.

### Example format

```markdown
### AC-1: Successful login
- User at `/login` with valid credentials gets redirected to `/dashboard`
- Session cookie is set

### AC-2: Wrong password error
- User sees exactly "Invalid email or password"
- User stays on `/login`

### AC-3: Empty field validation
- Submit disabled when either field is empty, or inline error on empty submit

### AC-4: Rate limiting
- After 5 failed attempts, login blocked for 60 seconds
- User sees a message with the wait time
```

## Investigate the codebase

Before generating acceptance criteria, investigate the relevant parts of the codebase to make the ACs accurate:

- Read related source files to understand current behavior
- Check existing routes, components, and API endpoints that would be affected
- Look at existing error messages, validation patterns, and UI conventions used in the project
- Use this context to write ACs that match the project's actual patterns (real route paths, real error formats, real component names)

## Compose the issue body

Use this template:

```markdown
## Category
{bug | enhancement | documentation | question}

## Description
{Description of the issue}

{If bug: steps to reproduce, expected vs actual}
{If investigated: potential fix or approach}

## Acceptance Criteria

### AC-1: {name}
- {criterion}
- {criterion}

### AC-2: {name}
- {criterion}

...
```

## Present for approval

Before filing, show the user the full issue (title, labels, and body) and ask for approval. Do not file without explicit confirmation.

## File the issue

```bash
gh issue create \
  --repo justinchoo93/OtterFin \
  --title "{title}" \
  --label "{category_label}" \
  --body "$(cat <<'EOF'
{issue body}
EOF
)"
```

Map categories to labels:
- `bug` → `bug`
- `enhancement` / `feature` → `enhancement`
- `documentation` → `documentation`
- `question` → `question`

After filing, display the issue URL to the user.
