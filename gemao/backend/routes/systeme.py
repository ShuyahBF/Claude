"""Version, nouveautés et performances (règles 1, 2, 5 et 7)."""
import os

from fastapi import APIRouter, Depends

import lot
import mesure
from nouveautes import NOUVEAUTES, RUBRIQUES
from outils import exiger
from presence_sawali import DEMARRE_LE

router = APIRouter(tags=["systeme"])


@router.get("/version")
async def version():
    """Public : version, lot, commit et date de déploiement (affichés sur la page de connexion et dans le portail)."""
    return {"version": lot.VERSION, "lot": lot.LOT, "lot_libelle": lot.LOT_LIBELLE,
            "commit": (os.environ.get("RENDER_GIT_COMMIT") or "")[:7], "deploye_le": DEMARRE_LE}


@router.get("/nouveautes")
async def nouveautes(_=Depends(exiger("admin"))):
    return {"lot": lot.LOT, "rubriques": list(RUBRIQUES), "cartes": sorted(NOUVEAUTES, key=lambda n: -int(n["lot"]))}


@router.get("/performances")
async def performances(_=Depends(exiger("admin"))):
    """« Appels les plus lents » : moyenne, 5 derniers, dernier, maximum par route."""
    return mesure.rapport()
