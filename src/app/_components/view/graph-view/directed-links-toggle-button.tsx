type DirectedLinksToggleButtonProps = {
  isDirectedLinks: boolean;
  setIsDirectedLinks: (value: boolean) => void;
};

export const DirectedLinksToggleButton = ({
  isDirectedLinks,
  setIsDirectedLinks,
}: DirectedLinksToggleButtonProps) => {
  return (
    <button
      onClick={() => {
        setIsDirectedLinks(!isDirectedLinks);
      }}
      className="rounded-lg bg-black/20 p-2 backdrop-blur-sm"
    >
      <svg width={16} height={16}>
        <defs>
          <linearGradient id="dashGradient" x1="100%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="orange" stopOpacity="1" />
            <stop offset="100%" stopColor="orange" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line
          x1="0"
          y1="0"
          x2="20"
          y2="20"
          stroke={isDirectedLinks ? "url(#dashGradient)" : "white"}
          opacity={1}
          strokeWidth="2"
          strokeDasharray={isDirectedLinks ? "15,5" : undefined}
        />
        {isDirectedLinks && (
          <animate
            attributeName="stroke-dashoffset"
            values="0;-20"
            dur="1s"
            repeatCount="indefinite"
          />
        )}
      </svg>
    </button>
  );
};
