import { Suspense } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageSwitcher } from "./LanguageSwitcher";
import i18n from "../i18n/config";

function renderLanguageSwitcher() {
  return render(
    <Suspense fallback={null}>
      <LanguageSwitcher />
    </Suspense>,
  );
}

function getLanguageSwitcherButton() {
  return screen.getByRole("button", {
    name: /change language|cambiar idioma|changer de langue|sprache ändern|更改语言|言語を変更|언어 변경|تغيير اللغة/i,
  });
}

describe("LanguageSwitcher", () => {
  beforeEach(async () => {
    localStorage.clear();
    document.documentElement.dir = "ltr";
    document.documentElement.lang = "en";
    await i18n.changeLanguage("en");
  });

  it("lists all supported languages", async () => {
    const user = userEvent.setup();
    renderLanguageSwitcher();

    await user.click(getLanguageSwitcherButton());

    expect(screen.getByRole("button", { name: /Español/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Français/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Deutsch/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /中文/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /日本語/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /한국어/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /العربية/i })).toBeInTheDocument();
  });

  it("changes the active locale and persists it to localStorage", async () => {
    const user = userEvent.setup();
    renderLanguageSwitcher();

    await user.click(getLanguageSwitcherButton());
    await user.click(screen.getByRole("button", { name: /Español/i }));

    expect(i18n.language).toMatch(/^es/);
    expect(localStorage.getItem("i18nextLng")).toMatch(/^es/);
    expect(screen.getByRole("button", { name: /change language|cambiar idioma/i })).toHaveTextContent(
      "Español",
    );
  });

  it("applies RTL direction for Arabic", async () => {
    const user = userEvent.setup();
    renderLanguageSwitcher();

    await user.click(getLanguageSwitcherButton());
    await user.click(screen.getByRole("button", { name: /العربية/i }));

    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.lang).toBe("ar");
  });

  it("restores LTR direction when switching back to English", async () => {
    const user = userEvent.setup();
    renderLanguageSwitcher();

    await user.click(getLanguageSwitcherButton());
    await user.click(screen.getByRole("button", { name: /العربية/i }));
    await user.click(getLanguageSwitcherButton());
    await user.click(screen.getByRole("button", { name: /^English/i }));

    expect(document.documentElement.dir).toBe("ltr");
    expect(document.documentElement.lang).toBe("en");
  });
});
