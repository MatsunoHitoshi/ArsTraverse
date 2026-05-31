import { Checkbox } from "@headlessui/react";
import { CheckIcon } from "../icons";

export const CheckboxInput = ({
  enabled,
  setEnabled,
}: {
  enabled: boolean;
  setEnabled: React.Dispatch<React.SetStateAction<boolean>>;
}) => {
  return (
    <div className="flex h-6 w-6 items-center justify-center">
      <Checkbox
        checked={enabled}
        onChange={setEnabled}
        className="group size-6 cursor-pointer rounded-md bg-white/10 p-1 ring-1 ring-inset ring-white/15 data-[checked]:bg-orange-500"
      >
        <div className="hidden group-data-[checked]:block">
          <CheckIcon height={16} width={16} color={"black"} />
        </div>
      </Checkbox>
    </div>
  );
};
