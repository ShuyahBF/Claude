import { NavLink } from "react-router-dom";

// Onglets de la partie administrateur : catalogue des services USSD / liste des comptes.
export default function OngletsAdmin() {
  const classe = ({ isActive }) => `${isActive ? "btn-primary" : "btn-outline"} btn-sm`;
  return (
    <div className="flex flex-wrap gap-2">
      <NavLink to="/admin" end className={classe}>Catalogue USSD</NavLink>
      <NavLink to="/admin/comptes" className={classe}>Comptes</NavLink>
      <NavLink to="/admin/marchands" className={classe}>Marchands</NavLink>
      <NavLink to="/admin/presse" className={classe}>Presse</NavLink>
    </div>
  );
}
