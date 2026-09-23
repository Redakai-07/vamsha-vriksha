import Link from "next/link";

import { BrandMark } from "@/components/canvas/CanvasToolbar";

/**
 * Offline fallback. The service worker precaches the app shell, so in practice
 * this page appears only when a navigation target was never visited online.
 */
export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <BrandMark />
      <h1 className="font-display text-[24px] font-medium tracking-tight">
        You are offline - and that is fine
      </h1>
      <p className="max-w-md text-[13.5px] leading-relaxed text-muted-foreground">
        Vamsha-Vriksha runs entirely on this device. Your lineages, people and relationships are in
        this browser&apos;s local database and are unaffected by the network.
      </p>
      <Link
        href="/"
        className="rounded-lg bg-primary px-4 py-2 text-[13.5px] text-primary-foreground transition-opacity hover:opacity-90"
      >
        Open my lineages
      </Link>
    </main>
  );
}
