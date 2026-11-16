import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

type Option = { value: string; label: string };
export function AppSelect({
  value,
  options,
  onChange,
  placeholder = "Chọn thông tin",
  label,
}: {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: string;
  label: string;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [upward, setUpward] = useState(false);
  const [maxHeight, setMaxHeight] = useState(240);
  const selected = options.find((option) => option.value === value);
  function show() {
    const rect = button.current?.getBoundingClientRect();
    if (rect) {
      const below = window.innerHeight - rect.bottom - 12,
        above = rect.top - 12;
      const up = below < Math.min(240, options.length * 40) && above > below;
      setUpward(up);
      setMaxHeight(Math.max(40, Math.min(240, up ? above : below)));
    }
    setActive(
      Math.max(
        0,
        options.findIndex((option) => option.value === value),
      ),
    );
    setOpen(true);
  }
  function choose(index: number) {
    const option = options[index];
    if (option) onChange(option.value);
    setOpen(false);
    button.current?.focus();
  }
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", close);
    };
  }, [open]);
  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);
  return (
    <div className="relative min-w-0 [&_svg]:shrink-0" ref={root}>
      <button
        ref={button}
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        aria-activedescendant={open && options.length ? `${id}-${active}` : undefined}
        className={`flex h-11 w-full items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 text-left text-base transition-colors hover:border-brand/30 focus-visible:border-brand/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand/40 [&>span]:truncate ${!selected ? "text-slate-400" : "text-ink"}`}
        onClick={() => (open ? setOpen(false) : show())}
        onBlur={(event) => {
          if (!root.current?.contains(event.relatedTarget as Node)) setOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) show();
            else
              setActive((index) =>
                Math.max(
                  0,
                  Math.min(options.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)),
                ),
              );
          } else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (open) choose(active);
            else show();
          } else if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
          } else if (event.key === "Tab") setOpen(false);
          else if (open && event.key === "Home") {
            event.preventDefault();
            setActive(0);
          } else if (open && event.key === "End") {
            event.preventDefault();
            setActive(Math.max(0, options.length - 1));
          }
        }}
      >
        <span>{selected?.label ?? placeholder}</span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`transition-transform duration-150 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div
          ref={list}
          id={id}
          role="listbox"
          aria-label={label}
          className={`absolute inset-x-0 z-30 max-h-60 animate-popup-in overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-white shadow-lg [scrollbar-width:thin] motion-reduce:animate-none ${upward ? "bottom-[calc(100%+5px)] origin-bottom" : "top-[calc(100%+5px)] origin-top"}`}
          style={{ maxHeight }}
        >
          {options.length ? (
            options.map((option, index) => (
              <div
                key={option.value}
                id={`${id}-${index}`}
                role="option"
                aria-selected={option.value === value}
                className={`flex h-10 cursor-pointer items-center justify-between gap-2 px-3 text-base transition-colors [&>span]:truncate ${index === active ? "bg-brand/5 text-brand" : "text-ink"} ${option.value === value ? "font-semibold" : ""}`}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.preventDefault();
                  choose(index);
                }}
              >
                <span>{option.label}</span>
                {option.value === value && <Check size={15} aria-hidden="true" />}
              </div>
            ))
          ) : (
            <div className="p-3 text-base text-slate-400">Chưa có dữ liệu</div>
          )}
        </div>
      )}
    </div>
  );
}
