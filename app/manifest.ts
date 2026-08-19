import type { MetadataRoute } from "next";

// Lets "Add to Home Screen" install Onyx as a standalone PWA — mainly so
// the admin account stays usable from a phone without a computer handy.
// Site-wide (anyone can install it), but that grants nothing on its own:
// it's still the same login-gated app either way. start_url points at
// /admin since that's this install's actual use case; a fan who installs
// it just lands on /feed instead (middleware already redirects non-admins
// away from /admin).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Onyx Admin",
    short_name: "Onyx",
    description: "Private space to connect with your fans",
    start_url: "/admin",
    display: "standalone",
    background_color: "#131110",
    theme_color: "#131110",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
