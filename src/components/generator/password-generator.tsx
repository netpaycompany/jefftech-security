"use client";

import { useState } from "react";
import { AppShell } from "@/components/app-shell";

const CHARACTER_SETS = {
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lowercase: "abcdefghijklmnopqrstuvwxyz",
  numbers: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{};:,.<>?",
};

const AMBIGUOUS = new Set("Il1O0");
const ADJECTIVES = [
  "amber", "ancient", "arctic", "autumn", "azure", "bold", "brisk", "bright",
  "calm", "cedar", "clever", "cloud", "cobalt", "cosmic", "crisp", "curious",
  "daring", "deep", "distant", "eager", "early", "electric", "emerald", "faint",
  "fierce", "final", "frozen", "gentle", "golden", "grand", "hidden", "honest",
  "ivory", "jade", "keen", "kind", "lasting", "lively", "lunar", "mellow",
  "mighty", "modern", "noble", "northern", "olive", "patient", "quiet", "rapid",
  "rare", "ready", "restless", "river", "robust", "royal", "silver", "silent",
  "solar", "steady", "subtle", "tidy", "vivid", "warm", "witty", "young",
];
const NOUNS = [
  "acorn", "anchor", "apricot", "badger", "bamboo", "beacon", "birch", "bison",
  "breeze", "brook", "canyon", "carbon", "castle", "cavern", "comet", "coral",
  "cricket", "crystal", "dahlia", "dawn", "delta", "desert", "dolphin", "dragon",
  "eagle", "ember", "falcon", "fern", "field", "finch", "forest", "fossil",
  "galaxy", "garden", "glacier", "harbor", "heron", "island", "jasmine", "jungle",
  "kernel", "lagoon", "lantern", "lemon", "lotus", "maple", "marble", "meadow",
  "meteor", "mosaic", "mountain", "nectar", "ocean", "orchid", "otter", "parrot",
  "pebble", "planet", "plum", "pocket", "quartz", "raven", "willow", "zephyr",
];

function randomIndex(max: number): number {
  const limit = Math.floor(256 / max) * max;
  const sample = new Uint8Array(1);
  do {
    crypto.getRandomValues(sample);
  } while (sample[0] >= limit);
  return sample[0] % max;
}

function shuffle<T>(values: T[]): T[] {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const target = randomIndex(index + 1);
    [values[index], values[target]] = [values[target], values[index]];
  }
  return values;
}

export function PasswordGenerator() {
  const [mode, setMode] = useState<"password" | "passphrase">("password");
  const [length, setLength] = useState(20);
  const [includeUppercase, setIncludeUppercase] = useState(true);
  const [includeLowercase, setIncludeLowercase] = useState(true);
  const [includeNumbers, setIncludeNumbers] = useState(true);
  const [includeSymbols, setIncludeSymbols] = useState(true);
  const [excludeAmbiguous, setExcludeAmbiguous] = useState(false);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const generate = () => {
    setError("");
    setNotice("");
    if (mode === "passphrase") {
      setSecret(Array.from({ length }, () => (
        `${ADJECTIVES[randomIndex(ADJECTIVES.length)]}-${NOUNS[randomIndex(NOUNS.length)]}`
      )).join("-"));
      return;
    }

    const sets = [
      includeUppercase ? CHARACTER_SETS.uppercase : "",
      includeLowercase ? CHARACTER_SETS.lowercase : "",
      includeNumbers ? CHARACTER_SETS.numbers : "",
      includeSymbols ? CHARACTER_SETS.symbols : "",
    ].filter(Boolean).map((characters) => excludeAmbiguous
      ? [...characters].filter((character) => !AMBIGUOUS.has(character)).join("")
      : characters);
    if (sets.length === 0 || sets.some((characters) => characters.length === 0)) {
      setSecret("");
      setError("Choose at least one character set.");
      return;
    }
    if (length < sets.length) {
      setSecret("");
      setError(`Length must be at least ${sets.length} to include every selected character set.`);
      return;
    }

    const alphabet = sets.join("");
    const characters = sets.map((characters) => characters[randomIndex(characters.length)]);
    while (characters.length < length) {
      characters.push(alphabet[randomIndex(alphabet.length)]);
    }
    setSecret(shuffle(characters).join(""));
  };

  const copy = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setNotice("Copied. Clipboard contents may remain available to other applications.");
    } catch {
      setError("Could not access the clipboard. Copy the generated value manually.");
    }
  };

  return (
    <AppShell title="Password Generator" activePath="/generator">
      <div className="mx-auto max-w-3xl rounded-3xl border border-slate-800 bg-slate-900 p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Generated on this device</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <label className="flex-1 text-sm text-slate-300">
            Generator type
            <select value={mode} onChange={(event) => {
              const nextMode = event.target.value as "password" | "passphrase";
              setMode(nextMode);
              setLength(nextMode === "password" ? 20 : 8);
            }} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white">
              <option value="password">Random password</option>
              <option value="passphrase">Passphrase</option>
            </select>
          </label>
          <label className="w-36 text-sm text-slate-300">
            {mode === "password" ? "Length" : "Word count"}
            <input type="number" min={mode === "password" ? 4 : 4} max={mode === "password" ? 128 : 16} value={length} onChange={(event) => setLength(Math.max(4, Math.min(mode === "password" ? 128 : 16, Number(event.target.value) || 4)))} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
          </label>
        </div>
        {mode === "password" && (
          <fieldset className="mt-5 grid gap-2 sm:grid-cols-2">
            <legend className="sr-only">Character options</legend>
            {([
              ["Uppercase letters", includeUppercase, setIncludeUppercase],
              ["Lowercase letters", includeLowercase, setIncludeLowercase],
              ["Numbers", includeNumbers, setIncludeNumbers],
              ["Special characters", includeSymbols, setIncludeSymbols],
              ["Exclude ambiguous characters", excludeAmbiguous, setExcludeAmbiguous],
            ] as const).map(([label, checked, onChange]) => (
              <label key={label} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-sm text-slate-300">
                <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-blue-500" />
                {label}
              </label>
            ))}
          </fieldset>
        )}
        <output aria-live="polite" className="mt-5 block min-h-14 break-all rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-lg text-white">
          {secret || "Generate a password or passphrase"}
        </output>
        {mode === "passphrase" && <p className="mt-2 text-xs text-slate-500">Eight words provide about 96 bits of selection entropy from this local word set.</p>}
        {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
        {notice && <p role="status" className="mt-3 text-sm text-emerald-300">{notice}</p>}
        <div className="mt-5 flex gap-3">
          <button type="button" onClick={generate} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500">Generate</button>
          <button type="button" onClick={() => void copy()} disabled={!secret} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 disabled:opacity-50">Copy</button>
        </div>
      </div>
    </AppShell>
  );
}
