// src/library/LibraryApp.jsx
//
// Route Library surface, mounted at /library/* in the standalone app. Lazy-
// loaded so Travel-only users never download the storefront (or supabase-js).
// Wrapped in LibraryAuthProvider so the submission flow can require sign-in
// (approach A — Supabase auth on the standalone origin).

import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { LibraryAuthProvider } from "./lib/libraryAuth";
import LibraryBrowse from "./LibraryBrowse";
import ListingDetail from "./ListingDetail";
import SubmitRoute from "./SubmitRoute";
import AdminReview from "./AdminReview";

export default function LibraryApp() {
  return (
    <LibraryAuthProvider>
      <Routes>
        <Route index element={<LibraryBrowse />} />
        <Route path="submit" element={<SubmitRoute />} />
        <Route path="admin" element={<AdminReview />} />
        <Route path=":id" element={<ListingDetail />} />
        <Route path="*" element={<Navigate to="/library" replace />} />
      </Routes>
    </LibraryAuthProvider>
  );
}
