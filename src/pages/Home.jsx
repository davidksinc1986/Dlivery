import React from 'react';
import { useAppContext } from '../context/AppContext';
import ClientDashboard from './ClientDashboard';
import DriverDashboard from './DriverDashboard';
import AdminDashboard from './AdminDashboard';
import Auth from './Auth';

export default function Home() {
  const { isAuthenticated, user } = useAppContext();

  if (!isAuthenticated) return <Auth />;
  if (user?.role === 'admin') return <AdminDashboard />;
  if (user?.role === 'driver') return <DriverDashboard />;
  return <ClientDashboard />;
}
