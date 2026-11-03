"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Date + time picker in the browser's local time. Value is a Date or null. */
export function DateTimePicker({
  value,
  onChange,
  placeholder = "Pick date and time",
  defaultTime = "09:00",
  invalid,
  id,
}: {
  value: Date | null;
  onChange: (value: Date | null) => void;
  placeholder?: string;
  defaultTime?: string;
  invalid?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const time = value ? format(value, "HH:mm") : defaultTime;

  const combine = (day: Date, hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    const next = new Date(day);
    next.setHours(h ?? 0, m ?? 0, 0, 0);
    return next;
  };

  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            aria-invalid={invalid}
            className={cn("flex-1 justify-start font-normal", !value && "text-muted-foreground")}
          >
            <CalendarIcon />
            {value ? format(value, "PPP p") : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value ?? undefined}
            onSelect={(day) => {
              if (day) onChange(combine(day, time));
              setOpen(false);
            }}
            autoFocus
          />
        </PopoverContent>
      </Popover>
      <Input
        type="time"
        aria-label="Time"
        className="w-32"
        value={time}
        disabled={!value}
        onChange={(e) => value && e.target.value && onChange(combine(value, e.target.value))}
      />
      {value ? (
        <Button type="button" variant="ghost" size="icon" onClick={() => onChange(null)} aria-label="Clear date">
          <X />
        </Button>
      ) : null}
    </div>
  );
}
