import { redirect } from "next/navigation";

// Superseded by /feed/colecciones, which lists a fan's granted collections
// directly across all creators — there's no per-creator browsing page
// anymore. (/feed itself is now the Grupo feed, not the collections list.)
export default function CreatorPage() {
  redirect("/feed/colecciones");
}
