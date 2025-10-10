import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  Transition,
} from "@headlessui/react";
import { ChevronUpDownIcon, CheckIcon } from "@heroicons/react/24/outline";
import React from "react";
import clsx from "clsx";

type ListboxOption = { value: string; label: string };
type ListboxInputProps = {
  options: ListboxOption[];
  selected: string;
  setSelected: (value: string) => void;
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  optionsClassName?: string;
  disabled?: boolean;
};

export const ListboxInput = ({
  options,
  selected,
  setSelected,
  placeholder = "選択してください",
  className = "",
  buttonClassName = "",
  optionsClassName = "",
  disabled = false,
}: ListboxInputProps) => {
  const selectedOption = options.find((option) => option.value === selected);

  return (
    <div className={clsx("relative", className)}>
      <Listbox value={selected} onChange={setSelected} disabled={disabled}>
        <ListboxButton
          className={clsx(
            "relative w-full cursor-default rounded-md bg-slate-800 py-2 pl-3 pr-10 text-left text-white shadow-md focus:outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75 focus-visible:ring-offset-2 focus-visible:ring-offset-orange-300 sm:text-sm",
            disabled && "cursor-not-allowed opacity-50",
            buttonClassName,
          )}
        >
          <span className="block truncate">
            {selectedOption?.label ?? placeholder}
          </span>
          <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
            <ChevronUpDownIcon
              className="h-5 w-5 text-gray-400"
              aria-hidden="true"
            />
          </span>
        </ListboxButton>
        <Transition
          as={React.Fragment}
          leave="transition ease-in duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <ListboxOptions
            className={clsx(
              "absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-slate-800 py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm",
              optionsClassName,
            )}
          >
            {options.map((option) => (
              <ListboxOption
                key={option.value}
                className={({ active }) =>
                  clsx(
                    "relative cursor-default select-none py-2 pl-10 pr-4",
                    active ? "bg-indigo-600 text-white" : "text-gray-300",
                  )
                }
                value={option.value}
              >
                {({ selected: isSelected }) => (
                  <>
                    <span
                      className={clsx(
                        "block truncate",
                        isSelected ? "font-medium" : "font-normal",
                      )}
                    >
                      {option.label}
                    </span>
                    {isSelected ? (
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-indigo-400">
                        <CheckIcon className="h-5 w-5" aria-hidden="true" />
                      </span>
                    ) : null}
                  </>
                )}
              </ListboxOption>
            ))}
          </ListboxOptions>
        </Transition>
      </Listbox>
    </div>
  );
};
