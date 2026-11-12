import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { LogoMark } from "../components/Logo";

/**
 * Opened from the "Copy code" button in verification emails (email apps can't run a copy
 * button themselves). The code is after the # so it never reaches the server.
 */
export default function CopyCode() {
  const code = (window.location.hash || "").replace(/[^0-9]/g, "").slice(0, 6);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  // older copy method: works after a click even where the clipboard API is blocked
  const legacyCopy = () => {
    const ta = document.createElement("textarea");
    ta.value = code;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    document.body.removeChild(ta);
    return ok;
  };

  const copy = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(code);
      ok = true;
    } catch {
      ok = legacyCopy();
    }
    setCopied(ok);
    setFailed(!ok);
  };

  // try straight away; some browsers need the button press instead
  useEffect(() => { if (code) copy(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative isolate grid min-h-screen place-items-center px-5">
      <div aria-hidden className="grid-squares absolute inset-0 -z-10" />
      <div className="card w-full max-w-sm p-8 text-center">
        <div className="flex items-center justify-center gap-2"><LogoMark className="h-7 w-7" /><span className="font-medium">Campus Connect</span></div>
        {code.length === 6 ? (
          <>
            <p className="mt-6 text-sm text-ink-muted">Your verification code</p>
            <div className="mt-2 select-all font-mono text-4xl font-bold tracking-[0.3em] text-brand-900">{code}</div>
            <button onClick={copy} className={`mt-6 w-full ${copied ? "btn bg-emerald-600 text-white" : "btn-primary"}`}>
              {copied ? <><Check className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy code</>}
            </button>
            <p className="mt-4 text-sm text-ink-muted">
              {copied ? "Go back to the sign-up tab and paste it into the code boxes." : failed ? "Press Copy code, or select the code above." : ""}
            </p>
          </>
        ) : (
          <p className="mt-6 text-sm text-ink-muted">This link doesn't contain a code. Copy it from the email instead.</p>
        )}
      </div>
    </div>
  );
}
