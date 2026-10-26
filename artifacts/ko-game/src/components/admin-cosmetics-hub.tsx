import { AdminCosmetics } from "./admin-cosmetics";

/** Both historical routes open the same catalog and editor. */
export function AdminCosmeticsHub(_props: {
  onUnauthorized: () => void;
  legacy: boolean;
  onNavigate: (path: string) => void;
}) {
  return <AdminCosmetics />;
}
