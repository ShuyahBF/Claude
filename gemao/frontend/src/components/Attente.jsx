// Jauge circulaire transparente (arc qui tourne) pour toute attente longue, avec le texte « Patientez… ».
export default function Attente({ texte = "Patientez…" }) {
  return <div className="attente" role="status"><span className="jauge" aria-hidden /> {texte}</div>;
}
