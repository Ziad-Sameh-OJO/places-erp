"""
Turns the requirements export (docs/requirements/requirements.json, from places.reca-tech.com) into readable
Markdown: requirements.md (everything) and CHANGES.md (what changed since the previous export).
Run: python3 scripts/requirements_md.py
"""
import difflib, json

D = "docs/requirements/"
new = json.load(open(D + "requirements.json"))
old = json.load(open(D + "sources/requirements-export-v2.json"))

def value_md(q):
    v = q.get("value")
    if q.get("notApplicable"): return f"_مش منطبق_ {q.get('reason') or ''}".strip()
    if v in (None, "", [], {}): return "—"
    if isinstance(v, str): return v
    if q["type"] == "table" or ("columns" in v and "rows" in v):
        cols = v["columns"]; rows = v["rows"]
        cell = lambda c: str(c).replace("|", "\\|").replace("\n", " ")
        return "\n".join(["| " + " | ".join(map(cell, cols)) + " |", "|" + "---|" * len(cols)] +
                         ["| " + " | ".join(cell(r[i] if i < len(r) else "") for i in range(len(cols))) + " |" for r in rows])
    if q["type"] == "flow" or "steps" in v:
        out = []
        for s in v["steps"]:
            line = f"{s['step']}. **{s.get('who','')}**: {s.get('what','')}" + (f" · _{s['data']}_" if s.get("data") else "")
            if s.get("branch"): line += f"\n   - لو {s['branch'].get('condition','')} ← {s['branch'].get('goesTo','')}"
            out.append(line)
        return "\n".join(out)
    return "```json\n" + json.dumps(v, ensure_ascii=False, indent=2) + "\n```"

def questions(d):
    for m in d["modules"]:
        for s in m["sections"]:
            for q in s["questions"]:
                yield m, s, q

def module_md(m):
    out = [f"## {m['id']} · {m['name']}", "", f"**المستخدمين:** {m.get('users','')}  ", f"**الهدف:** {m.get('purpose','')}", ""]
    for s in m["sections"]:
        if not s["questions"]: continue
        out += [f"### {s['ordinal']}: {s['title']}", ""]
        for q in s["questions"]:
            out += [f"**{q['number']} · {q['label']}**", "", value_md(q), ""]
    return "\n".join(out)

head = [f"# ملف المتطلبات · {new['project'].get('company','Places')}", "",
        f"> متصدّر من places.reca-tech.com · {new['exportedAt'][:10]} · {new['summary']['modules']} موديول · التعبئة {new['summary']['overallCompletion']}%.",
        "> المصدر الأصلي `requirements.json`، والملف ده بيتولّد منه (`python3 scripts/requirements_md.py`). ماتعدّلش هنا؛ عدّل على الموقع وصدّر تاني.", "",
        "| الموديول | الاسم |", "|---|---|"] + [f"| {m['id']} | {m['name']} |" for m in new["modules"]] + [""]
open(D + "requirements.md", "w").write("\n".join(head + [module_md(m) for m in new["modules"]]))

# what changed since the previous export
oq = {(m["id"], q["number"]): q for m, s, q in questions(old)}
old_mods = {m["id"] for m in old["modules"]}
ch = [f"# اللي اتغير في المتطلبات", "",
      f"من النسخة اللي اتصدّرت {old['exportedAt'][:10]} (`sources/requirements-export-v2.json`) لحد النسخة الحالية {new['exportedAt'][:10]} (`requirements.json`).", "",
      "## موديولات جديدة", ""] + [f"- **{m['id']} · {m['name']}**: كاملة في `requirements.md`" for m in new["modules"] if m["id"] not in old_mods] + ["", "## إجابات اتغيرت في الموديولات القديمة", "",
      "السطور اللي بـ `+` اتضافت، واللي بـ `-` اتشالت أو اتعدّلت.", ""]
for m, s, q in questions(new):
    k = (m["id"], q["number"])
    if m["id"] not in old_mods or k not in oq: continue
    a, b = value_md(oq[k]), value_md(q)
    if a == b: continue
    diff = [l for l in difflib.unified_diff(a.splitlines(), b.splitlines(), lineterm="", n=0) if not l.startswith(("---", "+++", "@@"))]
    ch += [f"### {m['id']} · {q['number']} · {q['label']}", "", "```diff", *diff, "```", ""]
open(D + "CHANGES.md", "w").write("\n".join(ch))
print("requirements.md + CHANGES.md written")
