import { useState } from "react";
import { Copy, RefreshCw, ShieldCheck } from "lucide-react";

import { generatePassword } from "../utils/security";

type Props = {
  onCopy: (value: string) => Promise<void>;
  onUse: (value: string) => void;
};

export function GeneratorPanel({ onCopy, onUse }: Props) {
  const [length, setLength] = useState(20);
  const [classes, setClasses] = useState({ uppercase: true, lowercase: true, numbers: true, symbols: true });
  const [password, setPassword] = useState(() => generatePassword(20, { uppercase: true, lowercase: true, numbers: true, symbols: true }));
  const [error, setError] = useState("");

  const regenerate = () => {
    try {
      setError("");
      setPassword(generatePassword(length, classes));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not generate a password.");
    }
  };

  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-white">Password generator</p>
        <p className="text-xs text-slate-400">Randomness is generated locally with the Web Crypto API.</p>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
        <div className="break-all font-mono text-sm text-blue-100">{password}</div>
        <div className="mt-3 flex gap-2">
          <button className="secondary-button flex-1" type="button" onClick={() => void onCopy(password)}><Copy size={14} /> Copy</button>
          <button className="secondary-button flex-1" type="button" onClick={regenerate}><RefreshCw size={14} /> Generate</button>
          <button className="primary-button flex-1" type="button" onClick={() => onUse(password)}><ShieldCheck size={14} /> Use</button>
        </div>
      </div>
      <label className="field-label">Length: {length}
        <input className="w-full accent-blue-500" type="range" min={8} max={64} value={length} onChange={(event) => setLength(Number(event.target.value))} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        {([
          ["uppercase", "Uppercase (A–Z)"],
          ["lowercase", "Lowercase (a–z)"],
          ["numbers", "Numbers (0–9)"],
          ["symbols", "Symbols"],
        ] as const).map(([key, title]) => (
          <label key={key} className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-300">
            <input type="checkbox" checked={classes[key]} onChange={(event) => setClasses((value) => ({ ...value, [key]: event.target.checked }))} />
            {title}
          </label>
        ))}
      </div>
      {error && <p role="alert" className="error-message">{error}</p>}
    </section>
  );
}
