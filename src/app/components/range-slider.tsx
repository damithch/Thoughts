"use client";

import { useState } from "react";

type RangeSliderProps = {
  id: string;
  name: string;
  min: number;
  max: number;
  step?: number;
  defaultValue: number;
  label: string;
  description?: string;
};

export default function RangeSlider({
  id,
  name,
  min,
  max,
  step = 1,
  defaultValue,
  label,
  description,
}: RangeSliderProps) {
  const [value, setValue] = useState(defaultValue);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs font-medium text-stone-700" htmlFor={id}>
          {label}
        </label>
        <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-950">
          k = {value}
        </span>
      </div>
      <input
        id={id}
        name={name}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="w-full h-2 rounded-lg bg-stone-200 accent-indigo-600 cursor-pointer outline-none transition"
      />
      {description ? (
        <p className="mt-1 text-[11px] text-stone-400">{description}</p>
      ) : null}
    </div>
  );
}
