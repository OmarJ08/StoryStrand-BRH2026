import Image from "next/image";

/**
 * StoryStrand identity (design sheet "StoryStrand logo variants"): the book-and-DNA mark,
 * the wordmark (Story + Strand, Bricolage Grotesque) and the "YOUR READING DNA" tagline.
 * On the dark UI the dark-lockup colouring is used: white "Story", coral "Strand".
 */
const MARK_RATIO = 1689 / 910;   // public/brand/mark*.png, cropped from the design sheet

type Variant = "stacked" | "horizontal" | "mark";

const MARK_HEIGHT = { sm: 22, md: 44, lg: 96 } as const;
const WORD_SIZE = { sm: "text-lg", md: "text-3xl", lg: "text-5xl sm:text-6xl" } as const;

export function Wordmark({ size = "md" }: { size?: keyof typeof WORD_SIZE }) {
  return (
    <span className={`font-display font-bold tracking-tight ${WORD_SIZE[size]}`}>
      Story<span className="text-coral">Strand</span>
    </span>
  );
}

export default function Logo({ variant = "horizontal", size = "md", tagline = true }: {
  variant?: Variant;
  size?: keyof typeof MARK_HEIGHT;
  tagline?: boolean;
}) {
  const h = MARK_HEIGHT[size];
  const mark = (
    <Image src="/brand/mark.png" alt={variant === "mark" ? "StoryStrand" : ""} width={Math.round(h * MARK_RATIO)}
      height={h} priority={size === "lg"} className="select-none" draggable={false} />
  );
  if (variant === "mark") return mark;

  const tag = tagline && (
    <span className="text-[0.62rem] font-semibold tracking-[0.35em] text-white/55 sm:text-xs">YOUR READING DNA</span>
  );
  return variant === "stacked" ? (
    <span className="flex flex-col items-center gap-3 text-center">
      {mark}
      <Wordmark size={size} />
      {tag}
    </span>
  ) : (
    <span className="flex items-center gap-3">
      {mark}
      <span className="flex flex-col leading-none">
        <Wordmark size={size} />
        {tag && <span className="mt-1.5">{tag}</span>}
      </span>
    </span>
  );
}
