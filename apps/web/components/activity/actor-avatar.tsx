import { AsteriskIcon, Settings2Icon, UserRoundIcon } from "lucide-react"

import { cn } from "@roomer/ui/lib/utils"

/** Who made a change (layoutEvents.actor in the backend, architecture §4). */
export type ActivityActor = "agent" | "user" | "system"

export const ACTOR_LABELS: Record<ActivityActor, string> = {
  agent: "Agent",
  user: "You",
  system: "Roomer",
}

/**
 * Small, distinct-but-quiet avatars: the agent in clay with an asterisk, you
 * in oak, the system in plain sunken grey.
 */
export function ActorAvatar({
  actor,
  className,
}: {
  actor: ActivityActor
  className?: string
}) {
  const Icon =
    actor === "agent"
      ? AsteriskIcon
      : actor === "user"
        ? UserRoundIcon
        : Settings2Icon
  return (
    <span
      data-slot="actor-avatar"
      data-actor={actor}
      role="img"
      aria-label={ACTOR_LABELS[actor]}
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-full border [&_svg]:size-3.5",
        actor === "agent" && "border-clay/20 bg-clay-tint text-clay",
        actor === "user" && "border-oak/20 bg-oak-tint text-oak",
        actor === "system" && "border-border bg-sunken text-muted-foreground",
        className
      )}
    >
      <Icon aria-hidden />
    </span>
  )
}
