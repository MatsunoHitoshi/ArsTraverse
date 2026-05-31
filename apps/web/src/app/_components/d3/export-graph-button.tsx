import { exportSvg } from "@/app/_utils/sys/svg";
import { ShareIcon } from "../icons";

export const ExportGraphButton = ({
  svgRef,
  currentScale,
}: {
  svgRef: React.RefObject<SVGSVGElement>;
  currentScale: number;
}) => {
  return (
    <button
      className="rounded-lg bg-black/20 p-2 backdrop-blur-sm"
      onClick={() => {
        if (svgRef.current) {
          exportSvg(svgRef.current, 4 / currentScale);
        }
      }}
    >
      <ShareIcon height={16} width={16} color="white" />
    </button>
  );
};
