// Re-mounts on every navigation, so each page settles in once when opened.
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in print:animate-none">{children}</div>;
}
