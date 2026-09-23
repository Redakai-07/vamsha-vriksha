import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Person } from "@/lib/domain/types";
import { cn } from "@/lib/utils/cn";
import { getInitials, avatarTint } from "@/lib/utils/person";

const SIZE_CLASSES: Record<string, string> = {
  xs: "size-7 text-[10px]",
  sm: "size-9 text-[12px]",
  md: "size-12 text-[15px]",
  lg: "size-16 text-[19px]",
  xl: "size-24 text-[28px]",
};

export interface PersonAvatarProps {
  person: Pick<Person, "id" | "name" | "displayName" | "profilePhoto" | "dateOfDeath">;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}

export function PersonAvatar({ person, size = "sm", className }: PersonAvatarProps) {
  const tint = avatarTint(person.id);
  const deceased = Boolean(person.dateOfDeath);

  return (
    <Avatar
      className={cn(
        SIZE_CLASSES[size],
        "border",
        deceased ? "border-border/80" : "border-border",
        className,
      )}
    >
      {person.profilePhoto ? (
        <AvatarImage src={person.profilePhoto} alt={person.name} />
      ) : null}
      <AvatarFallback
        className={cn("font-display tracking-wide", deceased && "opacity-80")}
        style={{ backgroundColor: tint.bg, color: tint.fg }}
      >
        {getInitials(person)}
      </AvatarFallback>
    </Avatar>
  );
}
