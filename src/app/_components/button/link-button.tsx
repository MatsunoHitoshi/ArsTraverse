type LinkButtonProps = {
  children: React.ReactNode;
  width?: "max" | "full";
  className?: string;
  href: string;
  target?: "_blank" | "_self";
  rel?: "noopener noreferrer";
};

export const LinkButton = ({
  children,
  width = "max",
  className,
  href,
  target = "_self",
  rel = "noopener noreferrer",
}: LinkButtonProps) => {
  return (
    <a
      href={href}
      target={target}
      rel={rel}
      className={`font-md rounded-md bg-slate-700 px-3 py-2 text-slate-50 w-${width} ${className}`}
    >
      {children}
    </a>
  );
};
