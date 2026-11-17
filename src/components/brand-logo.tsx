import Image from "next/image";

export function BrandLogo({
  size = 48,
  className = "",
  priority = false,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/logo.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      priority={priority}
      className={`shrink-0 rounded-xl bg-white object-contain ${className}`}
    />
  );
}
