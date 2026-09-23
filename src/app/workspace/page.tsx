"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { WorkspaceShell } from "@/components/canvas/WorkspaceShell";
import { metaRepo } from "@/lib/db/repositories/preferences";
import { projectsRepo } from "@/lib/db/repositories/projects";

/**
 * Route: /workspace/?project=<id>
 *
 * The whole app is a static export, so there is no server-side parameter to
 * read: the project id comes from the URL, and falls back to the last lineage
 * opened on this device (which is also what makes reopening the browser feel
 * like resuming work rather than starting over).
 */
export default function WorkspacePage() {
  const router = useRouter();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [resolving, setResolving] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const resolve = async () => {
      const params = new URLSearchParams(window.location.search);
      const hash = window.location.hash.replace(/^#/, "");
      const hashParams = new URLSearchParams(hash);
      const fromUrl = params.get("project") ?? hashParams.get("project");

      if (fromUrl) {
        const project = await projectsRepo.get(fromUrl);
        if (project) {
          if (!cancelled) {
            setProjectId(project.id);
            setResolving(false);
          }
          void metaRepo.setLastProjectId(project.id);
          return;
        }
      }

      const last = await metaRepo.getLastProjectId();
      if (last) {
        const project = await projectsRepo.get(last);
        if (project) {
          if (!cancelled) {
            setProjectId(project.id);
            setResolving(false);
          }
          return;
        }
      }

      if (!cancelled) router.replace("/");
      setResolving(false);
    };

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (resolving || !projectId) {
    return (
      <div className="flex min-h-dvh items-center justify-center gap-2 text-[13px] text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Opening your lineage…
      </div>
    );
  }

  return (
    <WorkspaceShell
      projectId={projectId}
      onBackToProjects={() => router.push("/")}
    />
  );
}
