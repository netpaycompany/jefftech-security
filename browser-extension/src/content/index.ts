type CredentialMatch = { id: string; site: string; username: string };
type RuntimeResponse<T> = { ok: true; result: T } | { ok: false; error: string };

const root = document.createElement("div");
root.id = "jefftech-extension-ui";
const shadow = root.attachShadow({ mode: "closed" });
const style = document.createElement("style");
style.textContent = `
  :host { all: initial; }
  .card { position: fixed; z-index: 2147483647; top: 16px; right: 16px; width: 300px; box-sizing: border-box;
    padding: 14px; border: 1px solid #334155; border-radius: 14px; background: #071321; color: #e2e8f0;
    box-shadow: 0 16px 48px #020617aa; font: 13px/1.45 system-ui, sans-serif; }
  .brand { margin: 0 0 4px; color: #93c5fd; font-size: 10px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; }
  .title { margin: 0; color: #fff; font-size: 14px; font-weight: 650; }
  .hint { margin: 5px 0 10px; color: #94a3b8; font-size: 11px; }
  .row { display: flex; align-items: center; gap: 8px; }
  .name { flex: 1; min-width: 0; overflow: hidden; color: #f8fafc; text-overflow: ellipsis; white-space: nowrap; }
  button { border: 0; border-radius: 8px; background: #2563eb; padding: 7px 10px; color: white; font: inherit; font-weight: 600; cursor: pointer; }
  button.secondary { border: 1px solid #334155; background: transparent; color: #cbd5e1; }
  .matches { display: grid; gap: 7px; max-height: 150px; overflow: auto; }
  .close { position: absolute; top: 8px; right: 8px; border: 0; background: transparent; padding: 3px 6px; color: #94a3b8; }
  .actions { display: flex; gap: 8px; margin-top: 10px; }
  .error { margin: 8px 0 0; color: #fca5a5; font-size: 11px; }
`;
shadow.append(style);

let panel: HTMLElement | null = null;
let scanTimer = 0;
let pendingCandidate: { site: string; url: string; username: string; password: string } | null = null;

function visible(element: HTMLInputElement) {
  return element.getClientRects().length > 0 && !element.disabled && !element.readOnly;
}

function passwordInputs() {
  return [...document.querySelectorAll<HTMLInputElement>('input[type="password"]')].filter(visible);
}

function usernameFor(passwordInput: HTMLInputElement) {
  const form = passwordInput.form ?? document;
  const inputs = [...form.querySelectorAll<HTMLInputElement>(
    'input:not([type="password"]):not([type="hidden"]):not([type="submit"])',
  )].filter(visible);
  return inputs.find((input) => input.autocomplete.toLowerCase().includes("username"))
    ?? inputs.find((input) => input.type === "email")
    ?? inputs.find((input) => /user|email|login/i.test(`${input.name} ${input.id} ${input.placeholder}`))
    ?? null;
}

function message<T>(payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(payload, (response: RuntimeResponse<T> | undefined) => {
      if (chrome.runtime.lastError) {
        reject(new Error("Jefftech extension is unavailable."));
      } else if (!response?.ok) {
        reject(new Error(response?.error ?? "The extension request failed."));
      } else {
        resolve(response.result);
      }
    });
  });
}

function clearPanel() {
  panel?.remove();
  panel = null;
}

function ensurePanel() {
  if (panel?.isConnected) return panel;
  panel = document.createElement("section");
  panel.className = "card";
  panel.setAttribute("aria-label", "Jefftech password vault");
  shadow.append(panel);
  if (!root.isConnected) document.documentElement.append(root);
  return panel;
}

function addCloseButton(container: HTMLElement) {
  const close = document.createElement("button");
  close.className = "close";
  close.type = "button";
  close.textContent = "×";
  close.setAttribute("aria-label", "Dismiss Jefftech suggestion");
  close.addEventListener("click", clearPanel);
  container.append(close);
}

async function showSuggestions() {
  const input = passwordInputs()[0];
  if (!input) {
    clearPanel();
    return;
  }
  const container = ensurePanel();
  container.replaceChildren();
  addCloseButton(container);
  const brand = document.createElement("p");
  brand.className = "brand";
  brand.textContent = "Jefftech Security";
  const title = document.createElement("p");
  title.className = "title";
  title.textContent = "Choose a saved login";
  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = "Credentials are matched to this exact HTTPS origin. Nothing is filled until you choose.";
  container.append(brand, title, hint);

  try {
    const result = await message<{ unlocked: boolean; matches: CredentialMatch[] }>({ type: "content:scan" });
    if (!result.unlocked) {
      hint.textContent = "Unlock your vault from the Jefftech extension popup to see matching logins.";
      return;
    }
    if (result.matches.length === 0) {
      hint.textContent = "No saved login matches this website yet.";
      return;
    }
    const list = document.createElement("div");
    list.className = "matches";
    for (const match of result.matches) {
      const row = document.createElement("div");
      row.className = "row";
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = `${match.site} · ${match.username || "Saved login"}`;
      const fill = document.createElement("button");
      fill.type = "button";
      fill.textContent = "Fill";
      fill.setAttribute("aria-label", `Fill ${match.username || match.site}`);
      fill.addEventListener("click", async () => {
        fill.disabled = true;
        try {
          await message({ type: "content:fill", id: match.id });
          clearPanel();
        } catch (error) {
          hint.textContent = error instanceof Error ? error.message : "The credential could not be filled.";
          fill.disabled = false;
        }
      });
      row.append(name, fill);
      list.append(row);
    }
    container.append(list);
  } catch {
    hint.textContent = "Open the Jefftech extension popup to unlock or reconnect your vault.";
  }
}

