// LILUVINE, la coach : un visage animé dessiné en SVG (aucune image ni GIF à charger : léger, net sur tous les écrans, jamais bloqué).
// Trois « états » : au repos (elle cligne des yeux), en réflexion (elle regarde en l'air, une bulle de pensée pulse, la tête penche),
// en réponse (elle parle : la bouche bouge). Et une « émotion » qui change son visage et ajoute un petit signe animé :
//   joie = grand sourire + étincelles ; encouragement = étoile qui rebondit ; empathie = joues rosées + cœur qui bat ;
//   surprise = bouche en « o » + sourcils levés ; urgence = visage sérieux + bouclier ; calme = sourire doux.
// Les animations s'arrêtent pour qui a demandé « réduire les animations » dans son téléphone (prefers-reduced-motion).
const STYLE = `
@keyframes lv-clin { 0%,92%,100% { transform: scaleY(1) } 95% { transform: scaleY(0.1) } }
@keyframes lv-parle { 0%,100% { transform: scaleY(0.35) } 50% { transform: scaleY(1.1) } }
@keyframes lv-penche { 0%,100% { transform: rotate(-3deg) } 50% { transform: rotate(4deg) } }
@keyframes lv-souffle { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-1.5px) } }
@keyframes lv-point { 0%,100% { opacity: .25; transform: scale(.7) } 50% { opacity: 1; transform: scale(1.15) } }
@keyframes lv-rebond { 0%,100% { transform: translateY(0) scale(1) } 40% { transform: translateY(-7px) scale(1.15) } }
@keyframes lv-battement { 0%,100% { transform: scale(1) } 30% { transform: scale(1.3) } 60% { transform: scale(1.05) } }
@keyframes lv-etincelle { 0%,100% { opacity: 0; transform: scale(.3) rotate(0) } 50% { opacity: 1; transform: scale(1.1) rotate(45deg) } }
.lv-oeil { transform-box: fill-box; transform-origin: center; animation: lv-clin 4.5s infinite }
.lv-bouche-parle { transform-box: fill-box; transform-origin: center; animation: lv-parle .38s infinite }
.lv-tete-pense { transform-box: fill-box; transform-origin: 50% 90%; animation: lv-penche 2.4s ease-in-out infinite }
.lv-tete { transform-box: fill-box; animation: lv-souffle 3.2s ease-in-out infinite }
.lv-point { transform-box: fill-box; transform-origin: center; animation: lv-point 1.2s infinite }
.lv-rebond { transform-box: fill-box; transform-origin: center; animation: lv-rebond 1.1s ease-in-out infinite }
.lv-coeur { transform-box: fill-box; transform-origin: center; animation: lv-battement 1.2s ease-in-out infinite }
.lv-etincelle { transform-box: fill-box; transform-origin: center; animation: lv-etincelle 1.6s ease-in-out infinite }
@media (prefers-reduced-motion: reduce) { .lv-oeil,.lv-bouche-parle,.lv-tete-pense,.lv-tete,.lv-point,.lv-rebond,.lv-coeur,.lv-etincelle { animation: none !important } }
`;

// Forme de la bouche selon l'émotion (chemins dessinés dans un carré de 100)
const BOUCHES = {
  calme: "M42 63 Q50 70 58 63", joie: "M38 60 Q50 76 62 60 Q50 66 38 60 Z", encouragement: "M40 61 Q50 72 60 61",
  empathie: "M43 66 Q50 62 57 66", surprise: null, urgence: "M43 65 L57 65",
};

export const LIBELLES_ETAT = { repos: "Liluvine vous écoute", reflexion: "Liluvine réfléchit…", parle: "Liluvine vous répond", };

