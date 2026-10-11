"use client"

import {
  ArrowUpRightIcon,
  CopyIcon,
  EllipsisIcon,
  LayersIcon,
  PencilLineIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react"
import { useState } from "react"

import { Badge } from "@roomer/ui/components/badge"
import { Button } from "@roomer/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@roomer/ui/components/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@roomer/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@roomer/ui/components/dropdown-menu"
import { EmptyState } from "@roomer/ui/components/empty-state"
import { Input } from "@roomer/ui/components/input"
import { Kbd, KbdGroup } from "@roomer/ui/components/kbd"
import { Label } from "@roomer/ui/components/label"
import { LiveDot } from "@roomer/ui/components/live-dot"
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@roomer/ui/components/segmented-control"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@roomer/ui/components/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@roomer/ui/components/sheet"
import { Skeleton } from "@roomer/ui/components/skeleton"
import {
  Stat,
  StatLabel,
  StatUnit,
  StatValue,
} from "@roomer/ui/components/stat"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@roomer/ui/components/tabs"
import { Toggle } from "@roomer/ui/components/toggle"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@roomer/ui/components/tooltip"

import { Specimen } from "./section"

export function PrimitivesDemo() {
  const [density, setDensity] = useState<"airy" | "dense">("airy")
  return (
    <div className="grid gap-8 min-[1100px]:grid-cols-2">
      <Specimen label="Buttons" framed={false} className="col-span-full">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button>Save layout</Button>
            <Button variant="clay">
              <SparklesIcon data-icon="inline-start" />
              Render photoreal
            </Button>
            <Button variant="outline">Duplicate</Button>
            <Button variant="secondary">Compare</Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="destructive">
              <Trash2Icon data-icon="inline-start" />
              Archive
            </Button>
            <Button variant="link">
              View product
              <ArrowUpRightIcon data-icon="inline-end" />
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="lg">Large</Button>
            <Button size="default">Default</Button>
            <Button size="sm">Small</Button>
            <Button size="xs" variant="outline">
              Extra small
            </Button>
            <Button size="icon" variant="outline" aria-label="Add">
              <PlusIcon />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="More">
              <EllipsisIcon />
            </Button>
            <Button disabled>Disabled</Button>
          </div>
        </div>
      </Specimen>

      <Specimen label="Badges" framed={false}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Ink</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Draft</Badge>
          <Badge variant="oak">Candidate</Badge>
          <Badge variant="clay">Favourite</Badge>
          <Badge variant="sage">All clear</Badge>
          <Badge variant="error">2 errors</Badge>
          <Badge variant="warning">1 warning</Badge>
          <Badge variant="info">3 notes</Badge>
        </div>
      </Specimen>

      <Specimen label="Keys, dots & figures" framed={false}>
        <div className="flex flex-wrap items-center gap-6">
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            Plan <Kbd>P</Kbd> · 3D <Kbd>3</Kbd> · Rails <Kbd>[</Kbd>
            <Kbd>]</Kbd>
          </span>
          <KbdGroup>
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>
          <span className="flex items-center gap-3 text-xs text-muted-foreground">
            <LiveDot live /> live
            <LiveDot tone="sage" /> clear
            <LiveDot tone="muted" /> idle
          </span>
          <Stat>
            <StatLabel>Floor</StatLabel>
            <StatValue>
              22.4<StatUnit>m²</StatUnit>
            </StatValue>
          </Stat>
        </div>
      </Specimen>

      <Specimen label="Fields">
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="sg-name">Layout name</Label>
            <Input id="sg-name" defaultValue="Chaise by the pier" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sg-status">Status</Label>
            <Select defaultValue="candidate">
              <SelectTrigger id="sg-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="candidate">Candidate</SelectItem>
                <SelectItem value="favourite">Favourite</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sg-gap">Gap from wall</Label>
            <Input id="sg-gap" placeholder="e.g. 50 mm" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sg-bad">Ceiling height</Label>
            <Input id="sg-bad" defaultValue="24500" aria-invalid />
          </div>
        </div>
      </Specimen>

      <Specimen label="Tabs & switches">
        <div className="flex flex-col gap-5 p-5">
          <Tabs defaultValue="plan">
            <TabsList>
              <TabsTrigger value="plan">Plan</TabsTrigger>
              <TabsTrigger value="3d">3D</TabsTrigger>
              <TabsTrigger value="camera">Camera</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs defaultValue="issues">
            <TabsList variant="line">
              <TabsTrigger value="issues">Issues</TabsTrigger>
              <TabsTrigger value="items">Items</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>
            <TabsContent value="issues" className="pt-2 text-muted-foreground">
              The line variant: the inspector&apos;s tabs.
            </TabsContent>
            <TabsContent value="items" className="pt-2 text-muted-foreground">
              Items panel.
            </TabsContent>
            <TabsContent
              value="activity"
              className="pt-2 text-muted-foreground"
            >
              Activity panel.
            </TabsContent>
          </Tabs>
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl
              aria-label="Density"
              value={density}
              onValueChange={setDensity}
            >
              <SegmentedControlItem value="airy">Airy</SegmentedControlItem>
              <SegmentedControlItem value="dense">Dense</SegmentedControlItem>
            </SegmentedControl>
            <Toggle variant="outline" size="sm" defaultPressed>
              <LayersIcon />
              Show rugs
            </Toggle>
          </div>
        </div>
      </Specimen>

      <Specimen label="Card">
        <Card className="rounded-none border-0 shadow-none">
          <CardHeader>
            <CardTitle>Living room</CardTitle>
            <CardDescription>6 walls · 22.4 m² · 5 layouts</CardDescription>
          </CardHeader>
          <CardContent className="text-ink-soft">
            Warm white walls, light natural oak boards.
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <Button size="sm" variant="ghost">
              Edit shell
            </Button>
            <Button size="sm">Open</Button>
          </CardFooter>
        </Card>
      </Specimen>

      <Specimen label="Empty & loading">
        <div className="grid grid-cols-2 divide-x divide-border">
          <EmptyState
            icon={<LayersIcon />}
            title="No layouts yet"
            description="Ask the agent to propose one."
            action={
              <Button size="sm" variant="outline">
                New layout
              </Button>
            }
          />
          <div className="flex flex-col gap-3 p-6">
            <Skeleton className="h-3.5 w-3/5" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="mt-2 aspect-[3/2] w-full" />
          </div>
        </div>
      </Specimen>
      <Specimen
        label="Overlays"
        note="tooltip · menu · dialog · sheet"
        framed={false}
        className="col-span-full"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline">Tooltip</Button>
            </TooltipTrigger>
            <TooltipContent>
              Fit to view <Kbd>F</Kbd>
            </TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">Menu</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-52">
              <DropdownMenuLabel>Layout</DropdownMenuLabel>
              <DropdownMenuItem>
                <PencilLineIcon />
                Rename
                <DropdownMenuShortcut>R</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <CopyIcon />
                Duplicate
                <DropdownMenuShortcut>D</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive">
                <Trash2Icon />
                Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Rename layout</DialogTitle>
                <DialogDescription>
                  The agent refers to layouts by name, so keep it short and
                  descriptive.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                <Label htmlFor="sg-rename">Name</Label>
                <Input id="sg-rename" defaultValue="Chaise by the pier" />
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost">Cancel</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button>Rename</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline">Sheet</Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Inspector</SheetTitle>
                <SheetDescription>
                  Below 1100px the rails open as sheets like this one.
                </SheetDescription>
              </SheetHeader>
              <div className="px-5 text-muted-foreground">Content</div>
              <SheetFooter>
                <Button variant="outline">Close</Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>
      </Specimen>
    </div>
  )
}
