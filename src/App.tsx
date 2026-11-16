import { useCallback, useEffect, useState } from "react";
import { api, Status } from "./api";
import { toggleLang, useT } from "./i18n";
import Login from "./Login";
import Drive from "./Drive";

export default function App() {
  const t = useT();
  const [status, setStatus] = useState<Status | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.status());
    } catch {
      setStatus({ has_creds: false, authorized: false });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!status) {
    return (
      <div className="boot">
        <img src="/logo.png" alt="Rexa Drive" className="boot-logo" />
      </div>
    );
  }

  return (
    <>
      <div className="aurora" aria-hidden />
      {status.authorized ? (
        <Drive userName={status.name ?? ""} onSignedOut={refresh} />
      ) : (
        <Login status={status} onDone={refresh} />
      )}
      {!status.authorized && (
        <button className="lang-fab" onClick={toggleLang}>
          {t("language")}
        </button>
      )}
    </>
  );
}
