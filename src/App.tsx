import { Navigate, Route, Routes } from "react-router-dom";
import { Admin } from "./pages/Admin";
import { DriveCallback } from "./pages/DriveCallback";
import { EventForm } from "./pages/EventForm";
import { GuestUpload } from "./pages/GuestUpload";
import { Home } from "./pages/Home";
import { Privacy } from "./pages/Privacy";
import { Reception } from "./pages/Reception";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/new" element={<EventForm />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/drive-callback" element={<DriveCallback />} />
      <Route path="/e/:eventId" element={<Reception />} />
      <Route path="/e/:eventId/edit" element={<EventForm />} />
      <Route path="/e/:eventId/admin" element={<Admin />} />
      <Route path="/g/:eventId/:guestId" element={<GuestUpload />} />
      <Route path="/u/:token" element={<GuestUpload />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
