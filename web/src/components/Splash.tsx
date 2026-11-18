import { useCallback, useEffect, useState } from "react";

const KEY = "ep-splash-shown";
const TOTAL_MS = 2000; // animação curta + fade de saída

/** Mostra a abertura uma vez por sessão do navegador (depois do login). */
export function useSplash(active: boolean) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!active) return;
    let seen = false;
    try { seen = sessionStorage.getItem(KEY) === "1"; } catch { /* sem storage */ }
    if (seen) return;
    try { sessionStorage.setItem(KEY, "1"); } catch { /* ignora */ }
    setShow(true);
  }, [active]);
  const done = useCallback(() => setShow(false), []);
  return { show, done };
}

/** Logo da Evolution Pro se montando (~1,5 s). Tocar na tela pula. */
export default function Splash({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t1 = setTimeout(() => setLeaving(true), reduce ? 500 : TOTAL_MS - 300);
    const t2 = setTimeout(onDone, reduce ? 800 : TOTAL_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);

  return (
    <div
      className={`splash ${leaving ? "splash-out" : ""}`}
      onClick={onDone}
      role="presentation"
      aria-hidden="true"
    >
      <svg viewBox="0 0 640 270" className="splash-logo" xmlns="http://www.w3.org/2000/svg">
        <path className="sp-ln sp-roof" d="M320 46 L246 112 H30" />
        <path className="sp-ln sp-roof" d="M320 46 L394 112 H610" />
        <path className="sp-ln sp-chim" d="M262 74 V50 h16 v10" />
        <path className="sp-ln sp-inner" d="M276 104 L320 66 L364 104" />
        <g fill="#7ed957">
          <rect className="sp-win" style={{ animationDelay: "420ms" }} x="309" y="80" width="9" height="9" />
          <rect className="sp-win" style={{ animationDelay: "470ms" }} x="321" y="80" width="9" height="9" />
          <rect className="sp-win" style={{ animationDelay: "520ms" }} x="309" y="92" width="9" height="9" />
          <rect className="sp-win" style={{ animationDelay: "570ms" }} x="321" y="92" width="9" height="9" />
        </g>
        <text x="320" y="186" textAnchor="middle" fontFamily="Montserrat, 'Arial Black', Arial, sans-serif" fontWeight={800}
          fontSize="64" textLength="560" lengthAdjust="spacingAndGlyphs">
          <tspan className="sp-evo" fill="#7ed957">EVO</tspan>
          <tspan className="sp-rest" fill="#ffffff">LUTION PRO</tspan>
        </text>
        <rect className="sp-bar sp-bar-l" x="30" y="215" width="150" height="12" fill="#7ed957" />
        <rect className="sp-bar sp-bar-r" x="460" y="215" width="150" height="12" fill="#7ed957" />
        <text className="sp-carp" x="320" y="236" textAnchor="middle" fontFamily="Montserrat, Arial, sans-serif"
          fontWeight={600} fontSize="28" fill="#ffffff">CARPENTRY</text>
      </svg>
    </div>
  );
}
