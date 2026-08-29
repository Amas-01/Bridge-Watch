import { useCallback } from "react";
import { useUserPreferencesStore } from "../stores/userPreferencesStore";

export function useFavorites() {
  const favoriteAssets = useUserPreferencesStore((s) => s.favoriteAssets);
  const favoriteBridges = useUserPreferencesStore((s) => s.favoriteBridges);
  const favoritesFilterMode = useUserPreferencesStore((s) => s.favoritesFilterMode);
  const addFavoriteAsset = useUserPreferencesStore((s) => s.addFavoriteAsset);
  const removeFavoriteAsset = useUserPreferencesStore((s) => s.removeFavoriteAsset);
  const toggleFavoriteBridge = useUserPreferencesStore((s) => s.toggleFavoriteBridge);
  const setFavoritesFilterMode = useUserPreferencesStore((s) => s.setFavoritesFilterMode);

  const toggleFavoriteAsset = useCallback(
    (symbol: string) => {
      if (favoriteAssets.includes(symbol)) {
        removeFavoriteAsset(symbol);
      } else {
        addFavoriteAsset(symbol);
      }
    },
    [addFavoriteAsset, favoriteAssets, removeFavoriteAsset]
  );

  const isAssetFavorite = useCallback(
    (symbol: string) => favoriteAssets.includes(symbol),
    [favoriteAssets]
  );

  const isBridgeFavorite = useCallback(
    (name: string) => favoriteBridges.includes(name),
    [favoriteBridges]
  );

  return {
    favoriteAssets,
    favoriteBridges,
    favoritesFilterMode,
    setFavoritesFilterMode,
    toggleFavoriteAsset,
    toggleFavoriteBridge,
    isAssetFavorite,
    isBridgeFavorite,
  };
}
