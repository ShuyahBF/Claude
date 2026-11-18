// BULLE de notification : quand Liluvine répond (ou écrit la première) alors que son écran n'est pas affiché, une bulle apparaît en haut de
// l'écran avec un son (jouerBulle, dans le store) ; la toucher ouvre la conversation. Elle disparaît seule au bout de 8 secondes.
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AvatarLiluvine from "@/components/AvatarLiluvine";
import { fermerBulle, useLiluvine } from "@/lib/liluvineStore";

export default function BulleLiluvine() {
  const { bulle } = useLiluvine();
  const naviguer = useNavigate();
  useEffect(() => { if (!bulle) return undefined; const t = setTimeout(fermerBulle, 8000); return () => clearTimeout(t); }, [bulle]);
  if (!bulle) return null;
  return (
    <div className="no-print fixed inset-x-0 top-2 z-[80] flex justify-center px-3 pointer-events-none" role="status" aria-live="polite">
      <button type="button" onClick={() => { fermerBulle(); naviguer("/journal?onglet=liluvine"); }} data-testid="bulle-liluvine"
        className="pointer-events-auto box-border flex w-full min-w-0 max-w-md items-center gap-3 overflow-hidden rounded-2xl border border-sky-200 bg-white p-2 pr-4 text-left shadow-xl">
        <span className="shrink-0"><AvatarLiluvine emotion="joie" taille={44} /></span>
        <span className="min-w-0"><b className="block text-sm text-primary">💬 Liluvine vous a écrit</b><span className="block truncate text-xs text-gray-600">{bulle.texte}</span></span>
      </button>
    </div>
  );
}
