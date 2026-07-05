import { PlayIcon } from "../../icons";

type LiveSimulationToggleButtonProps = {
  enableLiveSimulation: boolean;
  setEnableLiveSimulation: React.Dispatch<React.SetStateAction<boolean>>;
  title: string;
};

export const LiveSimulationToggleButton = ({
  enableLiveSimulation,
  setEnableLiveSimulation,
  title,
}: LiveSimulationToggleButtonProps) => {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={enableLiveSimulation}
      onClick={() => {
        setEnableLiveSimulation((prev) => !prev);
      }}
      className={`rounded-lg p-2 backdrop-blur-sm ${
        enableLiveSimulation ? "bg-orange-500/40" : "bg-black/20"
      }`}
    >
      <PlayIcon
        width={16}
        height={16}
        color={enableLiveSimulation ? "orange" : "white"}
      />
    </button>
  );
};
