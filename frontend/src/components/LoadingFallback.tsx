import { useTranslation } from "react-i18next";

export function LoadingFallback() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-stellar-dark flex items-center justify-center text-stellar-text-secondary">
      {t("app.loadingPage")}
    </div>
  );
}
