import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  navGroups,
  type NavGroup,
  type NavItem,
} from "../components/MobileNav/navigation";

function translateNavItem(item: NavItem, t: (key: string) => string): NavItem {
  return {
    ...item,
    label: item.labelKey ? t(item.labelKey) : item.label,
  };
}

/** Returns navigation groups with translated labels where labelKey is defined. */
export function useTranslatedNavGroups(): NavGroup[] {
  const { t } = useTranslation();

  return useMemo(
    () =>
      navGroups.map((group) => ({
        ...group,
        items: group.items.map((item) => translateNavItem(item, t)),
      })),
    [t],
  );
}

/** Flat list of desktop nav items with translated labels. */
export function useTranslatedDesktopNavItems(): NavItem[] {
  const groups = useTranslatedNavGroups();
  return useMemo(() => groups.flatMap((group) => group.items), [groups]);
}
