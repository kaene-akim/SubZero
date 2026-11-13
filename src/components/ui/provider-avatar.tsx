import Image from "next/image";
import { cn, initials } from "@/lib/utils";
import type { Provider } from "@/lib/db/schema";

export function ProviderAvatar({
  provider,
  name,
  size = "md",
  className,
}: {
  provider?: Pick<Provider, "name" | "brandColor" | "logoUrl"> | null;
  name?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const label = provider?.name ?? name ?? "?";
  const color = provider?.brandColor ?? "#0d5c4b";
  const sizeClass = { sm: "h-8 w-8 text-[11px]", md: "h-10 w-10 text-[13px]", lg: "h-14 w-14 text-lg" }[size];
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-xl font-semibold text-white ring-1 ring-black/5",
        sizeClass,
        className,
      )}
      style={{ backgroundColor: color }}
      aria-hidden="true"
    >
      {provider?.logoUrl ? (
        <Image src={provider.logoUrl} alt="" width={56} height={56} className="h-full w-full object-cover" unoptimized />
      ) : (
        initials(label)
      )}
    </span>
  );
}
