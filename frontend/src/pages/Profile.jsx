import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { ErrorNote, PageHeader } from "../components/ui";

const BRANCHES = ["Computer", "IT", "EXTC", "Electronics", "Mechanical", "AI & DS", "Civil", "Chemical"];

export default function Profile() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const p = user.profile || {};
  const [f, setF] = useState({
    branch: p.branch || "", cgpa: p.cgpa ?? "", backlogs: p.backlogs ?? 0, grad_year: p.grad_year || new Date().getFullYear(),
    internships: p.internships ?? 0, projects: p.projects ?? 0, certifications: p.certifications ?? 0,
    skills: (p.skills || []).join(", "), phone: p.phone || "", linkedin: p.linkedin || "",
  });
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const firstTime = !p.branch;

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setMsg(null);
    try {
      await api("/students/me/profile", {
        method: "PUT",
        body: {
          ...f, cgpa: Number(f.cgpa), backlogs: Number(f.backlogs), grad_year: Number(f.grad_year),
          internships: Number(f.internships), projects: Number(f.projects), certifications: Number(f.certifications),
          skills: f.skills.split(",").map((s) => s.trim()).filter(Boolean),
        },
      });
      await refresh();
      if (firstTime) navigate("/resume");
      else setMsg("Profile saved.");
    } catch (err) {
      setError(err.message);
    }
  };

  const num = (k, label, props = {}) => (
    <div><label className="label">{label}</label><input type="number" className="input" value={f[k]} onChange={set(k)} required {...props} /></div>
  );

  return (
    <>
      <PageHeader title="Academic profile" subtitle="Used for eligibility checks and your Placement Health Score." />
      <form onSubmit={submit} className="card max-w-3xl space-y-5 p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Branch</label>
            <select className="input" value={f.branch} onChange={set("branch")} required>
              <option value="" disabled>Select…</option>
              {BRANCHES.map((b) => <option key={b}>{b}</option>)}
            </select>
          </div>
          {num("cgpa", "CGPA (out of 10)", { step: "0.01", min: 0, max: 10 })}
          {num("grad_year", "Graduation year", { min: 2020, max: 2035 })}
          {num("backlogs", "Active backlogs", { min: 0 })}
          {num("internships", "Internships", { min: 0 })}
          {num("projects", "Projects", { min: 0 })}
          {num("certifications", "Certifications", { min: 0 })}
        </div>
        <div>
          <label className="label">Skills (comma separated — resume skills are added automatically)</label>
          <input className="input" value={f.skills} onChange={set("skills")} placeholder="python, sql, react" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">Phone</label><input className="input" value={f.phone} onChange={set("phone")} /></div>
          <div><label className="label">LinkedIn URL</label><input className="input" value={f.linkedin} onChange={set("linkedin")} /></div>
        </div>
        <ErrorNote>{error}</ErrorNote>
        {msg && <div className="text-sm text-emerald-700">{msg}</div>}
        <button className="btn-primary">{firstTime ? "Save and continue" : "Save profile"}</button>
      </form>
    </>
  );
}
