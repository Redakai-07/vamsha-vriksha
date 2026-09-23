import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="font-display text-[24px] font-medium tracking-tight">Nothing at this path</h1>
      <p className="max-w-md text-[13.5px] text-muted-foreground">
        This page does not exist. Every lineage you have created is safe in this browser - open the
        dashboard to find them.
      </p>
      <Link
        href="/"
        className="rounded-lg bg-primary px-4 py-2 text-[13.5px] text-primary-foreground transition-opacity hover:opacity-90"
      >
        Back to my lineages
      </Link>
    </main>
  );
}
