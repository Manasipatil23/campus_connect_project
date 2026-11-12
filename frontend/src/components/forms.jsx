import { useEffect, useRef, useState } from "react";
import { Check, Eye, EyeOff, Loader2, MailCheck } from "lucide-react";
import { api } from "../api";

export const INDIAN_STATES = ["Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi", "Goa", "Gujarat",
  "Haryana", "Himachal Pradesh", "Jammu & Kashmir", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal"];
export const BRANCHES = ["Computer", "IT", "AI & DS", "EXTC", "Electronics", "Electrical", "Mechanical", "Civil", "Chemical", "Biotech"];

export const RULES = {
  email: [/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i, "Enter a valid email address"],
  phone: [/^(\+91[\s-]?)?[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"],
  landline: [/^(\+91[\s-]?)?[0-9]{10,11}$/, "Enter a valid phone number with STD code"],
  pincode: [/^[1-9]\d{5}$/, "Enter a valid 6-digit PIN code"],
  aishe: [/^[CUS]-\d{3,6}$/i, "AISHE code looks like C-41234"],
  url: [/^https?:\/\/[\w.-]+\.[a-z]{2,}(\/.*)?$/i, "Enter the full URL, e.g. https://www.college.edu.in"],
  domain: [/^[\w-]+(\.[\w-]+)+$/, "Enter a domain like college.edu.in"],
  cin: [/^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/i, "CIN is 21 characters, e.g. U72200MH2015PTC123456"],
  gstin: [/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "GSTIN is 15 characters, e.g. 27AAACN1234A1Z5"],
};

export function check(value, rule) {
  const [re, msg] = RULES[rule];
  return re.test((value || "").trim()) ? null : msg;
}

export function domainFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function Field({ label, error, hint, children, className = "" }) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
      {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}

export function Stepper({ steps, current }) {
  return (
    <ol className="mb-8 flex items-center gap-2">
      {steps.map((s, i) => (
        <li key={s} className="flex flex-1 items-center gap-2">
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium transition ${
            i < current ? "bg-brand-600 text-white" : i === current ? "bg-ink text-white" : "bg-black/[.06] text-ink-muted"}`}>
            {i < current ? <Check className="h-3.5 w-3.5" /> : i + 1}
          </span>
          <span className={`hidden text-xs sm:inline ${i === current ? "font-medium text-ink" : "text-ink-muted"}`}>{s}</span>
          {i < steps.length - 1 && <span className={`h-px flex-1 ${i < current ? "bg-brand-400" : "bg-black/10"}`} />}
        </li>
      ))}
    </ol>
  );
}

export function OtpInput({ value, onChange }) {
  // One real input (works with typing, paste and one-time-code autofill) drawn as six boxes.
  const [focused, setFocused] = useState(false);
  const ref = useRef(null);
  const digits = value.padEnd(6, " ").slice(0, 6).split("");
  return (
    <div className="relative w-fit" onClick={() => ref.current?.focus()}>
      <input ref={ref} value={value} inputMode="numeric" autoComplete="one-time-code" aria-label="Verification code"
        maxLength={6} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        className="absolute inset-0 h-full w-full cursor-text opacity-0" />
      <div className="flex gap-2" aria-hidden="true">
        {digits.map((d, i) => {
          const active = focused && (i === value.length || (value.length === 6 && i === 5));
          return (
            <span key={i} className={`flex h-12 w-11 items-center justify-center rounded-xl border bg-white text-lg font-medium tabular-nums transition ${
              active ? "border-brand-400 ring-4 ring-brand-100" : "border-black/10"}`}>
              {d.trim() || (active ? <span className="h-5 w-px animate-pulse bg-ink" /> : "")}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** Email field + "send code" + 6-digit code entry. Calls onVerifiedEmail(normalisedEmail) once a code was sent. */
export const VERIFY_CHANNEL = "cc-verify";

export function EmailVerify({ email, setEmail, code, setCode, payload, hint, label = "Email" }) {
  // a code already filled in (sign-up reopened from the email) means it was sent
  const [state, setState] = useState({ sending: false, sent: Boolean(code), error: null, dev: null, normalized: code ? email : null });
  const [fromEmail, setFromEmail] = useState(false);
  // a code that arrives later (sign-up reopened from the email) also counts as sent
  useEffect(() => {
    if (code && !state.sent) setState((x) => ({ ...x, sent: true, normalized: x.normalized || (email || "").trim().toLowerCase() }));
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Verify my email" in the email opens /verify, which hands the code to this tab
  useEffect(() => {
    const target = (state.normalized || email || "").trim().toLowerCase();
    const take = (msg) => {
      if (!msg || !/^\d{6}$/.test(msg.code || "") || (msg.email || "").toLowerCase() !== target) return false;
      setCode(msg.code);
      setFromEmail(true);
      setState((x) => ({ ...x, sent: true, normalized: x.normalized || target }));
      return true;
    };
    let ch;
    try {
      ch = new BroadcastChannel(VERIFY_CHANNEL);
      ch.onmessage = (e) => { if (e.data?.type === "code" && take(e.data)) ch.postMessage({ type: "ack", email: target }); };
    } catch { ch = null; }
    const onStorage = (e) => {
      if (e.key !== VERIFY_CHANNEL || !e.newValue) return;
      try {
        const msg = JSON.parse(e.newValue);
        if (take(msg)) localStorage.setItem(`${VERIFY_CHANNEL}-ack`, JSON.stringify({ email: target, at: Date.now() }));
      } catch { /* ignore */ }
    };
    window.addEventListener("storage", onStorage);
    return () => { ch?.close(); window.removeEventListener("storage", onStorage); };
  }, [email, state.normalized]); // eslint-disable-line react-hooks/exhaustive-deps
  const [cool, setCool] = useState(0);
  useEffect(() => {
    if (!cool) return;
    const t = setTimeout(() => setCool(cool - 1), 1000);
    return () => clearTimeout(t);
  }, [cool]);
  const send = async () => {
    const err = check(email, "email");
    if (err) return setState({ ...state, error: err });
    setState({ ...state, sending: true, error: null });
    try {
      const r = await api("/auth/send-code", { method: "POST", body: { email, ...payload } });
      setState({ sending: false, sent: true, error: null, dev: r.dev_code || null, normalized: r.email });
      setEmail(r.email);
      setCool(45);
    } catch (e) {
      setState({ ...state, sending: false, error: e.message });
    }
  };
  return (
    <div className="space-y-4">
      <Field label={label} error={state.error} hint={hint}>
        <div className="flex gap-2">
          <input type="email" className="input" value={email} autoComplete="email"
            onChange={(e) => { setEmail(e.target.value); setState({ ...state, sent: false, dev: null }); setCode(""); }} />
          <button type="button" className="btn-ghost shrink-0 px-4" onClick={send} disabled={state.sending || cool > 0}>
            {state.sending ? <Loader2 className="h-4 w-4 animate-spin" /> : cool ? `Resend in ${cool}s` : state.sent ? "Resend" : "Send code"}
          </button>
        </div>
      </Field>
      {state.sent && (
        <div className="rounded-2xl border border-brand-100 bg-brand-50/50 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm"><MailCheck className="h-4 w-4 text-brand-600" /> Enter the 6-digit code sent to <b className="font-medium">{state.normalized}</b></div>
          <OtpInput value={code} onChange={(v) => { setFromEmail(false); setCode(v); }} />
          {fromEmail && <p className="mt-3 text-xs font-medium text-emerald-700">✓ Code filled in from your email. Continue to the next step.</p>}
          {state.dev && (
            <p className="mt-3 text-xs text-ink-muted">Dev mode (no email server configured): your code is <b className="font-mono text-ink">{state.dev}</b></p>
          )}
        </div>
      )}
    </div>
  );
}

function strength(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^\w\s]/.test(pw)) s++;
  return Math.min(4, s);
}

export function PasswordFields({ pw, setPw, confirm, setConfirm }) {
  const [show, setShow] = useState(false);
  const s = strength(pw);
  const labels = ["Too weak", "Weak", "Okay", "Good", "Strong"];
  return (
    <div className="space-y-4">
      <Field label="Password" error={pw && pw.length < 8 ? "At least 8 characters" : null}>
        <div className="relative">
          <input type={show ? "text" : "password"} className="input pr-10" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
          <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-label={show ? "Hide password" : "Show password"}>
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="flex flex-1 gap-1">{[0, 1, 2, 3].map((i) => <span key={i} className={`h-1 flex-1 rounded-full ${i < s ? (s < 2 ? "bg-rose-400" : s < 3 ? "bg-amber-400" : "bg-emerald-500") : "bg-black/[.07]"}`} />)}</div>
          <span className="w-16 text-right text-xs text-ink-muted">{pw ? labels[s] : ""}</span>
        </div>
      </Field>
      <Field label="Confirm password" error={confirm && confirm !== pw ? "Passwords don't match" : null}>
        <input type={show ? "text" : "password"} className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
      </Field>
    </div>
  );
}
