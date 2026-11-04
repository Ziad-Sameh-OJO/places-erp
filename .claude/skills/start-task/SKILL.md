---
name: start-task
description: Start a Places ERP task from its number (e.g. "1.3", "#64", "T-03"). Reads the GitHub issue, the roadmap card, the requirements section and the demo file, checks that the tasks it depends on are merged, creates the branch, and writes a plan before any code. Use when the user names a task to begin.
---

# Start a task

Input: a task number from `docs/tasks.md` (`1.3`), an issue number (`#64`) or a card (`T-03`).

## 1. Find the task
- `gh` (GitHub CLI) must be on PATH; on Windows it installs to `C:\Program Files\GitHub CLI` — in Git Bash: `export PATH="$PATH:/c/Program Files/GitHub CLI"`.
- Issue: `gh issue view <n> --json number,title,body,labels,assignees,state`. From a task number, find it in `docs/order.md` (it links each task to its issue).
- The issue body is the card: goal, steps, «اقرا» (sources), «موجود بالفعل» (what exists — reuse it), «بعد» (dependencies), done criteria.

## 2. Check dependencies
- `docs/order.md` lists «بعد X» for each task. Every dependency must be merged on `main`: `git log origin/main --oneline | grep -i "<task number>"`, or check its PR with `gh pr list --state all --search "<task number>"`.
- A dependency still in an open PR: stop and tell the user. Don't build on an unmerged branch unless they say so.
- Someone else assigned (`assignees`)? **Stop** and tell the user — two people on one task is exactly what claiming prevents.
- Also look at the issue's edit history and new issues before relying on the card: tasks get edited after client meetings, and follow-ups land in new issues (e.g. 1.25 changes what 1.7 built):
  `gh api graphql -f query='query{repository(owner:"Ziad-Sameh-OJO",name:"places-erp"){issue(number:<n>){userContentEdits(first:5){nodes{editedAt editor{login}}}}}}'`

## 2b. Claim it — the moment we start (CONTRIBUTING: «حط نفسك Assignee»)
Others work on the repo at the same time; the assignee is how they see a task is taken. Do it as soon as the user says go — before reading, planning or coding — and for **every** task of a batch:
```bash
gh issue edit <n> --add-assignee @me
gh issue comment <n> --body "شغالين عليها · branch task/<x-y>"
```
- Status then follows the work: open PR with `Closes #<n>` = in review (GitHub links them); merged = the issue closes by itself.
- If we stop or hand it back before a PR: `gh issue edit <n> --remove-assignee @me` and comment why, so it's free again.
- There is no GitHub Project board (checked 2026-11-04): sprints are **Milestones** («Sprint 1»…«Sprint 5», «UAT»). Take tasks from the current sprint's milestone, in `docs/order.md` order; the assignee + comment is the in-progress signal.

## 3. Read before code (CLAUDE.md «Before writing code»)
1. The module's section in `docs/requirements/requirements.md` (questions numbered like `M-01 2.3`) and every source the card lists under «اقرا».
2. The demo: `demo/design-2/js/modules/<module>.js` — approved flow, Arabic wording and look. Requirements win over the demo when they disagree (say so in the PR).
3. What exists: `packages/domain/src`, `packages/contracts/src/<module>.ts`, `apps/api/src/modules/<module>`, `apps/web/src/features/<module>`.
4. A business rule the requirements don't settle → **stop and ask the user**. Never invent it. Suggest a comment on the issue with the `needs-client` label.

## 4. Branch
```bash
git switch main && git pull --ff-only
git switch -c task/<x-y>          # the team's convention, e.g. task/1-3 (CLAUDE.md also allows feature/M-01-short-name)
```

## 5. Plan, then wait
Write a short plan (in the user's language) in the order of the `build-module` skill: domain rule + test → migration → contracts → API (controller/service/repository) → e2e → UI. Name the files. List open questions. Wait for the user's go-ahead before writing code.
