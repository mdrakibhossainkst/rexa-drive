import { FormEvent, useState } from "react";
import { api, Status } from "./api";
import { useT } from "./i18n";
import { errMsg } from "./utils";

type Step = "creds" | "phone" | "code" | "password";

export default function Login({ status, onDone }: { status: Status; onDone: () => void }) {
  const t = useT();
  const [step, setStep] = useState<Step>(status.has_creds ? "phone" : "creds");
  const [apiId, setApiId] = useState("");
  const [apiHash, setApiHash] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const onCreds = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const id = Number(apiId.trim());
      if (!Number.isInteger(id) || id <= 0) throw new Error("API ID must be a number");
      await api.saveCreds(id, apiHash.trim());
      setStep("phone");
    });
  };

  const onPhone = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      await api.sendCode(phone.trim());
      setStep("code");
    });
  };

  const onCode = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const r = await api.submitCode(code.trim());
      if (r === "password") setStep("password");
      else onDone();
    });
  };

  const onPassword = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      await api.submitPassword(password);
      onDone();
    });
  };

  const steps: Step[] = ["creds", "phone", "code", "password"];

  return (
    <main className="login">
      <section className="login-card glass">
        <header className="login-brand">
          <img src="/logo.png" alt="" className="login-logo" />
          <h1>Rexa Drive</h1>
          <p>{t("tagline")}</p>
        </header>

        <div className="dots" aria-hidden>
          {steps.map((s) => (
            <span key={s} className={s === step ? "on" : ""} />
          ))}
        </div>

        {step === "creds" && (
          <form onSubmit={onCreds} className="form">
            <h2>{t("setupTitle")}</h2>
            <p className="hint">{t("setupHelp")}</p>
            <label>
              {t("apiId")}
              <input inputMode="numeric" value={apiId} onChange={(e) => setApiId(e.target.value)} required />
            </label>
            <label>
              {t("apiHash")}
              <input
                value={apiHash}
                onChange={(e) => setApiHash(e.target.value)}
                autoCapitalize="off"
                autoCorrect="off"
                required
              />
            </label>
            <button className="btn primary" disabled={busy}>
              {t("continue")}
            </button>
          </form>
        )}

        {step === "phone" && (
          <form onSubmit={onPhone} className="form">
            <h2>{t("phoneTitle")}</h2>
            <label>
              {t("phone")}
              <input
                type="tel"
                placeholder="+8801XXXXXXXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </label>
            <button className="btn primary" disabled={busy}>
              {t("sendCode")}
            </button>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={onCode} className="form">
            <h2>{t("codeTitle")}</h2>
            <p className="hint">{t("codeHelp")}</p>
            <label>
              {t("code")}
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </label>
            <button className="btn primary" disabled={busy}>
              {t("verify")}
            </button>
            <button type="button" className="btn ghost" onClick={() => setStep("phone")}>
              {t("back")}
            </button>
          </form>
        )}

        {step === "password" && (
          <form onSubmit={onPassword} className="form">
            <h2>{t("passTitle")}</h2>
            <p className="hint">{t("passHelp")}</p>
            <label>
              {t("password")}
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            <button className="btn primary" disabled={busy}>
              {t("unlock")}
            </button>
            <button type="button" className="btn ghost" onClick={() => setStep("phone")}>
              {t("back")}
            </button>
          </form>
        )}

        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );
}
