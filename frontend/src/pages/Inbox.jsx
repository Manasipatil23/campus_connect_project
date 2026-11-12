import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BadgeCheck, Check, Eye, Flag, MessageSquare, Send, Trash2, UserCheck, X } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Badge, Empty, ErrorNote, Modal, PageHeader, Spinner, Tabs, ago, fmtDate, fmtTime, useApi } from "../components/ui";
import { ActionsPanel, ChangeLine, ContactList } from "../components/workflow";

/** Requests from the other side waiting for an answer, handled right here. */
function ConnectionRequests({ isCollege, onChange }) {
  const { data, reload } = useApi("/connections");
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(null);
  const incoming = (data || []).filter((c) => c.incoming && c.status === "pending");
  if (!data || incoming.length === 0) return null;
  const respond = async (c, decision) => {
    setErr(null);
    try {
      await api(`/connections/${c.id}/decision`, { method: "POST", body: { decision } });
      setDone(`${c.other?.name}: ${decision === "approve" ? "connected" : "declined"}`);
      reload(); onChange?.();
    } catch (e) { setErr(e.message); }
  };
  return (
    <section className="card p-6">
      <div className="mb-4 flex items-center gap-2">
        <Send className="h-4 w-4 text-brand-600" />
        <h2 className="font-medium">{incoming.length} connection request{incoming.length > 1 ? "s" : ""} waiting for you</h2>
      </div>
      {done && <div className="mb-3 flex items-center gap-1.5 text-sm text-emerald-700"><Check className="h-4 w-4" />{done}</div>}
      <ErrorNote>{err}</ErrorNote>
      <ul className="grid gap-4 md:grid-cols-2">
        {incoming.map((c) => (
          <li key={c.id} className="flex flex-col rounded-2xl border border-brand-100 bg-brand-50/30 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-1.5 font-medium">{c.other?.name}<BadgeCheck className="h-4 w-4 text-brand-600" /></div>
                <div className="text-sm text-ink-muted">
                  {isCollege ? `${c.other?.industry || ""} · ${c.other?.hq_city || ""}` : `${c.other?.city || ""}, ${c.other?.state || ""} · Tier ${c.other?.tier ?? "—"}`}
                </div>
              </div>
              <span className="whitespace-nowrap text-xs text-ink-muted">{ago(c.created_at)}</span>
            </div>
            {c.message && <p className="mt-3 text-sm text-ink-soft">“{c.message}”</p>}
            {c.contacts?.length > 0 && <div className="mt-3 rounded-xl bg-white p-3"><ContactList contacts={c.contacts} /></div>}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button className="btn-primary px-4 py-2" onClick={() => respond(c, "approve")}><Check className="h-4 w-4" /> Accept</button>
              <button className="btn-ghost px-4 py-2" onClick={() => respond(c, "reject")}><X className="h-4 w-4" /> Decline</button>
              <Link to={`/connect?thread=${c.id}`} className="ml-auto inline-flex items-center gap-1 text-sm text-brand-700 hover:underline">
                <MessageSquare className="h-4 w-4" /> Ask a question{c.unread ? ` (${c.unread})` : ""}
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Changes({ canDecide }) {
  const { data, error, reload } = useApi("/changes");
  const [err, setErr] = useState(null);
  const decide = async (c, decision) => {
    setErr(null);
    try { await api(`/changes/${c.id}/decision`, { method: "POST", body: { decision } }); reload(); } catch (e) { setErr(e.message); }
  };
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Spinner />;
  return (
    <div className="card">
      <ErrorNote>{err}</ErrorNote>
      {data.length === 0 ? <Empty>{canDecide ? "No company changes waiting for confirmation." : "Nothing waiting on placement cells."}</Empty> : (
        <ul className="divide-y divide-black/[.05]">
          {data.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-4 px-6 py-4">
              <div className="min-w-0 flex-1">
                <Link to={`/drives/${c.drive_id}`} className="text-sm font-medium text-brand-700 hover:underline">{c.drive}</Link>
                <div className="mt-0.5 text-sm"><b className="font-medium">{c.label}</b><ChangeLine oldV={c.old} newV={c.new} field={c.field} /></div>
                <div className="mt-0.5 text-xs text-ink-muted">{c.proposed_by_name} · {ago(c.created_at)}{c.reason && ` · “${c.reason}”`}</div>
              </div>
              {canDecide ? (
                <div className="flex gap-2">
                  <button className="btn-ghost px-3 py-1.5 text-rose-600" onClick={() => decide(c, "reject")}><X className="h-4 w-4" /> Reject</button>
                  <button className="btn-primary px-3 py-1.5" onClick={() => decide(c, "approve")}><Check className="h-4 w-4" /> Confirm & publish</button>
                </div>
              ) : <Badge value="pending" label="Awaiting placement cell" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const ISSUE_STATUSES = [["open", "Open"], ["in_progress", "In progress"], ["waiting", "Waiting for information"], ["resolved", "Resolved"], ["closed", "Closed"]];

function Issues() {
  const { data, error, reload } = useApi("/issues");
  const [sel, setSel] = useState(null);
  const [filter, setFilter] = useState("active");
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState(null);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Spinner />;
  const list = data.filter((i) => filter === "all" || (filter === "active" ? ["open", "in_progress", "waiting"].includes(i.status) : ["resolved", "closed"].includes(i.status)));
  const update = async (body) => {
    setErr(null);
    try {
      const fresh = await api(`/issues/${sel.id}`, { method: "PATCH", body });
      setSel(fresh); reload();
      if (body.reply) setReply("");
      if (body.internal_note) setNote("");
    } catch (e) { setErr(e.message); }
  };
  return (
    <>
      <div className="mb-4"><Tabs value={filter} onChange={setFilter} options={[["active", "Active"], ["done", "Resolved"], ["all", "All"]]} /></div>
      <div className="card overflow-x-auto">
        {list.length === 0 ? <Empty>No issues here.</Empty> : (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-black/[.06] text-left text-xs text-ink-muted"><tr><th className="px-6 py-3">Issue</th><th>Student</th><th>Owner</th><th>Status</th><th className="pr-6 text-right">Updated</th></tr></thead>
            <tbody className="divide-y divide-black/[.05]">
              {list.map((i) => (
                <tr key={i.id} className="cursor-pointer hover:bg-brand-50/40" onClick={() => setSel(i)}>
                  <td className="px-6 py-3"><div className="font-medium">{i.subject}</div><div className="text-xs text-ink-muted">{i.category}{i.drive_label && ` · ${i.drive_label}`}</div></td>
                  <td>{i.student_name}</td>
                  <td className="text-ink-muted">{i.owner_name || "Unassigned"}</td>
                  <td><Badge value={i.status} label={i.status_label} /></td>
                  <td className="pr-6 text-right text-xs text-ink-muted">{ago(i.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Modal open={Boolean(sel)} onClose={() => setSel(null)} wide title={sel?.subject || ""}>
        {sel && (
          <div className="space-y-5 text-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted"><Badge value={sel.status} label={sel.status_label} /> {sel.category} · {sel.student_name} · raised {fmtTime(sel.created_at)}{sel.owner_name && ` · handled by ${sel.owner_name}`}</div>
            <p className="rounded-xl bg-black/[.03] p-4">{sel.description}</p>
            {sel.replies?.length > 0 && <div><div className="mb-2 text-xs font-medium text-ink-muted">Replies (visible to the student)</div>
              {sel.replies.map((r, k) => <div key={k} className="mb-2 rounded-xl bg-brand-50/60 p-3">{r.text}<div className="mt-1 text-xs text-ink-muted">{r.by} · {ago(r.at)}</div></div>)}</div>}
            {sel.internal_notes?.length > 0 && <div><div className="mb-2 text-xs font-medium text-ink-muted">Internal notes (staff only)</div>
              {sel.internal_notes.map((r, k) => <div key={k} className="mb-2 rounded-xl border border-dashed border-black/10 p-3 text-ink-soft">{r.text}<div className="mt-1 text-xs text-ink-muted">{r.by} · {ago(r.at)}</div></div>)}</div>}
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label">Reply to student</label><textarea className="input h-20" value={reply} onChange={(e) => setReply(e.target.value)} /></div>
              <div><label className="label">Internal note</label><textarea className="input h-20" value={note} onChange={(e) => setNote(e.target.value)} /></div>
            </div>
            <ErrorNote>{err}</ErrorNote>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <select className="input w-auto" value={sel.status} onChange={(e) => update({ status: e.target.value })}>
                  {ISSUE_STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                {!sel.owner_id && <button className="btn-ghost px-3 py-1.5" onClick={() => update({ assign_to_me: true })}><UserCheck className="h-4 w-4" /> Assign to me</button>}
              </div>
              <button className="btn-primary" disabled={!reply && !note} onClick={() => update({ reply: reply || null, internal_note: note || null })}>Save</button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

function Moderation() {
  const { data, error, reload } = useApi("/experiences/moderation/queue");
  const [tags, setTags] = useState({});
  const [err, setErr] = useState(null);
  const act = async (e, decision) => {
    setErr(null);
    try {
      await api(`/experiences/${e.id}/moderate`, { method: "POST", body: { decision, tags: (tags[e.id] || "").split(",").map((t) => t.trim()).filter(Boolean) } });
      reload();
    } catch (x) { setErr(x.message); }
  };
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Spinner />;
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">Experiences are preparation material, not official announcements. Approved posts go live for students; posts marked anonymous never show the author's name.</p>
      <ErrorNote>{err}</ErrorNote>
      {data.length === 0 ? <div className="card"><Empty>Nothing to moderate.</Empty></div> : data.map((e) => (
        <div key={e.id} className="card p-6">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{e.company} · {e.role}</span><span className="text-ink-muted">· {e.round_type}</span>
            {e.verified && <span className="chip bg-emerald-50 text-emerald-700">Verified applicant</span>}
            <Badge value={e.moderation === "pending" ? "pending" : "published"} label={e.moderation === "pending" ? "Awaiting moderation" : "Live"} />
            {e.reports > 0 && <span className="chip bg-rose-50 text-rose-600"><Flag className="mr-1 h-3 w-3" />{e.reports} report{e.reports > 1 ? "s" : ""}</span>}
          </div>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{e.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
          {e.tips && <p className="mt-2 text-sm text-ink-muted">Tip: {e.tips}</p>}
          <div className="mt-2 text-xs text-ink-muted">By {e.author} · {ago(e.created_at)} · difficulty {e.difficulty}/5 · topics {e.topics.join(", ") || "—"}</div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input className="input max-w-xs" placeholder="Add tags (comma separated)" value={tags[e.id] || ""} onChange={(x) => setTags({ ...tags, [e.id]: x.target.value })} />
            <button className="btn-primary px-3 py-1.5" onClick={() => act(e, "approve")}><Eye className="h-4 w-4" /> Approve & publish</button>
            <button className="btn-ghost px-3 py-1.5" onClick={() => act(e, "reject")}><X className="h-4 w-4" /> Reject</button>
            {e.moderation !== "pending" && <button className="btn-ghost px-3 py-1.5 text-rose-600" onClick={() => act(e, "remove")}><Trash2 className="h-4 w-4" /> Remove</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Inbox() {
  const { user } = useAuth();
  const isCollege = user.role === "coordinator";
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "todo";
  const [actionsKey, setActionsKey] = useState(0);
  const setTab = (t) => setParams(t === "todo" ? {} : { tab: t });
  const tabs = isCollege
    ? [["todo", "To do"], ["changes", "Change requests"], ["issues", "Student issues"], ["moderation", "Moderation"]]
    : [["todo", "To do"], ["changes", "Waiting on colleges"]];
  return (
    <>
      <PageHeader eyebrow={isCollege ? user.college?.name : user.company} title="Your" accent="inbox."
        subtitle={isCollege ? "Everything that needs the placement cell: drive reviews, company changes to verify before students see them, student issues and experiences to moderate." : "What needs you, and what's waiting on placement cells."} />
      <div className="mb-6 overflow-x-auto"><Tabs value={tab} onChange={setTab} options={tabs} /></div>
      {tab === "todo" && (
        <div className="space-y-6">
          <ConnectionRequests isCollege={isCollege} onChange={() => setActionsKey((k) => k + 1)} />
          <ActionsPanel key={actionsKey} title="Needs your attention" />
        </div>
      )}
      {tab === "changes" && <Changes canDecide={isCollege} />}
      {tab === "issues" && isCollege && <Issues />}
      {tab === "moderation" && isCollege && <Moderation />}
    </>
  );
}
