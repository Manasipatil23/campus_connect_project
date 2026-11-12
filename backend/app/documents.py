"""Read the text out of uploaded documents (job descriptions, resumes).

PDF via pypdf, Word (.docx) by reading the document XML directly, plain text as-is.
Old binary .doc files aren't supported; people are asked to save them as .docx or PDF.
"""
import io
import re
import zipfile
from xml.etree import ElementTree

from fastapi import HTTPException
from pypdf import PdfReader

MAX_BYTES = 5 * 1024 * 1024
TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
    ".md": "text/plain",
}
_W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def extension(filename: str) -> str:
    name = (filename or "").lower()
    return next((ext for ext in TYPES if name.endswith(ext)), "")


def _docx_text(data: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        root = ElementTree.fromstring(z.read("word/document.xml"))
    lines = []
    for para in root.iter(f"{_W}p"):
        parts = []
        for node in para.iter():
            if node.tag == f"{_W}t" and node.text:
                parts.append(node.text)
            elif node.tag in (f"{_W}tab",):
                parts.append("\t")
            elif node.tag in (f"{_W}br", f"{_W}cr"):
                parts.append("\n")
        lines.append("".join(parts))
    return "\n".join(lines)


def extract_text(filename: str, data: bytes, what: str = "file") -> str:
    """The document's text, or a 4xx with a message a person can act on."""
    if len(data) > MAX_BYTES:
        raise HTTPException(413, f"The {what} must be under 5 MB")
    ext = extension(filename)
    if (filename or "").lower().endswith(".doc"):
        raise HTTPException(400, "Old .doc files can't be read. Save it as .docx or PDF and upload again.")
    if not ext:
        raise HTTPException(400, f"Upload the {what} as a PDF or Word (.docx) file")
    try:
        if ext == ".pdf":
            text = "\n".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(data)).pages)
        elif ext == ".docx":
            text = _docx_text(data)
        else:
            text = data.decode("utf-8", errors="ignore")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(400, f"Couldn't read that {ext[1:].upper()} file. Is it damaged or password-protected?")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if len(text) < 30:
        raise HTTPException(400, "No readable text found. If it's a scanned image, upload a text PDF or Word file.")
    return text
