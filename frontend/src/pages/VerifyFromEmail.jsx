import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Check, Copy, Loader2 } from "lucide-react";
import { LogoMark } from "../components/Logo";
import { VERIFY_CHANNEL } from "../components/forms";
import { DRAFT_KEY } from "./Register";

/**
 * Opened by "Verify my email" in the verification email. Link: /verify#<email>|<code>
 * (after the #, so the code never reaches the server).
 *   1. If the sign-up page is still open in this browser, hand it the code: it fills in by itself.
 *   2. Otherwise reopen sign-up at the verify step, with their details and the code filled in.
 *   3. If neither is possible (another device), show the code to copy.
 */
export default function VerifyFromEmail() {
  const navigate = useNavigate();
  const [raw] = useState(() => decodeURIComponent((window.location.hash || "").slice(1)));
  const [email, code] = (() => {
    const i = raw.lastIndexOf("|");
    return i < 0 ? ["", ""] : [raw.slice(0, i).trim().toLowerCase(), raw.slice(i + 1).replace(/\D/g, "").slice(0, 6)];
  })();
  const [state, setState] = useState("handing"); // handing | filled | manual | invalid
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!email || code.length !== 6) return setState("invalid");
    let done = false;
    const filled = () => { if (!done) { done = true; setState("filled"); } };

    // 1. tell the open sign-up tab
    let ch;
    try {
      ch = new BroadcastChannel(VERIFY_CHANNEL);
      ch.onmessage = (e) => { if (e.data?.type === "ack" && e.data.email === email) filled(); };
      ch.postMessage({ type: "code", email, code });
    } catch { ch = null; }
    const onStorage = (e) => {
      if (e.key !== `${VERIFY_CHANNEL}-ack` || !e.newValue) return;
      try { if (JSON.parse(e.newValue).email === email) filled(); } catch { /* ignore */ }
    };
    window.addEventListener("storage", onStorage);
    try { localStorage.setItem(VERIFY_CHANNEL, JSON.stringify({ email, code, at: Date.now() })); } catch { /* ignore */ }

    // 2. nobody answered: reopen sign-up where they left off (same browser), else 3.
    const t = setTimeout(() => {
      if (done) return;
      done = true;
      try {
        const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
        if (d && d.email === email && Date.now() - d.at < 60 * 60 * 1000) {
          sessionStorage.setItem("cc-verify-code", code);
          navigate(`/register?as=${d.kind}&resume=1`, { replace: true });
          return;
        }
      } catch { /* ignore */ }
      setState("manual");
    }, 1200);

    return () => { clearTimeout(t); ch?.close(); window.removeEventListener("storage", onStorage); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = code; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { setCopied(document.execCommand("copy")); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
  };

  return (
    <div className="relative isolate grid min-h-screen place-items-center px-5">
      <div aria-hidden className="grid-squares absolute inset-0 -z-10" />
      <div className="card w-full max-w-sm p-8 text-center">
        <div className="flex items-center justify-center gap-2"><LogoMark className="h-7 w-7" /><span className="font-medium">Campus Connect</span></div>

        {state === "handing" && (
          <p className="mt-8 flex items-center justify-center gap-2 text-sm text-ink-muted"><Loader2 className="h-4 w-4 animate-spin text-brand-600" />Verifying your email…</p>
        )}

        {state === "filled" && (
          <>
            <span className="mx-auto mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50"><Check className="h-6 w-6 text-emerald-600" /></span>
            <h1 className="mt-4 text-xl font-medium">Code filled in</h1>
            <p className="mt-2 text-sm text-ink-muted">Switch back to your Campus Connect sign-up tab to finish. You can close this tab.</p>
          </>
        )}

        {state === "manual" && (
          <>
            <p className="mt-6 text-sm text-ink-muted">Your verification code</p>
            <div className="mt-2 select-all font-mono text-4xl font-bold tracking-[0.3em] text-brand-900">{code}</div>
            <button onClick={copy} className={`mt-6 w-full ${copied ? "btn bg-emerald-600 text-white" : "btn-primary"}`}>
              {copied ? <><Check className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy code</>}
            </button>
            <p className="mt-4 text-sm text-ink-muted">We couldn't find your sign-up in this browser. Paste the code where you started signing up.</p>
            <Link to="/register" className="mt-4 inline-flex items-center gap-1 text-sm text-brand-700 hover:underline">Go to sign-up <ArrowRight className="h-3.5 w-3.5" /></Link>
          </>
        )}

        {state === "invalid" && <p className="mt-6 text-sm text-ink-muted">This link is incomplete. Enter the code from the email on the sign-up page.</p>}
      </div>
    </div>
  );
}
