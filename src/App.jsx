// App.jsx
import React from 'react'; 
import UserRegister from "./components/UserRegister";
import GroupView from "./components/GroupView";
import AdminGroupManagement from "./components/AdminGroupManagement";
import { Routes, Route } from "react-router-dom";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<UserRegister />} />
      <Route path="/group" element={<GroupView />} />
      <Route path="/admin" element={<AdminGroupManagement />} />
    </Routes>
  );
}
