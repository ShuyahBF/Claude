import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import Chargement from "@/components/Chargement";

// Page réservée aux utilisateurs connectés (et à l'administrateur si admin = true).
// Sans session : retour à la connexion, puis à la page demandée (paramètre « suite »,
// utile quand on arrive par le QR code d'un marchand).
export default function RouteProtegee({ children, admin = false }) {
  const { user } = useAuth();
  const location = useLocation();
  if (user === undefined) return <Chargement />;
  if (!user) return <Navigate to={`/connexion?suite=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (admin && user.role !== "admin") return <Navigate to="/" replace />;
  return children;
}
