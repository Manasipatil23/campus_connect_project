import { useNavigate } from "react-router-dom";
import { Check, Clock, LogOut, RefreshCw, XCircle } from "lucide-react";
import { useAuth } from "../auth";
import Logo from "../components/Logo";

function Steps({ items }) {
  return (
    <ol className="space-y-5">
      {items.map(([label, state, note], i) => (
        <li key={i} className="flex gap-4">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
            state === "done" ? "bg-emerald-500 text-white" : state === "wait" ? "bg-brand-600 text-white" : state === "no" ? "bg-rose-500 text-white" : "bg-black/[.06] text-ink-muted"}`}>
            {state === "done" ? <Check className="h-4 w-4" /> : state === "wait" ? <Clock className="h-4 w-4 animate-pulse" /> : state === "no" ? <XCircle className="h-4 w-4" /> : i + 1}
          </span>
          <div><div className="font-medium">{label}</div>{note && <div className="text-sm text-ink-muted">{note}</div>}</div>
        </li>
      ))}
    </ol>
  );
}

export default function Pending() {
  const { user, signOut, refresh } = useAuth();
  const navigate = useNavigate();
  const rejected = user.status === "rejected";
  const suspended = user.status === "suspended";
  const college = user.college;
  const company = user.company_org;

  let items;
  if (suspended) {
    items = [
      ["Email verified", "done", user.email],
      ["Account on hold", "no", `Your placement cell has put your account on hold${user.review_note ? `: ${user.review_note.replace(/[.!?\s]*$/, "")}.` : "."} Contact them to get access back.`],
    ];
  } else if (user.role === "student") {
    const cOk = college?.status === "approved";
    items = [
      ["Email verified", "done", user.email],
      [`Joined ${college?.name || "your college"}`, cOk ? "done" : "wait", cOk ? "Verified college" : "Waiting for the college to be verified"],
      ["Approved by your placement cell", rejected ? "no" : "wait",
        rejected ? `Your placement cell didn't approve this account${user.review_note ? `: ${user.review_note}` : "."} Contact them if this is a mistake.`
          : "Your placement officer checks your roll number and details. You'll get full access as soon as they approve."],
    ];
  } else {
    const org = college || company;
    const kind = college ? "college" : "company";
    items = [
      ["Email verified", "done", user.email],
      [`${kind === "college" ? "College" : "Company"} details submitted`, "done", org?.name],
      ["Verified by Campus Connect", org?.status === "rejected" ? "no" : "wait",
        org?.status === "rejected" ? `Verification wasn't approved${org.review_note ? `: ${org.review_note}` : "."}`
          : kind === "college" ? "We check your AISHE code, NAAC grade and official domain — usually within a working day."
            : "We check your CIN/GSTIN and work domain — usually within a working day."],
    ];
  }

  return (
    <div className="relative isolate grid min-h-screen place-items-center overflow-hidden px-5 py-10">
      <div aria-hidden className="grid-squares absolute inset-0 -z-10" />
      <div className="card w-full max-w-lg p-8 sm:p-10">
        <Logo />
        <h1 className="mt-8 text-3xl font-medium tracking-[-0.03em]">
          {suspended ? "Account on hold" : rejected ? "Account not approved" : <>Almost there, <span className="accent">{user.name.split(" ")[0]}.</span></>}
        </h1>
        <p className="mt-2 text-ink-muted">{rejected || suspended ? "Here's where things stand." : "Your account is created. Here's what happens next."}</p>
        <div className="mt-8"><Steps items={items} /></div>
        <div className="mt-10 flex flex-wrap gap-3">
          <button className="btn-primary" onClick={refresh}><RefreshCw className="h-4 w-4" /> Check again</button>
          <button className="btn-ghost" onClick={() => { signOut(); navigate("/"); }}><LogOut className="h-4 w-4" /> Sign out</button>
        </div>
      </div>
    </div>
  );
}
