"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./api";
import { useUiStore } from "./store";

export type SavedDiscoveryType = "professional" | "organization" | "service" | "mentor";
type SavedItem = { item_type: SavedDiscoveryType; item_id: string };
const keyOf = (type: SavedDiscoveryType, id: string) => type + ":" + id;

export function useSavedDiscoveryItems() {
  const token = useUiStore(state => state.token);
  const [savedKeys, setSavedKeys] = useState<string[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [savedError, setSavedError] = useState("");
  const [savingKeys, setSavingKeys] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    if (!token) { setSavedKeys([]); setSavedError(""); return; }
    setLoadingSaved(true);
    try {
      const rows = await api<SavedItem[]>("/api/v1/me/saved-items", {}, token);
      setSavedKeys(Array.isArray(rows) ? rows.map(row => keyOf(row.item_type, row.item_id)) : []);
      setSavedError("");
    } catch (cause) {
      setSavedError(cause instanceof ApiError ? cause.message : "Saved items could not be loaded.");
    } finally { setLoadingSaved(false); }
  }, [token]);

  useEffect(() => { void refresh(); }, [refresh]);

  const toggle = useCallback(async (type: SavedDiscoveryType, id: string) => {
    if (!token) { setSavedError("Sign in to save items to your account."); return false; }
    const key = keyOf(type, id);
    if (savingKeys.includes(key)) return false;
    setSavingKeys(current => [...current, key]);
    setSavedError("");
    const wasSaved = savedKeys.includes(key);
    try {
      if (wasSaved) {
        await api("/api/v1/me/saved-items/" + encodeURIComponent(type) + "/" + encodeURIComponent(id), { method: "DELETE" }, token);
        setSavedKeys(current => current.filter(item => item !== key));
      } else {
        await api("/api/v1/me/saved-items", { method: "POST", body: JSON.stringify({ itemType: type, itemId: id }) }, token);
        setSavedKeys(current => current.includes(key) ? current : [...current, key]);
      }
      return true;
    } catch (cause) {
      setSavedError(cause instanceof ApiError ? cause.message : "The saved item could not be updated.");
      return false;
    } finally { setSavingKeys(current => current.filter(item => item !== key)); }
  }, [token, savedKeys, savingKeys]);

  const isSaved = useCallback((type: SavedDiscoveryType, id: string) => savedKeys.includes(keyOf(type, id)), [savedKeys]);
  const isSaving = useCallback((type: SavedDiscoveryType, id: string) => savingKeys.includes(keyOf(type, id)), [savingKeys]);
  return { isSaved, isSaving, toggle, refresh, loadingSaved, savedError, signedIn: Boolean(token) };
}
