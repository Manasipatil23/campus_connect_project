import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BadgeCheck, Check, Clock, Handshake, MapPin, MessageSquare, Search, Send, Users, X } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Reveal, Tilt } from "../components/fx/motion";
import { ErrorNote, Modal, PageHeader, Spinner, Tabs, ago, useApi } from "../components/ui";

const KIND_LABEL = { info_request: "Asked for more information", date_confirmation: "Date confirmation", document_request: "Document request" };

function Thread({ conn, onChange }) {
  const { data, reload } = useApi(`/connections/${conn.id}/messages`);
  const [text, setText] = useState("");
  const [kind, setKind] = useState(conn.status === "pending" ? "info_request" : "message");
  const [err, setErr] = useState(null);
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [data]);
  const send = async (e) => {
    e.preventDefault(); setErr(null);
    try { await api(`/connections/${conn.id}/messages`, { method: "POST", body: { text, kind } }); setText(""); reload(); onChange(); }
    catch (e2) { setErr(e2.message); }
  };
  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-muted">Shared between both teams and kept as a communication log: requirements, proposed dates, document requests and confirmations.</p>
      <div className="max-h-[50vh] space-y-3 overflow-y-auto rounded-2xl bg-black/[.02] p-4">
        {!data ? <Spinner /> : data.length === 0 ? <p className="text-center text-sm text-ink-muted">No messages yet.</p> : data.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? "justify-end" : ""}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${m.mine ? "bg-ink text-white" : "border border-black/[.06] bg-white"}`}>
              {KIND_LABEL[m.kind] && <div className={`mb-1 text-[11px] font-medium ${m.mine ? "text-brand-200" : "text-brand-700"}`}>{KIND_LABEL[m.kind]}</div>}
              <div className="whitespace-pre-line">{m.text}</div>
              <div className={`mt-1 text-[11px] ${m.mine ? "text-white/60" : "text-ink-muted"}`}>{m.by_name} · {ago(m.at)}</div>
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form onSubmit={send} className="space-y-2">
        <div className="flex gap-2">
          <select className="input w-auto" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="message">Message</option><option value="info_request">Ask for information</option>
            {conn.status === "accepted" && <><option value="date_confirmation">Date confirmation</option><option value="document_request">Document request</option></>}
          </select>
          <input className="input flex-1" value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message" required />
          <button className="btn-primary px-4" aria-label="Send"><Send className="h-4 w-4" /></button>
        </div>
        <ErrorNote>{err}</ErrorNote>
      </form>
    </div>
  );
}

const TIER_STYLE = { 1: "bg-ink text-white", 2: "bg-brand-600 text-white", 3: "bg-brand-100 text-brand-800" };

function ConnectButton({ conn, onConnect, onRespond, onThread, onCancel }) {
  if (!conn || conn.status === "declined" || conn.status === "cancelled") return <button className="btn-primary w-full" onClick={onConnect}><Handshake className="h-4 w-4" /> {conn ? "Connect again" : "Connect"}</button>;
  if (conn.status === "accepted") return (
    <div className="flex w-full gap-2">
      <span className="btn flex-1 bg-emerald-50 text-emerald-700"><Check className="h-4 w-4" /> Connected</span>
      <button className="btn-ghost relative px-3" onClick={onThread} aria-label="Messages"><MessageSquare className="h-4 w-4" />
        {conn.unread > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] text-white">{conn.unread}</span>}</button>
    </div>
  );
  if (conn.incoming) return (
    <div className="flex w-full gap-2">
      <button className="btn-ghost flex-1 text-rose-600" onClick={() => onRespond("reject")}><X className="h-4 w-4" /> Decline</button>
      <button className="btn-primary flex-1" onClick={() => onRespond("approve")}><Check className="h-4 w-4" /> Accept</button>
    </div>
  );
  return (
    <div className="flex w-full gap-2">
      <span className="btn flex-1 bg-black/[.04] text-ink-muted"><Clock className="h-4 w-4" /> Requested</span>
      <button className="btn-ghost px-3 text-xs" onClick={onCancel}>Cancel</button>
    </div>
  );
}

export default function Connect() {
  const { user } = useAuth();
  const isCollege = user.role === "coordinator";
  const { data: dir, error, reload } = useApi(isCollege ? "/directory/companies" : "/directory/colleges");
  const { data: conns, reload: reloadConns } = useApi("/connections");
  const [q, setQ] = useState("");
  const [tier, setTier] = useState("all");
  const [show, setShow] = useState("all");
  const [asking, setAsking] = useState(null);
  const [message, setMessage] = useState("");
  const [err, setErr] = useState(null);
  const [params, setParams] = useSearchParams();
  const threadId = params.get("thread");
  const thread = (conns || []).find((c) => c.id === threadId);

  const byOther = useMemo(() => Object.fromEntries((conns || []).map((c) => [isCollege ? c.company_id : c.college_id, c])), [conns, isCollege]);
  const incoming = (conns || []).filter((c) => c.incoming && c.status === "pending");
  const list = useMemo(() => (dir || []).filter((o) => {
    const text = `${o.name} ${o.city || ""} ${o.state || ""} ${o.industry || ""} ${o.hq_city || ""}`.toLowerCase();
    const conn = byOther[o.id];
    return text.includes(q.toLowerCase()) && (tier === "all" || String(o.tier) === tier)
      && (show === "all" || (show === "connected" ? conn?.status === "accepted" : !conn || conn.status !== "accepted"));
  }), [dir, q, tier, show, byOther]);

  const refresh = () => { reload(); reloadConns(); };
  const send = async () => {
    setErr(null);
    try {
      await api("/connections", { method: "POST", body: { [isCollege ? "company_id" : "college_id"]: asking.id, message: message || null } });
      setAsking(null); setMessage(""); refresh();
    } catch (e) { setErr(e.message); }
  };
  const cancel = async (conn) => {
    if (!window.confirm("Cancel this connection request?")) return;
    try { await api(`/connections/${conn.id}/cancel`, { method: "POST" }); refresh(); } catch (e) { setErr(e.message); }
  };
  const respond = async (conn, decision) => {
    try { await api(`/connections/${conn.id}/decision`, { method: "POST", body: { decision } }); refresh(); }
    catch (e) { setErr(e.message); }
  };

  return (
    <>
      <PageHeader eyebrow={isCollege ? user.college?.name : user.company}
        title={isCollege ? "Companies hiring" : "Colleges to"} accent={isCollege ? "on campus." : "hire from."}
        subtitle={isCollege ? "Verified companies on Campus Connect. Connect to let them run drives at your college." : "Verified colleges by tier and city. Once a placement cell accepts your request, you can post drives there."} />

      {incoming.length > 0 && (
        <Reveal className="mb-8">
          <div className="rounded-3xl bg-ink p-6 text-white">
            <div className="mb-4 flex items-center gap-2 font-medium"><Send className="h-4 w-4 text-brand-300" /> {incoming.length} connection request{incoming.length > 1 ? "s" : ""} waiting</div>
            <div className="grid gap-3 md:grid-cols-2">
              {incoming.map((c) => (
                <div key={c.id} className="rounded-2xl bg-white/5 p-4">
                  <div className="font-medium">{c.other?.name}</div>
                  <div className="text-sm text-white/60">{isCollege ? `${c.other?.industry} · ${c.other?.hq_city}` : `${c.other?.city} · Tier ${c.other?.tier}`}</div>
                  {c.message && <p className="mt-2 text-sm text-white/80">“{c.message}”</p>}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button className="btn flex-1 border border-white/20 text-white hover:bg-white/10" onClick={() => setParams({ thread: c.id })}>Ask for info{c.unread ? ` (${c.unread})` : ""}</button>
                    <button className="btn flex-1 border border-white/20 text-white hover:bg-white/10" onClick={() => respond(c, "reject")}>Decline</button>
                    <button className="btn flex-1 bg-white text-ink hover:bg-brand-50" onClick={() => respond(c, "approve")}>Accept</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input className="input pl-10" placeholder={isCollege ? "Search company, industry, city" : "Search college, city, state"} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {!isCollege && <Tabs value={tier} onChange={setTier} options={[["all", "All tiers"], ["1", "Tier 1"], ["2", "Tier 2"], ["3", "Tier 3"]]} />}
        <Tabs value={show} onChange={setShow} options={[["all", "All"], ["connected", "Connected"], ["new", "Not connected"]]} />
      </div>
      <ErrorNote>{err || error}</ErrorNote>

      {!dir ? <Spinner /> : (
        <div className="mt-2 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((o, i) => {
            const conn = byOther[o.id];
            return (
              <Reveal key={o.id} delay={(i % 6) * 50}>
                <Tilt max={6} className="h-full rounded-2xl">
                  <div className="card flex h-full flex-col p-6">
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-100 to-white text-sm font-semibold text-brand-700">
                        {(o.short || o.name).slice(0, 3).toUpperCase()}
                      </span>
                      {isCollege ? <span className="chip bg-black/[.04] text-ink-soft">{o.size} people</span>
                        : <span className={`chip ${TIER_STYLE[o.tier] || "bg-black/[.05]"}`}>Tier {o.tier}</span>}
                    </div>
                    <div className="mt-4 flex items-center gap-1.5 font-medium">{o.name}<BadgeCheck className="h-4 w-4 text-brand-600" /></div>
                    <div className="mt-1 flex items-center gap-1 text-sm text-ink-muted"><MapPin className="h-3.5 w-3.5" />{isCollege ? o.hq_city : `${o.city}, ${o.state}`}</div>
                    <p className="mt-3 flex-1 text-sm text-ink-muted">
                      {isCollege ? o.about : `NAAC ${o.naac_grade || "—"} · ${o.institution_type || ""}`}
                    </p>
                    <div className="mt-4 flex items-center gap-4 text-xs text-ink-muted">
                      {isCollege ? <span>{o.industry} · {o.drives_posted} drives on Campus Connect</span>
                        : <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{o.students} students on Campus Connect</span>}
                    </div>
                    <div className="mt-5">
                      <ConnectButton conn={conn} onConnect={() => setAsking(o)} onRespond={(d) => respond(conn, d)}
                        onThread={() => setParams({ thread: conn.id })} onCancel={() => cancel(conn)} />
                    </div>
                  </div>
                </Tilt>
              </Reveal>
            );
          })}
        </div>
      )}

      <Modal open={Boolean(thread)} onClose={() => setParams({})} wide title={thread ? `${thread.other?.name} · ${thread.status_label}` : ""}>
        {thread && <Thread conn={thread} onChange={reloadConns} />}
      </Modal>

      <Modal open={Boolean(asking)} onClose={() => setAsking(null)} title={asking ? `Connect with ${asking.name}` : ""}>
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">{isCollege ? "They'll see your college and can accept to start running drives with you." : "The placement cell will see your company profile and message."}</p>
          <div><label className="label">Message (optional)</label>
            <textarea className="input h-28" value={message} onChange={(e) => setMessage(e.target.value)}
              placeholder={isCollege ? "We have 400+ CS/IT graduates in 2026 and would love to host you." : "We're hiring 10 backend engineers for our Pune office."} /></div>
          <ErrorNote>{err}</ErrorNote>
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setAsking(null)}>Cancel</button><button className="btn-primary" onClick={send}><Send className="h-4 w-4" /> Send request</button></div>
        </div>
      </Modal>
    </>
  );
}