function showSavePrompt(candidate: { site: string; url: string; username: string; password: string }) {
  pendingCandidate = candidate;
  const container = ensurePanel();
  container.replaceChildren();
  addCloseButton(container);
  const brand = document.createElement("p");
  brand.className = "brand";
  brand.textContent = "Jefftech Security";
  const title = document.createElement("p");
  title.className = "title";
  title.textContent = "Save this sign-in?";
  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = `Save or update the encrypted login for ${candidate.site}?`;
  const actions = document.createElement("div");
  actions.className = "actions";
  const save = document.createElement("button");
  save.type = "button";
  save.textContent = "Save password";
  const dismiss = document.createElement("button");
  dismiss.className = "secondary";
  dismiss.type = "button";
  dismiss.textContent = "Not now";
  save.addEventListener("click", async () => {
    if (!pendingCandidate) return;
    save.disabled = true;
    try {
      await message({ type: "content:save-candidate", ...pendingCandidate });
      pendingCandidate.password = "";
      pendingCandidate = null;
      title.textContent = "Password saved";
      hint.textContent = "The password was encrypted locally before syncing.";
      actions.remove();
      window.setTimeout(clearPanel, 3500);
    } catch (error) {
      hint.textContent = error instanceof Error ? error.message : "The password could not be saved.";
      save.disabled = false;
    }
  });
  dismiss.addEventListener("click", () => {
    if (pendingCandidate) pendingCandidate.password = "";
    pendingCandidate = null;
    clearPanel();
  });
  actions.append(save, dismiss);
  container.append(brand, title, hint, actions);
  window.setTimeout(() => {
    if (pendingCandidate) pendingCandidate.password = "";
    pendingCandidate = null;
    clearPanel();
  }, 60_000);
}

async function observeSuccessfulLogin(form: HTMLFormElement, passwordInput: HTMLInputElement) {
  try {
    await message<{ enabled: boolean }>({ type: "content:check" });
  } catch {
    return;
  }
  const usernameInput = usernameFor(passwordInput);
  const candidate = {
    site: location.hostname,
    url: location.origin,
    username: usernameInput?.value ?? "",
    password: passwordInput.value,
  };
  if (!candidate.password) return;

  window.setTimeout(() => {
    const stillHasUnclearedPassword = passwordInput.isConnected && passwordInput.value.length > 0;
    const formStillVisible = form.isConnected && form.getClientRects().length > 0;
    if (!stillHasUnclearedPassword || !formStillVisible) {
      showSavePrompt(candidate);
    } else {
      candidate.password = "";
      candidate.username = "";
    }
  }, 1500);
}

function onSubmit(event: Event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  const input = [...form.querySelectorAll<HTMLInputElement>('input[type="password"]')].find(visible);
  if (input) observeSuccessfulLogin(form, input);
}

function scheduleScan() {
  window.clearTimeout(scanTimer);
  scanTimer = window.setTimeout(() => {
    if (passwordInputs().length > 0) void showSuggestions();
  }, 250);
}

document.addEventListener("submit", onSubmit, true);
document.addEventListener("focusin", (event) => {
  if (event.target instanceof HTMLInputElement && event.target.type === "password") scheduleScan();
}, true);
document.addEventListener("input", (event) => {
  if (event.target instanceof HTMLInputElement && event.target.type === "password") scheduleScan();
}, true);
new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true });

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || sender.tab) return false;
  if (typeof message !== "object" || message === null || !("type" in message)
    || message.type !== "jefftech:approved-fill") return false;

  const payload = message as { type: string; username?: string; password?: string };
  if (typeof payload.password !== "string" || typeof payload.username !== "string") {
    sendResponse({ ok: false });
    return false;
  }
  const passwordInput = passwordInputs()[0];
  if (!passwordInput || new URL(location.href).protocol !== "https:") {
    sendResponse({ ok: false });
    return false;
  }
  const usernameInput = usernameFor(passwordInput);
  if (usernameInput) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(usernameInput, payload.username);
    usernameInput.dispatchEvent(new Event("input", { bubbles: true }));
    usernameInput.dispatchEvent(new Event("change", { bubbles: true }));
  }
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(passwordInput, payload.password);
  passwordInput.dispatchEvent(new Event("input", { bubbles: true }));
  passwordInput.dispatchEvent(new Event("change", { bubbles: true }));
  sendResponse({ ok: true });
  return false;
});

scheduleScan();
