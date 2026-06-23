// src/library/LibraryApp.jsx
//
// Route Library surface, mounted at /library/* in the standalone app. Lazy-
// loaded so Travel-only users never download the storefront (or supabase-js).

import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import LibraryBrowse from "./LibraryBrowse";
import ListingDetail from "./ListingDetail";

export default function LibraryApp() {
  return (
    <Routes>
      <Route index element={<LibraryBrowse />} />
      <Route path=":id" element={<ListingDetail />} />
      <Route path="*" element={<Navigate to="/library" replace />} />
    </Routes>
  );
}
