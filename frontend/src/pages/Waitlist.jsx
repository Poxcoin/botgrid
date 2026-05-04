import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Waitlist() {
  const navigate = useNavigate();
  useEffect(() => { navigate('/auth?mode=register', { replace: true }); }, []);
  return null;
}