/** `etat` : repos | reflexion | parle ; `emotion` : calme | joie | encouragement | empathie | surprise | urgence ; `taille` en pixels. */
export default function AvatarLiluvine({ etat = "repos", emotion = "calme", taille = 88 }) {
  const reflechit = etat === "reflexion", parle = etat === "parle";
  const humeur = reflechit ? "calme" : emotion;
  const bouche = BOUCHES[humeur];
  const regard = reflechit ? { x: 2.2, y: -2.4 } : { x: 0, y: 0 };            // elle regarde en haut à droite quand elle réfléchit
  return (
    <svg viewBox="0 0 100 100" width={taille} height={taille} role="img" aria-label={`${LIBELLES_ETAT[etat] || ""}${humeur !== "calme" ? ` (${humeur})` : ""}`} data-testid="avatar-liluvine" data-etat={etat} data-emotion={humeur}>
      <style>{STYLE}</style>
      <g className={reflechit ? "lv-tete-pense" : "lv-tete"}>
        {/* Cheveux (derrière), visage, cou */}
        <path d="M18 52 Q14 14 50 12 Q86 14 82 52 Q82 36 50 30 Q18 36 18 52 Z" fill="#3b2a24" />
        <circle cx="50" cy="52" r="30" fill="#c98b5d" />
        <path d="M20 50 Q22 20 50 18 Q78 20 80 50 Q72 34 50 33 Q28 34 20 50 Z" fill="#3b2a24" />
        {/* Joues rosées (empathie, joie) */}
        {(humeur === "empathie" || humeur === "joie") && (<><circle cx="33" cy="60" r="5" fill="#e8736b" opacity=".35" /><circle cx="67" cy="60" r="5" fill="#e8736b" opacity=".35" /></>)}
        {/* Sourcils : levés en cas de surprise, penchés en cas d'empathie */}
        <path d={humeur === "surprise" ? "M34 38 Q39 33 44 38" : humeur === "empathie" ? "M34 41 Q39 38 44 37" : "M34 40 Q39 37 44 40"} stroke="#3b2a24" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d={humeur === "surprise" ? "M56 38 Q61 33 66 38" : humeur === "empathie" ? "M56 37 Q61 38 66 41" : "M56 40 Q61 37 66 40"} stroke="#3b2a24" strokeWidth="2" fill="none" strokeLinecap="round" />
        {/* Yeux (ils clignent ; le regard se déplace en réflexion) */}
        <g transform={`translate(${regard.x} ${regard.y})`}>
          <ellipse className="lv-oeil" cx="40" cy="48" rx="3.6" ry="4.4" fill="#2a1a14" />
          <ellipse className="lv-oeil" cx="60" cy="48" rx="3.6" ry="4.4" fill="#2a1a14" />
          <circle cx="41.2" cy="46.4" r="1.2" fill="#fff" /><circle cx="61.2" cy="46.4" r="1.2" fill="#fff" />
        </g>
        {/* Bouche : bouge quand elle parle, « o » en cas de surprise */}
        {parle ? <ellipse className="lv-bouche-parle" cx="50" cy="65" rx="7" ry="5" fill="#7a2a2a" />
          : humeur === "surprise" ? <ellipse cx="50" cy="65" rx="4.2" ry="5.2" fill="#7a2a2a" />
          : <path d={bouche} fill={humeur === "joie" ? "#7a2a2a" : "none"} stroke="#7a2a2a" strokeWidth="2.2" strokeLinecap="round" />}
      </g>
      {/* Signes animés */}
      {reflechit && (<g aria-hidden="true"><circle className="lv-point" cx="78" cy="22" r="3" fill="#1a56db" /><circle className="lv-point" style={{ animationDelay: ".25s" }} cx="86" cy="14" r="3.6" fill="#1a56db" /><circle className="lv-point" style={{ animationDelay: ".5s" }} cx="93" cy="5" r="4.2" fill="#1a56db" /></g>)}
      {!reflechit && humeur === "joie" && (<g aria-hidden="true" fill="#f5b301"><path className="lv-etincelle" d="M84 24 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" /><path className="lv-etincelle" style={{ animationDelay: ".5s" }} d="M12 30 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6z" /><path className="lv-etincelle" style={{ animationDelay: "1s" }} d="M80 78 l1.4 3.4 3.4 1.4 -3.4 1.4 -1.4 3.4 -1.4 -3.4 -3.4 -1.4 3.4 -1.4z" /></g>)}
      {!reflechit && humeur === "encouragement" && (<path className="lv-rebond" aria-hidden="true" d="M86 14 l3 7 8 .8 -6 5.4 1.8 7.8 -6.8 -4 -6.8 4 1.8 -7.8 -6 -5.4 8 -.8z" fill="#f5b301" />)}
      {!reflechit && humeur === "empathie" && (<path className="lv-coeur" aria-hidden="true" d="M86 24 c-3 -5 -10 -2 -8 3 c1 3 8 8 8 8 c0 0 7 -5 8 -8 c2 -5 -5 -8 -8 -3z" fill="#e8536b" />)}
      {!reflechit && humeur === "urgence" && (<path aria-hidden="true" d="M86 14 l9 3 v8 c0 6 -5 9 -9 11 c-4 -2 -9 -5 -9 -11 v-8z" fill="#b42318" />)}
    </svg>
  );
}
