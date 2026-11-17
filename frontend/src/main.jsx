import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import "./index.css";
import { AuthProvider, useAuth } from "./auth";
import Layout from "./components/Layout";
import { Spinner } from "./components/ui";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import StudentDashboard from "./pages/StudentDashboard";
import StudentDrives from "./pages/StudentDrives";
import ApplicationDetail from "./pages/ApplicationDetail";
import Resume from "./pages/Resume";
import Profile from "./pages/Profile";
import RecruiterDashboard from "./pages/RecruiterDashboard";
import ManageDrives from "./pages/ManageDrives";
import DriveForm from "./pages/DriveForm";
import Applicants from "./pages/Applicants";
import CoordinatorAnalytics from "./pages/AdminAnalytics";
import AdminDashboard, { AdminApprovals } from "./pages/AdminDashboard";
import CollegeStudents from "./pages/CollegeStudents";
import Connect from "./pages/Connect";
import Experiences from "./pages/Experiences";
import Pending from "./pages/Pending";
import CopyCode from "./pages/CopyCode";
import VerifyFromEmail from "./pages/VerifyFromEmail";
import DriveDetail from "./pages/DriveDetail";
import Inbox from "./pages/Inbox";
import Notices from "./pages/Notices";
import Help from "./pages/Help";
import Insights from "./pages/Insights";
import OrgProfile from "./pages/OrgProfile";

function Root() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  if (loading) return <Spinner />;
  if (!user) return pathname === "/" ? <Landing /> : <Navigate to="/login" replace />;
  if (user.status && user.status !== "active") return <Pending />;
  return <Layout />;
}

function ByRole({ student, recruiter, coordinator, admin }) {
  const { user } = useAuth();
  const el = { student, recruiter, coordinator, admin }[user.role];
  return el ?? <Navigate to="/" replace />;
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  return user ? <Navigate to="/" replace /> : children;
}

function App() {
  return (
    <Routes>
      <Route path="/copy" element={<CopyCode />} />
      <Route path="/verify" element={<VerifyFromEmail />} />
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
      <Route path="/" element={<Root />}>
        <Route index element={<ByRole student={<StudentDashboard />} recruiter={<RecruiterDashboard />} coordinator={<CoordinatorAnalytics />} admin={<AdminDashboard />} />} />
        <Route path="drives" element={<ByRole student={<StudentDrives />} recruiter={<ManageDrives />} coordinator={<ManageDrives />} />} />
        <Route path="drives/new" element={<ByRole recruiter={<DriveForm />} coordinator={<DriveForm />} />} />
        <Route path="drives/:id" element={<ByRole student={<DriveDetail />} recruiter={<DriveDetail />} coordinator={<DriveDetail />} />} />
        <Route path="drives/:id/candidates" element={<ByRole recruiter={<Applicants />} coordinator={<Applicants />} />} />
        <Route path="inbox" element={<ByRole recruiter={<Inbox />} coordinator={<Inbox />} />} />
        <Route path="notices" element={<ByRole student={<Notices />} coordinator={<Notices />} />} />
        <Route path="help" element={<ByRole student={<Help />} />} />
        <Route path="approvals/colleges" element={<ByRole admin={<AdminApprovals kind="college" key="college" />} />} />
        <Route path="approvals/companies" element={<ByRole admin={<AdminApprovals kind="company" key="company" />} />} />
        <Route path="insights" element={<ByRole student={<Insights />} />} />
        <Route path="applications/:id" element={<ByRole student={<ApplicationDetail />} />} />
        <Route path="resume" element={<ByRole student={<Resume />} />} />
        <Route path="profile" element={<ByRole student={<Profile />} recruiter={<OrgProfile />} coordinator={<OrgProfile />} />} />
        <Route path="experiences" element={<ByRole student={<Experiences />} />} />
        <Route path="students" element={<ByRole coordinator={<CollegeStudents />} />} />
        <Route path="connect" element={<ByRole coordinator={<Connect />} recruiter={<Connect />} />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
