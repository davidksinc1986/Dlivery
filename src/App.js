import Home from "./pages/Home"; 
import { AppProvider } from "./context/AppContext"; 
import "./index.css"; // CSS global

export default function App() {
  return (
    <AppProvider>
      <Home />
    </AppProvider>
  );
}