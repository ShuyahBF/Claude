# Contexte utilisateur — à lire avant de coder sur ce projet

L'utilisateur a **20 ans d'expérience avec les outils PC SOFT** (WinDev,
WebDev, WinDev Mobile, HFSQL) mais découvre **Visual Studio depuis 2
semaines seulement**. Il maîtrise parfaitement les concepts métier et la
base de données HFSQL, mais pas encore l'écosystème .NET/Visual Studio en
tant que tel (solution/.sln, .csproj, NuGet, séparation
Designer.cs/.cs, WinForms vs fenêtres WinDev, etc.).

## Comment documenter le code pour lui

- **Commenter davantage que d'habitude**, et pas seulement le "pourquoi"
  métier : expliquer aussi les mécanismes .NET/C#/WinForms/Visual Studio
  qui n'ont pas d'équivalent direct en WinDev (ou qui fonctionnent
  différemment), par exemple :
  - à quoi sert un fichier `.csproj` / la solution `.sln` ;
  - le rôle de NuGet (`PackageReference`) — équivalent grossier des
    composants/bibliothèques externes WinDev ;
  - pourquoi WinForms sépare un formulaire en deux fichiers
    (`XxxForm.cs` pour le code, `XxxForm.Designer.cs` généré pour la
    disposition des contrôles) ;
  - le câblage des événements (`this.btnConnexion.Click += ...`) par
    rapport au code d'événement WinDev attaché directement au contrôle ;
  - la différence entre HFSQL natif (WLangage `HExécuteRequête`,
    `HLitPremier`, etc.) et l'accès via ODBC utilisé ici
    (`OdbcConnection`, `OdbcCommand`) ;
  - les notions propres à .NET quand elles apparaissent (nullable
    reference types `string?`, `using`/`IDisposable`, `async` si on en
    introduit, injection de dépendances si le projet grandit, etc.).
- Garder les commentaires et noms de variables/méthodes **en français**,
  comme le reste du projet.
- Ne pas supposer de connaissance de Visual Studio dans les instructions
  (ex: comment ouvrir la fenêtre "Explorateur de solutions", comment
  lancer le débogueur F5, comment ajouter un contrôle depuis la boîte à
  outils) — l'expliciter la première fois que c'est pertinent.
- Quand un parallèle avec WinDev aide à comprendre plus vite, le
  mentionner brièvement (ex: "`AppConfig` ici joue un rôle proche des
  variables globales de projet en WinDev").
- Rester concis : privilégier des commentaires courts et ciblés plutôt que
  des pavés — l'objectif est de combler le manque de familiarité avec
  Visual Studio, pas de réexpliquer la programmation en général.
