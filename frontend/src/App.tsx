import { Navigate, Route, Routes } from "react-router-dom";

import AppShell from "@/components/AppShell";
import AuthTokenBridge from "@/components/auth/AuthTokenBridge";
import ClerkAuthProvider from "@/components/auth/ClerkAuthProvider";
import AuthPage from "@/pages/AuthPage";
import Chat from "@/pages/Chat";
import Dashboard from "@/pages/Dashboard";
import Facilities from "@/pages/Facilities";
import Home from "@/pages/Home";
import Scan from "@/pages/Scan";
import AdminLayout from "@/pages/admin/AdminLayout";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminRecords from "@/pages/admin/AdminRecords";
import AdminGuidelines from "@/pages/admin/AdminGuidelines";
import AdminFacilities from "@/pages/admin/AdminFacilities";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminFeedback from "@/pages/admin/AdminFeedback";
import AdminAudit from "@/pages/admin/AdminAudit";
import AdminTips from "@/pages/admin/AdminTips";
import AdminDoorstep from "@/pages/admin/AdminDoorstep";
import AdminSettings from "@/pages/admin/AdminSettings";
import Pickup from "@/pages/Pickup";

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  return (
    <ClerkAuthProvider>
      <AuthTokenBridge />
      <Routes>
        <Route path="/sign-in/*" element={<AuthPage mode="sign-in" />} />
        <Route path="/sign-up/*" element={<AuthPage mode="sign-up" />} />

        {/* Admin panel — own URL, own layout, admin role checked on server + client */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="records" element={<AdminRecords />} />
          <Route path="categories" element={<AdminGuidelines />} />
          <Route path="facilities" element={<AdminFacilities />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="feedback" element={<AdminFeedback />} />
          <Route path="audit" element={<AdminAudit />} />
          <Route path="tips" element={<AdminTips />} />
          <Route path="doorstep" element={<AdminDoorstep />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>

        {/* Citizen app — unchanged pages */}
        <Route element={<AppShell />}>
          <Route path="/" element={<Home />} />
          <Route path="/scan" element={<Scan />} />
          <Route path="/assistant" element={<Chat />} />
          <Route path="/facilities" element={<Facilities />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/pickup" element={<Pickup />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </ClerkAuthProvider>
  );
}
