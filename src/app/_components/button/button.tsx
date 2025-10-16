import { Loading } from "../loading/loading";

type ButtonProps = {
  id?: string;
  onClick?: () => void;
  children: React.ReactNode;
  type?: "button" | "submit";
  isLoading?: boolean;
  width?: "max" | "full";
  className?: string;
  disabled?: boolean;
  theme?: "transparent" | "primary";
  size?: "small" | "medium";
};

const style = {
  theme: {
    transparent: "rounded-lg bg-black/20 p-2 backdrop-blur-sm",
    primary:
      " rounded-md bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-50",
  },
  size: {
    small: "text-sm p-2",
    medium: "px-3 py-2 text-md",
  },
};

export const Button = ({
  id,
  onClick,
  children,
  type = "button",
  isLoading = false,
  width = "max",
  className,
  theme = "primary",
  disabled = false,
  size = "medium",
}: ButtonProps) => {
  return (
    <>
      {!isLoading ? (
        <button
          id={id}
          type={type}
          className={`w-${width} ${className} ${style.theme[theme]} ${style.size[size]}`}
          onClick={onClick}
          disabled={disabled}
        >
          {children}
        </button>
      ) : (
        <div className="font-md flex flex-row items-center justify-center rounded-md bg-slate-200 px-3 py-2 text-slate-900 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-50 dark:hover:bg-slate-700/90">
          <Loading color="white" size={20} />
        </div>
      )}
    </>
  );
};
