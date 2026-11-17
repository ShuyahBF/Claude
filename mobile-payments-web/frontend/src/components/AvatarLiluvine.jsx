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

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Visage « dessin animé réaliste » (lot 198) : un portrait modelé (peau et cheveux en dégradés, yeux avec iris et reflets, nez, lèvres, boucles d'oreilles, haut bleu auRor).
// Même principe qu'avant : AUCUNE image à charger (SVG), mêmes états (repos / réflexion / réponse) et mêmes émotions ; seul le dessin change.
// Repère : toile de 200 × 200. Les yeux sont en (79, 98) et (121, 98) ; la bouche en (100, 134).
// ---------------------------------------------------------------------------------------------------------------------------------------------
const DEFS = (
  <defs>
    <radialGradient id="lv-peau" cx="46%" cy="40%" r="68%"><stop offset="0" stopColor="#d9a174" /><stop offset=".6" stopColor="#c28459" /><stop offset="1" stopColor="#9a6342" /></radialGradient>
    <linearGradient id="lv-ombre-cou" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7d4e33" /><stop offset="1" stopColor="#a6704c" /></linearGradient>
    <radialGradient id="lv-cheveux" cx="50%" cy="28%" r="75%"><stop offset="0" stopColor="#4a342b" /><stop offset=".55" stopColor="#2a1b15" /><stop offset="1" stopColor="#140b08" /></radialGradient>
    <radialGradient id="lv-iris" cx="50%" cy="45%" r="60%"><stop offset="0" stopColor="#9a6236" /><stop offset=".65" stopColor="#5a3418" /><stop offset="1" stopColor="#2b1608" /></radialGradient>
    <linearGradient id="lv-levres" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#a8453f" /><stop offset="1" stopColor="#873230" /></linearGradient>
    <linearGradient id="lv-haut" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2a6be0" /><stop offset="1" stopColor="#123f9e" /></linearGradient>
    <radialGradient id="lv-joue" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#e0745f" stopOpacity=".55" /><stop offset="1" stopColor="#e0745f" stopOpacity="0" /></radialGradient>
  </defs>
);

/** Un œil : blanc, iris, pupille, reflets, paupière et cils. `cote` = -1 (gauche) ou 1 (droit) ; `regard` décale l'iris ; `ouvert` règle la hauteur de la paupière. */
function Oeil({ cx, cote, regard, ouvert = 1 }) {
  const h = 7.2 * ouvert;
  return (
    <g>
      <g className="lv-oeil">
        <path d={`M${cx - 12} 98 Q${cx} ${98 - h * 1.5} ${cx + 12} 98 Q${cx} ${98 + h * 1.05} ${cx - 12} 98 Z`} fill="#fbf7f1" />
        <g transform={`translate(${regard.x} ${regard.y})`}>
          <circle cx={cx} cy="98" r="6.4" fill="url(#lv-iris)" />
          <circle cx={cx} cy="98" r="3" fill="#120805" />
          <circle cx={cx + 2.3} cy="95.6" r="1.9" fill="#fff" opacity=".95" /><circle cx={cx - 2.4} cy="100.4" r="1" fill="#fff" opacity=".6" />
        </g>
        <path d={`M${cx - 12} 98 Q${cx} ${98 - h * 1.5} ${cx + 12} 98`} fill="none" stroke="#1c0f0a" strokeWidth="2.6" strokeLinecap="round" />
        <path d={`M${cx + cote * 11} 97 l${cote * 3.6} -2.4 M${cx + cote * 8} 94.6 l${cote * 2.6} -3.2 M${cx + cote * 4} 92.6 l${cote * 1.2} -3.4`} stroke="#1c0f0a" strokeWidth="1.5" strokeLinecap="round" />
      </g>
      <path d={`M${cx - 11} 100.6 Q${cx} ${103 + h * .5} ${cx + 11} 100.6`} fill="none" stroke="#7a4a30" strokeWidth=".9" opacity=".6" />
      <path d={`M${cx - 13} ${98 - h * 1.7} Q${cx} ${98 - h * 2.3} ${cx + 13} ${98 - h * 1.5}`} fill="none" stroke="#8a5536" strokeWidth="1.2" opacity=".45" />
    </g>
  );
}

/** Sourcils : dessinés selon l'émotion (levés = surprise, penchés vers le haut au centre = empathie, rapprochés = urgence). */
function Sourcils({ humeur }) {
  const g = { calme: ["M63 82 Q78 74 93 80", "M107 80 Q122 74 137 82"], joie: ["M63 80 Q78 71 93 78", "M107 78 Q122 71 137 80"],
    encouragement: ["M63 81 Q78 73 93 79", "M107 79 Q122 73 137 81"], empathie: ["M63 84 Q78 78 93 74", "M107 74 Q122 78 137 84"],
    surprise: ["M63 77 Q78 66 93 74", "M107 74 Q122 66 137 77"], urgence: ["M64 78 Q79 77 94 83", "M106 83 Q121 77 136 78"] }[humeur] || [];
  return <g fill="none" stroke="#24150f" strokeLinecap="round"><path d={g[0]} strokeWidth="4.2" /><path d={g[1]} strokeWidth="4.2" /><path d={g[0]} stroke="#4a3027" strokeWidth="1.2" opacity=".5" transform="translate(0 -1)" /><path d={g[1]} stroke="#4a3027" strokeWidth="1.2" opacity=".5" transform="translate(0 -1)" /></g>;
}

/** Bouche : lèvres modelées ; forme selon l'émotion ; s'ouvre et se ferme quand Liluvine parle. */
function Bouche({ humeur, parle }) {
  if (parle) return (<g className="lv-bouche-parle"><path d="M86 130 Q100 126 114 130 Q108 146 100 146 Q92 146 86 130 Z" fill="#5a1d1d" /><path d="M89 131 Q100 128 111 131 L110 134 Q100 132 90 134 Z" fill="#f6efe6" /><path d="M93 142 Q100 138 107 142 Q100 147 93 142 Z" fill="#c25a58" opacity=".85" /><path d="M86 130 Q100 124 114 130" fill="none" stroke="#873230" strokeWidth="2.2" strokeLinecap="round" /></g>);
  if (humeur === "surprise") return (<g><ellipse cx="100" cy="137" rx="7" ry="9" fill="#5a1d1d" /><path d="M93 137 a7 9 0 0 1 14 0" fill="none" stroke="#873230" strokeWidth="3" /><ellipse cx="100" cy="143" rx="4" ry="2.6" fill="#c25a58" opacity=".8" /></g>);
  if (humeur === "joie") return (<g><path d="M82 129 Q100 124 118 129 Q112 152 100 152 Q88 152 82 129 Z" fill="#5a1d1d" /><path d="M85 130 Q100 126 115 130 L113 138 Q100 135 87 138 Z" fill="#f8f1e8" /><path d="M92 146 Q100 141 108 146 Q100 152 92 146 Z" fill="#c25a58" opacity=".85" /><path d="M82 129 Q100 122 118 129" fill="none" stroke="#873230" strokeWidth="2.4" strokeLinecap="round" /></g>);
  const courbure = { calme: 5, encouragement: 7, empathie: -2.5, urgence: 0 }[humeur] ?? 5;
  return (<g><path d={`M87 133 Q94 ${130 - courbure * .2} 100 ${131 - courbure * .15} Q106 ${130 - courbure * .2} 113 133 Q106 ${136 + courbure * .6} 100 ${137 + courbure * .8} Q94 ${136 + courbure * .6} 87 133 Z`} fill="url(#lv-levres)" />
    <path d={`M87 133 Q100 ${133 + courbure * .9} 113 133`} fill="none" stroke="#5e2222" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M94 129.6 Q100 127.6 106 129.6" fill="none" stroke="#c8706a" strokeWidth="1.1" opacity=".7" /><ellipse cx="100" cy={137 + courbure * .4} rx="5.5" ry="1.4" fill="#d98a82" opacity=".55" /></g>);
}

export const LIBELLES_ETAT = { repos: "Liluvine vous écoute", reflexion: "Liluvine réfléchit…", parle: "Liluvine vous répond", };

/** `etat` : repos | reflexion | parle ; `emotion` : calme | joie | encouragement | empathie | surprise | urgence ; `taille` en pixels. */
export default function AvatarLiluvine({ etat = "repos", emotion = "calme", taille = 88 }) {
  const reflechit = etat === "reflexion", parle = etat === "parle";
  const humeur = reflechit ? "calme" : emotion;
  const regard = reflechit ? { x: 3.4, y: -3.2 } : { x: 0, y: 0 };            // elle regarde en haut à droite quand elle réfléchit
  const ouvert = humeur === "surprise" ? 1.18 : humeur === "joie" ? .82 : humeur === "urgence" ? .9 : 1;
  return (
    <svg viewBox="0 0 200 200" width={taille} height={taille} role="img" aria-label={`${LIBELLES_ETAT[etat] || ""}${humeur !== "calme" ? ` (${humeur})` : ""}`} data-testid="avatar-liluvine" data-etat={etat} data-emotion={humeur}>
      <style>{STYLE}</style>
      {DEFS}
      <g className={reflechit ? "lv-tete-pense" : "lv-tete"}>
        {/* Cheveux naturels (derrière) : gros volume bouclé */}
        <path d="M100 8 C142 6 176 34 174 82 C173 112 164 134 150 146 Q100 160 50 146 C36 134 27 112 26 82 C24 34 58 6 100 8 Z" fill="url(#lv-cheveux)" />
        <g fill="#3a261d" opacity=".55"><circle cx="48" cy="60" r="9" /><circle cx="62" cy="34" r="10" /><circle cx="90" cy="22" r="10" /><circle cx="122" cy="22" r="10" /><circle cx="148" cy="36" r="10" /><circle cx="152" cy="60" r="9" /><circle cx="38" cy="96" r="8" /><circle cx="162" cy="96" r="8" /></g>
        <g fill="none" stroke="#6b4b3c" strokeWidth="1.3" opacity=".45" strokeLinecap="round"><path d="M70 22 q8 -6 16 -2 M106 18 q10 -4 16 2 M44 70 q-4 8 0 16 M156 72 q4 8 0 16" /></g>
        {/* Cou et épaules : haut bleu auRor, col en V */}
        <path d="M84 138 L116 138 L120 168 L80 168 Z" fill="url(#lv-ombre-cou)" />
        <path d="M18 200 C20 176 46 164 80 160 L100 178 L120 160 C154 164 180 176 182 200 Z" fill="url(#lv-haut)" />
        <path d="M80 160 L100 178 L120 160 C112 150 88 150 80 160 Z" fill="#b57b56" />
        <path d="M80 160 L100 178 L120 160" fill="none" stroke="#e9f0ff" strokeWidth="2.4" strokeLinejoin="round" opacity=".9" />
        <path d="M84 146 Q100 156 116 146" fill="none" stroke="#6e4329" strokeWidth="6" opacity=".25" strokeLinecap="round" />
        {/* Oreilles et boucles d'oreilles */}
        <ellipse cx="54" cy="104" rx="7" ry="11" fill="#b87a53" /><ellipse cx="146" cy="104" rx="7" ry="11" fill="#b87a53" />
        <path d="M54 98 q-3 6 0 12 M146 98 q3 6 0 12" stroke="#8a5536" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        <circle cx="54" cy="118" r="3.6" fill="#f2c14e" stroke="#c9972a" strokeWidth=".8" /><circle cx="146" cy="118" r="3.6" fill="#f2c14e" stroke="#c9972a" strokeWidth=".8" />
        {/* Visage */}
        <path d="M100 40 C132 40 150 66 148 98 C147 128 130 152 100 154 C70 152 53 128 52 98 C50 66 68 40 100 40 Z" fill="url(#lv-peau)" />
        <path d="M52 100 C54 130 72 152 100 154 C84 150 66 134 62 106 Z" fill="#7b4b30" opacity=".22" />
        <path d="M148 100 C146 130 128 152 100 154 C116 150 134 134 138 106 Z" fill="#7b4b30" opacity=".22" />
        <ellipse cx="100" cy="64" rx="26" ry="9" fill="#f0c9a0" opacity=".28" />
        {/* Joues */}
        <ellipse cx="68" cy="122" rx="14" ry="10" fill="url(#lv-joue)" opacity={humeur === "empathie" || humeur === "joie" ? 1 : .55} />
        <ellipse cx="132" cy="122" rx="14" ry="10" fill="url(#lv-joue)" opacity={humeur === "empathie" || humeur === "joie" ? 1 : .55} />
        {/* Frange et racines des cheveux (devant) */}
        <path d="M52 98 C46 56 70 30 100 30 C130 30 154 56 148 98 C146 76 134 58 116 54 C100 64 76 62 62 72 C56 80 53 90 52 98 Z" fill="url(#lv-cheveux)" />
        <path d="M66 58 Q82 46 100 46 Q118 46 134 58" fill="none" stroke="#7a5646" strokeWidth="1.4" opacity=".4" strokeLinecap="round" />
        <Sourcils humeur={humeur} />
        <Oeil cx={79} cote={-1} regard={regard} ouvert={ouvert} />
        <Oeil cx={121} cote={1} regard={regard} ouvert={ouvert} />
        {/* Nez : arête, ailes, narines et reflet */}
        <path d="M97 100 Q95 112 92 119" fill="none" stroke="#8a5536" strokeWidth="1.4" opacity=".4" strokeLinecap="round" />
        <path d="M90 121 Q100 129 110 121" fill="none" stroke="#6e4329" strokeWidth="1.8" strokeLinecap="round" opacity=".75" />
        <ellipse cx="94" cy="121" rx="2.2" ry="1.4" fill="#4a2a18" opacity=".7" /><ellipse cx="106" cy="121" rx="2.2" ry="1.4" fill="#4a2a18" opacity=".7" />
        <ellipse cx="101" cy="115" rx="3" ry="2.2" fill="#f0c9a0" opacity=".45" />
        <Bouche humeur={humeur} parle={parle} />
      </g>
      {/* Signes animés */}
      {reflechit && (<g aria-hidden="true"><circle className="lv-point" cx="170" cy="40" r="5" fill="#1a56db" /><circle className="lv-point" style={{ animationDelay: ".25s" }} cx="182" cy="26" r="6.4" fill="#1a56db" /><circle className="lv-point" style={{ animationDelay: ".5s" }} cx="190" cy="9" r="7.6" fill="#1a56db" /></g>)}
      {!reflechit && humeur === "joie" && (<g aria-hidden="true" fill="#f5b301"><path className="lv-etincelle" d="M170 40 l3.5 9 9 3.5 -9 3.5 -3.5 9 -3.5 -9 -9 -3.5 9 -3.5z" /><path className="lv-etincelle" style={{ animationDelay: ".5s" }} d="M22 56 l2.8 7 7 2.8 -7 2.8 -2.8 7 -2.8 -7 -7 -2.8 7 -2.8z" /><path className="lv-etincelle" style={{ animationDelay: "1s" }} d="M176 120 l2.4 6 6 2.4 -6 2.4 -2.4 6 -2.4 -6 -6 -2.4 6 -2.4z" /></g>)}
      {!reflechit && humeur === "encouragement" && (<path className="lv-rebond" aria-hidden="true" d="M172 18 l5 12 14 1.4 -10.4 9.4 3.2 13.6 -11.8 -7 -11.8 7 3.2 -13.6 -10.4 -9.4 14 -1.4z" fill="#f5b301" />)}
      {!reflechit && humeur === "empathie" && (<path className="lv-coeur" aria-hidden="true" d="M172 42 c-5 -9 -18 -4 -14 5 c2 6 14 14 14 14 c0 0 12 -8 14 -14 c4 -9 -9 -14 -14 -5z" fill="#e8536b" />)}
      {!reflechit && humeur === "urgence" && (<path aria-hidden="true" d="M172 20 l16 5 v14 c0 11 -9 16 -16 20 c-7 -4 -16 -9 -16 -20 v-14z" fill="#b42318" />)}
    </svg>
  );
}
