import { useEffect, useRef, useState } from "react";
import { Download, FileText } from "lucide-react";
import { getToken } from "../api";
import { ErrorNote, Spinner } from "./ui";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Word stores bullets as Symbol/Wingdings font codes, which browsers don't have: map them to real characters
const WORD_BULLETS = { "": "•", "": "▪", "": "■", "": "➢", "": "❖", "": "✓", "": "□", "": "➔" };
function fixWordBullets(root) {
  for (const s of root.querySelectorAll("style")) {
    const css = s.textContent.replace(/[-]/g, (c) => WORD_BULLETS[c] || "•")
      .replace(/font-family:\s*(Symbol|Wingdings)\s*;/g, "");
    if (css !== s.textContent) s.textContent = css;
  }
}

/** A resume shown in the format it was submitted in: PDF in the browser's viewer, Word (.docx) with
 *  its layout, plain text as text. `path` is an API path that returns the file. */
export default function ResumeViewer({ path, fallbackName = "resume" }) {
  const [doc, setDoc] = useState(null);   // {kind: "pdf" | "docx" | "text", url?, blob?, text?, name}
  const [err, setErr] = useState(null);
  const docxBox = useRef(null);

  useEffect(() => {
    let live = true, url = null;
    setDoc(null); setErr(null);
    (async () => {
      const token = getToken();
      const res = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `Couldn't open the resume (${res.status})`);
      const type = (res.headers.get("Content-Type") || "").split(";")[0];
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || fallbackName;
      if (res.headers.get("X-Resume-Kind") === "text" || type === "text/plain") {
        const text = await res.text();
        if (live) setDoc({ kind: "text", text, name, submittedAsText: res.headers.get("X-Resume-Kind") === "text" });
        return;
      }
      const blob = await res.blob();
      url = URL.createObjectURL(blob);
      if (live) setDoc({ kind: type === DOCX ? "docx" : "pdf", url, blob, name });
    })().catch((e) => live && setErr(e.message));
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [path, fallbackName]);

  // Word files: render the document itself (fonts, headings, tables) into the page
  useEffect(() => {
    if (doc?.kind !== "docx" || !docxBox.current) return;
    let live = true;
    import("docx-preview").then(({ renderAsync }) => {
      if (!live || !docxBox.current) return;
      docxBox.current.innerHTML = "";
      return renderAsync(doc.blob, docxBox.current, undefined, { inWrapper: true, ignoreLastRenderedPageBreak: true })
        .then(() => {
          const box = docxBox.current;
          if (!live || !box) return;
          fixWordBullets(box);
          // fit the Word page to the window's width, like a document viewer
          const page = box.querySelector("section.docx"), wrap = box.querySelector(".docx-wrapper");
          if (page && wrap) wrap.style.zoom = Math.min(1, (box.clientWidth - 24) / (page.offsetWidth + 40)).toFixed(3);
        });
    }).catch(() => live && setErr("This Word file couldn't be displayed. Download it to read it."));
    return () => { live = false; };
  }, [doc]);

  if (err) return <ErrorNote>{err}</ErrorNote>;
  if (!doc) return <Spinner label="Opening the resume…" />;
  const download = () => {
    const a = Object.assign(document.createElement("a"), { href: doc.url || URL.createObjectURL(new Blob([doc.text], { type: "text/plain" })), download: doc.name });
    document.body.appendChild(a); a.click(); a.remove();
  };
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <FileText className="h-4 w-4 text-brand-600" />
        <span className="min-w-0 font-medium [overflow-wrap:anywhere]">{doc.name}</span>
        <span className="text-xs text-ink-muted">{{ pdf: "PDF", docx: "Word document", text: "Text" }[doc.kind]} · as submitted</span>
        <button className="btn-ghost ml-auto px-3 py-1.5 text-xs" onClick={download}><Download className="h-3.5 w-3.5" /> Download</button>
      </div>
      {doc.kind === "pdf" && <iframe src={doc.url} title="Resume" className="h-[72vh] w-full rounded-xl border border-black/[.06] bg-white" />}
      {doc.kind === "docx" && <div ref={docxBox} className="h-[72vh] overflow-auto rounded-xl border border-black/[.06] bg-black/[.03]" />}
      {doc.kind === "text" && (
        <>
          {doc.submittedAsText && <p className="mb-2 text-xs text-ink-muted">This resume was submitted as text (pasted, or before files were kept), so this is exactly what was submitted.</p>}
          <pre className="max-h-[68vh] overflow-auto whitespace-pre-wrap rounded-xl bg-black/[.03] p-5 font-sans text-sm leading-relaxed text-ink-soft">{doc.text}</pre>
        </>
      )}
    </div>
  );
}
