import { redirect } from "next/navigation";

// Superseded by /feed, which now lists a fan's granted collections directly
// across all creators — there's no per-creator browsing page anymore.
export default function CreatorPage() {
  redirect("/feed");
}
