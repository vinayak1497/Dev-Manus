export const PRODUCT_NAME = "DevOps Safeguard";
export const TAGLINE = "Monitor. Detect. Prevent. Keep your applications healthy.";

export type NavLink = { label: string; href: string };

/**
 * Landing-only navigation. All targets are in-page anchors so there are
 * no broken links to future screens (auth, projects, dashboard, etc.
 * are explicitly out of scope for this run — see Screen_Navigation.md).
 */
export const NAV_LINKS: NavLink[] = [
  { label: "Product", href: "#product" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Capabilities", href: "#capabilities" },
  { label: "Technology", href: "#technology" },
  { label: "Resources", href: "#resources" },
];

export const GET_STARTED_HREF = "#get-started";
export const DEMO_HREF = "#console-preview";
export const LOGIN_HREF = "/login";
export const REGISTER_HREF = "/register";
/** First screen after successful authentication (Screen_Navigation.md §6). */
export const PROJECTS_HREF = "/projects";
