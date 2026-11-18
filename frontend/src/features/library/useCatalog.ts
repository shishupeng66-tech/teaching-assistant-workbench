import { useEffect, useState } from "react";
import { api } from "../../api";
import { emptyCatalog } from "./types";
import type { Catalog } from "./types";
export function useCatalog() {
  const [catalog, setCatalog] = useState<Catalog>(emptyCatalog),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [tick, setTick] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    api<Catalog>("/library/catalog")
      .then((c) => {
        if (active) {
          setCatalog(c);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tick]);
  return { catalog, loading, error, reload: () => setTick((t) => t + 1) };
}
