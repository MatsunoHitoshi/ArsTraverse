import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@headlessui/react";
import React, { useState } from "react";

export type TagOption = { id: string; label: string; type: "label" | "tag" };
type TagsInputProps = {
  options: TagOption[];
  selected: TagOption | undefined;
  setSelected: React.Dispatch<React.SetStateAction<TagOption | undefined>>;
  borderRed?: boolean;
  placeholder?: string;
  defaultOption?: TagOption;
};

export const TagsInput = ({
  options,
  selected,
  setSelected,
  placeholder,
  defaultOption,
}: TagsInputProps) => {
  const [query, setQuery] = useState("");

  const filteredOptions =
    query === ""
      ? []
      : options.filter((option: TagOption) => {
          return option.label.toLowerCase().includes(query.toLowerCase());
        }) ?? [];

  return (
    <Combobox
      value={selected}
      defaultValue={defaultOption}
      // multiple
      onChange={(val) => {
        if (val) {
          setSelected(val);
        }
      }}
      onClose={() => setQuery("")}
    >
      <ComboboxInput
        displayValue={(option: TagOption) => (option ? option.label : "")}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        className="border-none bg-transparent text-sm focus:outline-none"
        // className={clsx(
        //   "w-full rounded-lg bg-white/5 py-1.5 pl-3 pr-8 text-sm/6 text-white",
        //   "border-none focus:outline-none data-[focus]:outline-1 data-[focus]:-outline-offset-2 data-[focus]:outline-slate-400",
        // )}
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
