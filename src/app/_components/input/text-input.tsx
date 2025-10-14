import { Input } from "@headlessui/react";
import clsx from "clsx";

export const TextInput = ({
  id,
  value,
  onChange,
  placeholder = "",
  defaultValue = "",
  autoFocus = false,
  required = false,
}: {
  id?: string;
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  defaultValue?: string;
  autoFocus?: boolean;
  required?: boolean;
}) => {
  return (
    <Input
      type="text"
      id={id}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className={clsx(
        "block w-full rounded-lg border-none bg-white/5 px-3 py-1.5 text-sm/6",
        "focus:outline-none data-[focus]:outline-1 data-[focus]:-outline-offset-2 data-[focus]:outline-slate-400",
      )}
      value={value}
      defaultValue={defaultValue}
      onChange={(e) => onChange(e.target.value)}
      required={required}
    />
  );
};
