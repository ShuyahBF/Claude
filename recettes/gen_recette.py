"""Génère une page de recette complète (checklist partagée) à partir du modèle
du lot 4 et de fichiers JSON de sections. Usage : python3 gen_recette.py config.json"""
import json, sys, html, re

cfg = json.load(open(sys.argv[1]))
tpl = open("recette-lot4-albarka.html").read()

# 1. Styles du modèle (+ palette propre au site et styles ajoutés)
style = tpl[tpl.index("<style>"):tpl.index("</style>")]
for k, v in cfg.get("palette", {}).items():          # ex. {"#0F6B4A": "#1D4ED8"}
    style = style.replace(k, v)
style += """
  .sec-prep { font-size: 13px; background: var(--gold-soft); border-radius: 8px; padding: 6px 10px; }
  .toc { display: flex; flex-wrap: wrap; gap: 6px; font-size: 13px; }
  .toc a { color: var(--accent); text-decoration: none; border: 1px solid var(--line); border-radius: 99px; padding: 3px 10px; background: var(--surface); }
  .partchips { display: flex; flex-wrap: wrap; gap: 8px; }
  .warn { background: var(--bad-soft); border: 1px solid var(--line); border-radius: 10px; padding: 10px 14px; font-size: 14px; }
</style>"""

# 2. Sections : une « partie » par fichier JSON (ex. Admin, Portail)
sections = []
for part in cfg["parts"]:
    for s in json.load(open(part["file"])):
        s["part"] = part["label"]
        s.setdefault("prep", "")
        sections.append(s)
ids = [i["id"] for s in sections for i in s["items"]]
assert len(ids) == len(set(ids)), "identifiants en double"

esc = html.escape
rows = "".join(f"<tr><td>{esc(a)}</td><td>{esc(b)}</td></tr>" for a, b in cfg["accounts"])
warn = f'<div class="warn">{cfg["warning"]}</div>' if cfg.get("warning") else ""
parts_chips = "".join(f'<button class="chip" data-part="{esc(p["label"])}" aria-pressed="false">{esc(p["label"])}</button>' for p in cfg["parts"])

head = f"""<title>{esc(cfg['title'])}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,500;6..72,600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap">
{style}

<div class="wrap">
  <header>
    <div class="eyebrow">{esc(cfg['eyebrow'])}</div>
    <h1>{esc(cfg['title'])}</h1>
    <p class="lead">{cfg['lead']}</p>
  </header>
  {warn}
  <div class="summary">
    <div class="bar" aria-hidden="true"><i class="ok" id="barOk"></i><i class="ko" id="barKo"></i></div>
    <div class="counts" id="counts"></div>
    <div class="sync" id="sync">Connexion à la liste partagée…</div>
  </div>
  <div class="banner" id="offline" hidden>La liste partagée n'est pas disponible dans cette vue : vous pouvez lire les points, mais les coches ne sont pas enregistrées.</div>
  <details class="prep">
    <summary>Avant de commencer : comptes à préparer</summary>
    <div class="table-scroll"><table><thead><tr><th>Compte</th><th>Pour tester</th></tr></thead><tbody>{rows}</tbody></table></div>
  </details>
  <details class="prep">
    <summary>Aller à un module</summary>
    <div class="toc" id="toc" style="margin-top:10px"></div>
  </details>
  <div class="tools" role="toolbar" aria-label="Filtres">
    <button class="chip" data-part="" aria-pressed="true">Toutes les parties</button>{parts_chips}
    <span class="spacer"></span>
    <button class="chip" data-filter="all" aria-pressed="true">Tout</button>
    <button class="chip" data-filter="todo" aria-pressed="false">À tester</button>
    <button class="chip" data-filter="ko" aria-pressed="false">Problèmes</button>
    <button class="chip" data-filter="ok" aria-pressed="false">Validés</button>
    <button class="btn" id="copyKo">Copier les problèmes</button>
  </div>
  <main id="list" class="wrap" style="gap:26px"></main>
</div>
<div class="toast" id="toast" hidden></div>
"""

# 3. Script du modèle, adapté : sections injectées, filtre par partie, préparation par section
script = tpl[tpl.index("<script>"):]
start = script.index("const SECTIONS = [")
end = script.index("const ALL =")
script = script[:start] + "const SECTIONS = " + json.dumps(sections, ensure_ascii=False, indent=0) + ";\n" + script[end:]
script = script.replace('let filter = "all";', 'let filter = "all";\nlet part = "";  // partie affichée ("" = toutes)')
script = script.replace("const shown = s.items.filter(keep);", "if (part && s.part !== part) return \"\";\n    const shown = s.items.filter(keep);")
script = script.replace('<span class="prog">${done} / ${s.items.length}</span></div>',
    '<span class="prog">${done} / ${s.items.length}</span></div>\n      ${s.prep ? `<div class="sec-prep">À préparer : ${esc(s.prep)}</div>` : ""}')
script = script.replace('document.querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => {\n  filter = c.dataset.filter;\n  document.querySelectorAll(".chip").forEach((x) => x.setAttribute("aria-pressed", String(x === c)));',
    'document.querySelectorAll(".chip[data-filter]").forEach((c) => c.addEventListener("click", () => {\n  filter = c.dataset.filter;\n  document.querySelectorAll(".chip[data-filter]").forEach((x) => x.setAttribute("aria-pressed", String(x === c)));')
assert 'chip[data-filter]' in script
script = script.replace("// Résumé des problèmes", """// Filtre par partie (ex. Admin / Portail)
document.querySelectorAll(".chip[data-part]").forEach((c) => c.addEventListener("click", () => {
  part = c.dataset.part;
  document.querySelectorAll(".chip[data-part]").forEach((x) => x.setAttribute("aria-pressed", String(x === c)));
  render();
}));
// Sommaire : un lien par module (affiche toutes les parties puis fait défiler)
$("toc").innerHTML = SECTIONS.map((s) => `<a href="#h-${s.id}" data-goto="${s.id}">${esc(s.title)}</a>`).join("");
$("toc").addEventListener("click", (ev) => {
  const a = ev.target.closest("a"); if (!a) return;
  ev.preventDefault(); part = ""; filter = "all";
  document.querySelectorAll(".chip[data-part]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.part === "")));
  document.querySelectorAll(".chip[data-filter]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.filter === "all")));
  render().then(() => document.getElementById("h-" + a.dataset.goto)?.scrollIntoView({ block: "start" }));
});

// Résumé des problèmes""")
script = script.replace('"Recette lot 3 Albarka — problèmes', json.dumps(cfg["title"] + " — problèmes")[:-1])
script = script.replace("`• ${i.section.title}", "`• [${i.section.part}] ${i.section.title}")
open(cfg["out"], "w").write(head + script)
print(cfg["out"], len(sections), "sections", len(ids), "points")
