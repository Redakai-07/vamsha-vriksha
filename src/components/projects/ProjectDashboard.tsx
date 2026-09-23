"use client";

import {
  Database,
  GitBranch,
  KeyRound,
  Plus,
  Settings,
  ShieldCheck,
  Sparkles,
  WifiOff,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { BrandMark } from "@/components/canvas/CanvasToolbar";
import { CreateProjectDialog } from "@/components/projects/CreateProjectDialog";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { backupFileName, exportProjectToFile, exportAll } from "@/lib/db/backup";
import { metaRepo } from "@/lib/db/repositories/preferences";
import { projectsRepo } from "@/lib/db/repositories/projects";
import type { Project } from "@/lib/domain/types";
import { downloadTextFile } from "@/lib/utils/download";
import { useProjectList } from "@/hooks/useProjectData";
import { usePreferencesStore } from "@/stores/preferencesStore";

/**
 * The dashboard is the offline home screen: it lists every lineage stored in
 * this browser, and explains - quietly - why it works with no internet.
 */
export function ProjectDashboard() {
  const router = useRouter();
  const projects = useProjectList();
  const preferences = usePreferencesStore((state) => state.preferences);
  const hydrate = usePreferencesStore((state) => state.hydrate);

  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [renaming, setRenaming] = useState<Project | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleting, setDeleting] = useState<Project | null>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const openProject = (projectId: string) => {
    void metaRepo.setLastProjectId(projectId);
    router.push(`/workspace/?project=${projectId}`);
  };

  const createProject = async (input: {
    name: string;
    description?: string;
    kinshipSystem: "hindi" | "english";
  }) => {
    const project = await projectsRepo.create(input);
    await metaRepo.setLastProjectId(project.id);
    toast.success(`${project.name} created`, {
      description: "Stored in this browser. Start by adding a person.",
    });
    openProject(project.id);
  };

  const exportOne = async (project: Project) => {
    const json = await exportProjectToFile(project.id);
    downloadTextFile(backupFileName(project.name), json);
    toast.success("Exported", { description: "A JSON copy you can keep anywhere." });
  };

  const exportEverything = async () => {
    const backup = await exportAll();
    downloadTextFile(backupFileName(), JSON.stringify(backup, null, 2));
    toast.success("Full backup downloaded");
  };

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-5">
          <BrandMark />
          <span className="font-display text-[15px] font-medium tracking-tight">Vamsha-Vriksha</span>
          <span className="text-[11px] text-muted-foreground">वंश-वृक्ष</span>
          <span className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
            <Settings /> <span className="hidden sm:inline">Preferences &amp; data</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 pb-24 pt-12">
        <section className="max-w-2xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-[11.5px] text-muted-foreground">
            <WifiOff className="size-3.5" /> Works fully offline · no account needed
          </p>
          <h1 className="mt-4 font-display text-[34px] leading-[1.12] font-medium tracking-tight sm:text-[42px]">
            Map your family, across generations,
            <br className="hidden sm:block" /> on a canvas of your own.
          </h1>
          <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
            Record people, preserve their biodata, and draw the relationships that make a lineage -
            parents, spouses, siblings, and the culturally specific bonds in between (चाचा, मामा,
            देवर). Everything is stored locally in this browser and stays there.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={() => setCreateOpen(true)}>
              <Plus /> Start a new lineage
            </Button>
            {projects && projects.length > 0 && (
              <Button size="lg" variant="outline" onClick={() => void exportEverything()}>
                <Database /> Back up everything
              </Button>
            )}
          </div>
        </section>

        <section className="mt-16">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-[20px] font-medium tracking-tight">Your lineages</h2>
              <p className="text-[12.5px] text-muted-foreground">
                {projects === undefined
                  ? "Reading this browser's local database…"
                  : projects.length === 0
                    ? "Nothing here yet - every lineage you create lives on this device."
                    : `${projects.length} lineage${projects.length === 1 ? "" : "s"} stored locally`}
              </p>
            </div>
            {projects && projects.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
                <Plus /> New
              </Button>
            )}
          </div>

          {projects?.length === 0 && <EmptyState onCreate={() => setCreateOpen(true)} />}

          {projects && projects.length > 0 && (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onOpen={() => openProject(project.id)}
                  onRename={() => {
                    setRenaming(project);
                    setRenameValue(project.name);
                  }}
                  onExport={() => void exportOne(project)}
                  onDelete={() => setDeleting(project)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="mt-20 grid gap-5 border-t border-border pt-10 sm:grid-cols-3">
          <Feature
            icon={Database}
            title="Stored on your device"
            body="Projects, people, biodata, relationships and canvas positions live in this browser's IndexedDB - not on a server. Close the tab and reopen it later: everything is still there."
          />
          <Feature
            icon={GitBranch}
            title="Relationships are records"
            body="A man is a father because a parent record says so, never because two boxes sit near each other on the canvas. Move people around freely."
          />
          <Feature
            icon={Sparkles}
            title="Kinship, not just trees"
            body="The finder walks the graph and names the bond the way your family would: chacha for a father's younger brother, devar for a husband's younger brother."
          />
          <Feature
            icon={ShieldCheck}
            title="Yours to keep"
            body="Export any lineage as JSON at any time, import it on another device, and erase everything from the preferences panel whenever you decide to."
          />
          <Feature
            icon={KeyRound}
            title="Sign-in is optional"
            body="There is no account in this phase and nothing is synced. Google authentication and cloud sync are planned as optional enhancements - the app never requires them."
          />
          <Feature
            icon={WifiOff}
            title="Offline by design"
            body="A service worker precaches the app, so it opens with the network switched off - useful in villages, on trains, or on a phone with no data left."
          />
        </section>
      </main>

      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultKinshipSystem={preferences.defaultKinshipSystem}
        onCreate={createProject}
      />

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onDataChanged={() => undefined}
      />

      <Dialog open={renaming !== null} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rename lineage</DialogTitle>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="rename-project">Name</Label>
            <Input
              id="rename-project"
              autoFocus
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (renaming && renameValue.trim()) {
                  await projectsRepo.update(renaming.id, { name: renameValue.trim() });
                  toast.success("Renamed");
                }
                setRenaming(null);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={deleting ? `Delete ${deleting.name}?` : "Delete lineage?"}
        description="Every person, relationship, biodata record and canvas position in this lineage will be removed from this device. Export first if you want a copy."
        confirmLabel="Delete lineage"
        onConfirm={async () => {
          if (!deleting) return;
          await projectsRepo.remove(deleting.id);
          toast.success("Lineage deleted");
        }}
      />
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate(): void }) {
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full border border-border bg-card">
        <Plus className="size-5 text-muted-foreground" />
      </span>
      <h3 className="mt-4 font-display text-[17px] font-medium tracking-tight">
        Begin with one person
      </h3>
      <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-muted-foreground">
        A new lineage opens on an almost-empty canvas with a single &ldquo;+&rdquo; node. Add whoever
        you remember first - a grandparent, a parent, yourself - and the graph grows from there.
      </p>
      <Button className="mt-5" onClick={onCreate}>
        <Plus /> Create your first lineage
      </Button>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="grid content-start gap-2">
      <Icon className="size-4 text-accent" />
      <h3 className="text-[13.5px] font-medium">{title}</h3>
      <p className="text-[12.5px] leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}
