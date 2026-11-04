---
name: open-pr
description: Commit, push and open the pull request for a Places ERP task — Conventional Commits, the repo's PR template in Arabic, Closes #issue, CI watched. Use when a task's code is done and verified and the user asks to open a PR.
---

# Open the PR

Only after the `verify` skill passed, and only when the user asked for it (pushing is outward-facing).

1. **Branch:** never commit a task to `main`. Expect `task/<x-y>` (team convention) or `feature/M-xx-short-name`.
2. **Commits:** Conventional Commits with the module as scope — `feat(leads): lead details API with activity log`, `fix(hr): …`, `test(kpis): …`. Small, one idea each. End each message with the attribution line from the system reminder.
3. **Push:** with `gh` on PATH (Windows: `export PATH="$PATH:/c/Program Files/GitHub CLI"` in Git Bash). If `git push` asks for a username, use `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push -u origin HEAD`.
4. **PR:** title like the existing ones — `<task number> <short English title>` (e.g. `1.3 Lead details API + activity log + comments`). Body follows `.github/pull_request_template.md` in Arabic:
   - **إيه وليه:** the requirement (`M-01 2.3`), what changed, `Closes #<issue>`. If the demo and the requirements disagreed, say which one you followed.
   - **اتجرب إزاي:** tick the checklist honestly; list the verify results; say which e2e tests skipped locally (file storage) and why.
   - **صور:** for UI changes, desktop + 375px.
   - End with the PR attribution line from the system reminder.
   ```bash
   gh pr create --base main --title "…" --body-file <file in the scratchpad>
   ```
5. **CI:** `gh pr checks <n> --watch`. If it fails, read `gh run view <id> --log-failed`, fix, push again.
6. Merging is a squash merge on GitHub, done by whoever reviews — don't merge your own PR unless the user says so.
