"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, ChevronsUpDown, Loader2, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface Option {
  value: string;
  label: string;
  description?: string | null;
}

function useOptionSearch(search: (q: string) => Promise<Option[]>, open: boolean) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => startTransition(async () => setOptions(await search(query))), 250);
    return () => clearTimeout(handle);
  }, [query, open, search]);

  return { query, setQuery, options, loading };
}

function OptionList({
  options,
  loading,
  query,
  setQuery,
  isSelected,
  onToggle,
  placeholder,
}: {
  options: Option[];
  loading: boolean;
  query: string;
  setQuery: (q: string) => void;
  isSelected: (value: string) => boolean;
  onToggle: (option: Option) => void;
  placeholder: string;
}) {
  return (
    <div className="flex flex-col">
      <div className="relative border-b p-2">
        <Search className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} className="h-8 pl-8" maxLength={100} />
      </div>
      <div className="max-h-64 overflow-y-auto p-1" role="listbox">
        {loading && options.length === 0 ? (
          <div className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Searching…
          </div>
        ) : options.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">No results.</p>
        ) : (
          options.map((option) => {
            const selected = isSelected(option.value);
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => onToggle(option)}
                className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <Check className={cn("mt-0.5 size-4 shrink-0", selected ? "opacity-100" : "opacity-0")} />
                <span className="min-w-0">
                  <span className="block truncate">{option.label}</span>
                  {option.description ? <span className="block truncate text-xs text-muted-foreground">{option.description}</span> : null}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

/** Server-backed autocomplete for a single value. */
export function AsyncSelect({
  value,
  onChange,
  search,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  invalid,
  allowClear = true,
  id,
}: {
  value: Option | null;
  onChange: (value: Option | null) => void;
  search: (q: string) => Promise<Option[]>;
  placeholder?: string;
  searchPlaceholder?: string;
  invalid?: boolean;
  allowClear?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const state = useOptionSearch(search, open);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="flex gap-2">
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" aria-invalid={invalid} className="min-w-0 flex-1 justify-between font-normal">
            <span className={cn("truncate", !value && "text-muted-foreground")}>{value?.label ?? placeholder}</span>
            <ChevronsUpDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        {allowClear && value ? (
          <Button type="button" variant="ghost" size="icon" onClick={() => onChange(null)} aria-label="Clear selection">
            <X />
          </Button>
        ) : null}
      </div>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
        <OptionList
          {...state}
          placeholder={searchPlaceholder}
          isSelected={(v) => v === value?.value}
          onToggle={(option) => {
            onChange(option);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Server-backed autocomplete for multiple values, shown as removable chips. */
export function AsyncMultiSelect({
  value,
  onChange,
  search,
  placeholder = "Add…",
  searchPlaceholder = "Search…",
  invalid,
  id,
}: {
  value: Option[];
  onChange: (value: Option[]) => void;
  search: (q: string) => Promise<Option[]>;
  placeholder?: string;
  searchPlaceholder?: string;
  invalid?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const state = useOptionSearch(search, open);
  const selected = new Set(value.map((v) => v.value));
  const toggle = (option: Option) =>
    onChange(selected.has(option.value) ? value.filter((v) => v.value !== option.value) : [...value, option]);

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" aria-invalid={invalid} className="w-full justify-between font-normal">
            <span className="text-muted-foreground">{value.length ? `${value.length} selected` : placeholder}</span>
            <ChevronsUpDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
          <OptionList {...state} placeholder={searchPlaceholder} isSelected={(v) => selected.has(v)} onToggle={toggle} />
        </PopoverContent>
      </Popover>
      {value.length ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((option) => (
            <Badge key={option.value} variant="secondary" className="gap-1 pr-1">
              <span className="max-w-48 truncate">{option.label}</span>
              <button type="button" onClick={() => toggle(option)} className="rounded-sm p-0.5 hover:bg-foreground/10" aria-label={`Remove ${option.label}`}>
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}
