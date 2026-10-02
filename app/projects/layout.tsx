import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Projects",
  description: "Your monitored projects in DevOps Safeguard.",
};

export default function ProjectsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
