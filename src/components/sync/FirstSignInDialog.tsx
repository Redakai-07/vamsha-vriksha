"use client";

import { CloudUpload, HardDrive, Timer } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useProjectList } from "@/hooks/useProjectData";
import { useSyncStore } from "@/stores/syncStore";

/**
 * The first-contact question.
 *
 * A device that has been used offline for months can hold real work, and signing
 * in must never be the moment it silently appears in someone's cloud. So the
 * work is held back first and the user is asked, in plain words, what to do with
 * it - with "keep them local" and "do later" both being real answers.
 */
export function FirstSignInDialog() {
  const prompt = useSyncStore((state) => state.firstSignIn);
  const account = useSyncStore((state) => state.account);
  const resolve = useSyncStore((state) => state.resolveFirstSignIn);
  const projects = useProjectList();

  const ids = prompt?.projectIds ?? [];
  if (!prompt || !ids.length) return null;

  const names = (projects ?? [])
    .filter((project) => ids.includes(project.id))
    .map((project) => project.name);
  const count = projectIdsCount(ids);

  return (
    <Dialog open onOpenChange={(open) => !open && void resolve("later")}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>You have existing local projects.</DialogTitle>
          <DialogDescription>
            {count === 1
              ? `“${names[0] ?? "One lineage"}” only exists on this device. ${account?.displayName ?? "Your account"} does not have it yet, and nothing has been uploaded.`
              : `${count} lineages only exist on this device. ${account?.displayName ?? "Your account"} does not have them yet, and nothing has been uploaded.`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Button onClick={() => void resolve("back-up")}>
            <CloudUpload /> Back up these projects to your account
          </Button>
          <Button variant="outline" onClick={() => void resolve("keep-local")}>
            <HardDrive /> Keep them local
          </Button>
          <Button variant="ghost" onClick={() => void resolve("later")}>
            <Timer /> Do this later
          </Button>
        </div>

        {names.length > 0 && (
          <ul className="grid gap-1 rounded-lg border border-border bg-card/40 p-3 text-[12.5px] text-muted-foreground">
            {names.map((name) => (
              <li key={name} className="truncate">
                {name}
              </li>
            ))}
          </ul>
        )}

        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Until you choose, these lineages stay on this device only - and anything you keep local keeps
          working exactly as it does today. Your other work is unaffected.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function projectIdsCount(ids: string[]): number {
  return new Set(ids).size;
}
