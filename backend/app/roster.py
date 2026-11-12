"""Match a placement cell's official student list against the students waiting for approval.

The list can be CSV, Excel (.xlsx), PDF, Word (.docx) or plain text. Columns are found from a header
row when there is one (name / roll / email), otherwise from what each cell looks like. Matching:

    roll number or email  -> "sure"   (ticked by default)
    exact name            -> "sure"
    close name only       -> "check"  (shown, but not ticked: a person decides)
    roll matches, name clearly different -> "check"

Nothing is approved here; the placement cell reviews the matches and approves them in one go.
"""
import csv
import io
import re
import zipfile
from difflib import SequenceMatcher
from xml.etree import ElementTree

from fastapi import HTTPException

from .documents import MAX_BYTES, extract_text

EMAIL = re.compile(r"[\w.+-]+@[\w-]+(\.[\w-]+)+")
ROLLISH = re.compile(r"^(?=.*\d)[A-Za-z0-9/_-]{3,20}$")
HEAD = {
    "name": ("name", "student name", "full name", "candidate", "student"),
    "first": ("first name", "firstname", "given name"),
    "last": ("last name", "lastname", "surname", "family name"),
    "roll": ("roll", "roll no", "roll number", "roll no.", "enrolment", "enrollment", "enrolment no", "enrollment no",
             "prn", "uid", "registration", "reg no", "id", "student id", "admission no", "usn"),
    "email": ("email", "e-mail", "email id", "mail", "email address"),
}


# ---- reading the file into rows of cells ---------------------------------------------
def _xlsx_rows(data: bytes) -> list:
    ns = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            for si in ElementTree.fromstring(z.read("xl/sharedStrings.xml")).iter(f"{ns}si"):
                shared.append("".join(t.text or "" for t in si.iter(f"{ns}t")))
        sheet = sorted(n for n in z.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml$", n))
        if not sheet:
            raise HTTPException(400, "That Excel file has no sheets")
        root = ElementTree.fromstring(z.read(sheet[0]))
    rows = []
    for row in root.iter(f"{ns}row"):
        cells = {}
        for c in row.iter(f"{ns}c"):
            col = re.sub(r"\d", "", c.get("r", "")) or str(len(cells))
            v = c.find(f"{ns}v")
            if c.get("t") == "s" and v is not None:
                val = shared[int(v.text)]
            elif c.get("t") == "inlineStr":
                val = "".join(t.text or "" for t in c.iter(f"{ns}t"))
            else:
                val = v.text if v is not None else ""
            if val and re.fullmatch(r"\d+\.0", val):
                val = val[:-2]           # roll numbers stored as numbers come back as "123.0"
            cells[col] = val
        ordered = [cells[k] for k in sorted(cells, key=lambda k: (len(k), k))]
        if any(x.strip() for x in ordered):
            rows.append(ordered)
    return rows


def _text_rows(text: str) -> list:
    rows = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        cells = re.split(r"\t|\s*[,;|]\s*|\s{2,}", line)
        rows.append([c for c in cells if c.strip()])
    return rows


def read_rows(filename: str, data: bytes) -> list:
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "The list must be under 5 MB")
    name = (filename or "").lower()
    try:
        if name.endswith(".xlsx"):
            return _xlsx_rows(data)
        if name.endswith(".xls"):
            raise HTTPException(400, "Old .xls files can't be read. Save it as .xlsx or CSV and upload again.")
        if name.endswith((".csv", ".tsv")):
            text = data.decode("utf-8-sig", errors="ignore")
            try:
                dialect = csv.Sniffer().sniff(text[:4000], delimiters=",;\t|")
            except csv.Error:
                dialect = csv.excel
            return [r for r in csv.reader(io.StringIO(text), dialect) if any(c.strip() for c in r)]
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(400, "Couldn't read that file. Is it damaged or password-protected?")
    if name.endswith((".pdf", ".docx", ".txt", ".md")):
        return _text_rows(extract_text(filename, data, "student list"))
    raise HTTPException(400, "Upload the list as CSV, Excel (.xlsx), PDF, Word (.docx) or a text file")


# ---- understanding the rows --------------------------------------------------------------
def _head_kind(cell: str):
    c = re.sub(r"[^a-z ]", " ", cell.lower()).strip()
    c = re.sub(r"\s+", " ", c)
    for kind, words in HEAD.items():
        if c in words:
            return kind
    return None


