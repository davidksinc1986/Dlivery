import React from 'react';
import { useAppContext } from '../context/AppContext';
import ClientDashboard from './ClientDashboard'; // Lo crearemos en el siguiente paso
import DriverDashboard from './DriverDashboard'; // Lo crearemos en el siguiente paso
import Auth from './Auth'; // Tu antiguo Home.jsx ahora es Auth.jsx

export default function Home() {
  const { isAuthenticated, user } = useAppContext();

  if (!isAuthenticated) {
    return <Auth />; // Muestra el componente de autenticación si no está logueado
  }

  if (user?.role === 'driver') {
    return <DriverDashboard />; // Muestra el dashboard del conductor
  } else {
    return <ClientDashboard />; // Muestra el dashboard del cliente por defecto
  }
}