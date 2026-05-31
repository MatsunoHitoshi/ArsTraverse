import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@headlessui/react";
import React, { useState } from "react";
import clsx from "clsx";

type SelectBoxOption = { id: string; label: string };
type SelectInputProps = {
  options: SelectBoxOption[];
  selected: SelectBoxOption | undefined;
  setSelected: React.Dispatch<
    React.SetStateAction<SelectBoxOption | undefined>
  >;
  borderRed?: boolean;
  placeholder?: string;
};

export const SelectInput = ({
  options,
  selected,
  setSelected,
  borderRed,
  placeholder,
}: SelectInputProps) => {
  const [query, setQuery] = useState("");

  const filteredOptions =
    query === ""
      ? []
      : options.filter((option: SelectBoxOption) => {
          return option.label.toLowerCase().includes(query.toLowerCase());
        }) ?? [];

  return (
    <Combobox
      value={selected}
      onChange={(val) => {
        if (val) {
          setSelected(val);
        }
      }}
      onClose={() => setQuery("")}
    >
      <ComboboxInput
        displayValue={(option: SelectBoxOption) => (option ? option.label : "")}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        className={clsx(
          "w-full rounded-lg bg-white/5 py-1.5 pl-3 pr-8 text-sm/6 text-white",
          borderRed
            ? "border border-red-600/70 focus:outline-none"
            : "border-none focus:outline-none data-[focus]:outline-1 data-[focus]:-outline-offset-2 data-[focus]:outline-slate-400",
        )}
      />
      <ComboboxOptions
        anchor="bottom start"
        className="z-50 max-w-[300px] divide-y divide-slate-400 rounded-md border bg-slate-900 empty:invisible"
      >
        {filteredOptions.map((option) => (
          <ComboboxOption
            key={option.id}
            value={option}
            className="cursor-pointer p-2 text-slate-50 data-[focus]:bg-slate-400 data-[focus]:text-black"
          >
            {option.label}
          </ComboboxOption>
        ))}
      </ComboboxOptions>
    </Combobox>
  );
};