def entries(rows: list) -> list:
    """[{name, roll, email, line}] from the rows, using a header row if the file has one."""
    header_at, cols = None, {}
    for i, row in enumerate(rows[:5]):
        kinds = {j: _head_kind(c) for j, c in enumerate(row)}
        found = {}
        for j, k in kinds.items():
            if k and k not in found:
                found[k] = j            # kind -> column (first column of each kind wins)
        if len(found) >= 2 or ({"name", "roll", "email"} & found.keys() and len(row) == 1):
            header_at, cols = i, found
            break
    out = []
    for row in rows[header_at + 1 if header_at is not None else 0:]:
        line = " · ".join(c.strip() for c in row if c.strip())
        e = {"name": "", "roll": "", "email": "", "line": line[:200]}
        if cols:
            get = lambda k: row[cols[k]].strip() if k in cols and cols[k] < len(row) else ""
            e["email"] = get("email")
            e["roll"] = get("roll")
            e["name"] = get("name") or " ".join(x for x in (get("first"), get("last")) if x)
        else:
            rest, cells = [], []
            for c in (c.strip() for c in row):
                # "1. Rohan Verma 22ME100" in one cell: pull roll numbers, emails and serials out of the words
                parts = c.split()
                ids = [p for p in parts if EMAIL.fullmatch(p) or any(ch.isdigit() for ch in p)]
                words = " ".join(p for p in parts if p not in ids)
                cells += ids + ([words] if words else [])
            for c in cells:
                if not c:
                    continue
                if not e["email"] and EMAIL.fullmatch(c):
                    e["email"] = c
                elif re.fullmatch(r"(\+?91[ -]?)?[6-9]\d{9}", c):
                    continue  # a mobile number, not a roll number
                elif not e["roll"] and ROLLISH.match(c) and (not c.isdigit() or len(c) >= 4):
                    e["roll"] = c
                elif re.fullmatch(r"\d{1,3}\.?", c):
                    continue  # serial number column
                else:
                    rest.append(c)
            e["name"] = " ".join(rest)
            if not e["email"]:
                m = EMAIL.search(line)
                e["email"] = m.group(0) if m else ""
        if e["name"] or e["roll"] or e["email"]:
            out.append(e)
    return out


def norm_name(n: str) -> str:
    n = re.sub(r"[^a-z ]", " ", (n or "").lower())
    return " ".join(sorted(w for w in n.split() if len(w) > 1 or len(n.split()) == 1))


def norm_roll(r: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (r or "").upper())


def name_score(a: str, b: str) -> float:
    a, b = norm_name(a), norm_name(b)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    return SequenceMatcher(None, a, b).ratio()


def match(rows: list, students: list, approved: list = ()) -> dict:
    """Compare the list with waiting students. Each student matches at most one list row and vice versa.
    `approved` (students already approved) only stops their rows being reported as "not signed up"."""
    es = entries(rows)
    by_roll = {norm_roll(e["roll"]): i for i, e in enumerate(es) if norm_roll(e["roll"])}
    by_email = {e["email"].lower(): i for i, e in enumerate(es) if e["email"]}
    by_name = {}
    for i, e in enumerate(es):
        if norm_name(e["name"]):
            by_name.setdefault(norm_name(e["name"]), []).append(i)
    used, matched, missing = set(), [], []
    for s in students:
        hit, how, sure, note = None, None, True, None
        r, em = norm_roll(s.get("roll_number")), (s.get("email") or "").lower()
        if em and em in by_email and by_email[em] not in used:
            hit, how = by_email[em], "email"
        elif r and r in by_roll and by_roll[r] not in used:
            hit, how = by_roll[r], "roll number"
        if hit is not None and es[hit]["name"] and name_score(es[hit]["name"], s["name"]) < 0.6:
            sure, note = False, f"name in your list is “{es[hit]['name']}”"
        if hit is None:
            same = [i for i in by_name.get(norm_name(s["name"]), []) if i not in used]
            if len(same) == 1:
                hit, how = same[0], "name"
                if es[hit]["roll"] and r and norm_roll(es[hit]["roll"]) != r:
                    sure, note = False, f"roll number in your list is {es[hit]['roll']}"
            elif len(same) > 1:
                hit, how, sure, note = same[0], "name", False, "this name appears more than once in your list"
        if hit is None:
            best = max(((name_score(e["name"], s["name"]), i) for i, e in enumerate(es) if i not in used and e["name"]),
                        default=(0, None))
            if best[0] >= 0.85:
                hit, how, sure, note = best[1], "similar name", False, f"closest name in your list is “{es[best[1]]['name']}”"
        if hit is None:
            missing.append(s)
            continue
        used.add(hit)
        matched.append({"student": s, "row": es[hit]["line"], "matched_by": how, "sure": sure, "note": note})
    done_rolls = {norm_roll(a.get("roll_number")) for a in approved} - {""}
    done_emails = {(a.get("email") or "").lower() for a in approved} - {""}
    done_names = {norm_name(a.get("name")) for a in approved} - {""}
    already = {i for i, e in enumerate(es) if i not in used and (
        norm_roll(e["roll"]) in done_rolls or e["email"].lower() in done_emails
        or (not e["roll"] and not e["email"] and norm_name(e["name"]) in done_names))}
    not_signed_up = [e["line"] for i, e in enumerate(es) if i not in used and i not in already]
    return {"rows_read": len(es), "matched": matched, "not_in_list": missing, "already_approved": len(already),
            "list_only": not_signed_up[:300], "list_only_count": len(not_signed_up)}
