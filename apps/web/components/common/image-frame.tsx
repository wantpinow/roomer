"use client"

import { ImageOffIcon } from "lucide-react"
import { useState } from "react"

import { cn } from "@roomer/ui/lib/utils"

export type ImageFrameTone = "cutout" | "photo"

/**
 * Every picture in Roomer sits in one of these: a fixed-ratio frame that
 * fades the image in, and degrades to a quiet placeholder when it's missing
 * or fails to load.
 *
 * `cutout` is for retailer product shots on white: they sit on a light
 * "plinth" and multiply into it, so the white box disappears (in both
 * themes — product photos read best on a light ground). `photo` fills the
 * frame (renders, lifestyle shots).
 */
export function ImageFrame({
  src,
  alt,
  tone = "photo",
  ratio = "4/3",
  placeholder,
  className,
  imageClassName,
}: {
  src: string | undefined
  alt: string
  tone?: ImageFrameTone
  /** CSS aspect-ratio, e.g. "1", "4/3", "3/2". */
  ratio?: string
  /** Shown when there's no image or it fails; defaults to an icon. */
  placeholder?: React.ReactNode
  className?: string
  imageClassName?: string
}) {
  // Track which src loaded/failed so a new src resets the state without an
  // effect.
  const [loaded, setLoaded] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const showImage = src !== undefined && failed !== src

  return (
    <div
      data-slot="image-frame"
      data-tone={tone}
      style={{ aspectRatio: ratio }}
      className={cn(
        "relative isolate overflow-hidden rounded-md",
        // The plinth only behind an actual cutout; empty frames stay quiet.
        tone === "cutout" && showImage
          ? "bg-[#f1ede6] dark:bg-[#dcd5ca]"
          : "bg-sunken",
        className
      )}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- images come from local Convex storage and retailer CDNs; Next's optimiser adds nothing for a single-user localhost app.
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          // An SSR'd image can finish loading before hydration attaches
          // onLoad/onError; pick up its settled state on mount.
          ref={(img) => {
            if (!img?.complete || loaded === src || failed === src) return
            if (img.naturalWidth > 0) setLoaded(src)
            else setFailed(src)
          }}
          onLoad={() => setLoaded(src)}
          onError={() => setFailed(src)}
          className={cn(
            "absolute inset-0 size-full transition-opacity duration-500 ease-out",
            tone === "cutout"
              ? "object-contain p-[8%] mix-blend-multiply"
              : "object-cover",
            loaded === src ? "opacity-100" : "opacity-0",
            imageClassName
          )}
        />
      ) : (
        <div
          role="img"
          aria-label={alt}
          className="absolute inset-0 flex items-center justify-center text-faint dark:text-muted-foreground"
        >
          {placeholder ?? <ImageOffIcon className="size-5" />}
        </div>
      )}
    </div>
  )
}
