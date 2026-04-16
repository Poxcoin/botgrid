import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

export default function ProtectedRoute({ children }) {
  const token = localStorage.getItem('kado_token');
  const location = useLocation();
  if (!token) {
    return <Navigate to="/auth?mode=login" state={{ from: location }} replace />;
  }
  return children;
}
