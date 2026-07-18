import { useEffect, useId, useRef, useState, type ComponentProps } from 'react';
import { CalendarDays, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

type BirthDateInputProps = Omit<
  ComponentProps<typeof Input>,
  'defaultValue' | 'max' | 'min' | 'onChange' | 'type' | 'value'
> & {
  value: string;
  onValueChange: (value: string) => void;
  onValidityChange?: (isValid: boolean) => void;
};

const pad = (value: number) => String(value).padStart(2, '0');

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getBirthDateBounds() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const latest = new Date(today);
  latest.setDate(latest.getDate() - 1);

  const earliest = new Date(today);
  earliest.setFullYear(earliest.getFullYear() - 150);
  earliest.setDate(earliest.getDate() + 1);

  return { min: toIsoDate(earliest), max: toIsoDate(latest) };
}

const BIRTH_DATE_BOUNDS = getBirthDateBounds();

function isValidBirthDate(value: string) {
  return value >= BIRTH_DATE_BOUNDS.min && value <= BIRTH_DATE_BOUNDS.max;
}

function normalizeNumerals(value: string) {
  return value
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
}

function isoToDraft(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

function formatTypedDate(rawValue: string) {
  const normalized = normalizeNumerals(rawValue.trim());
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(normalized);
  if (isoMatch) {
    return `${isoMatch[3].padStart(2, '0')}/${isoMatch[2].padStart(2, '0')}/${isoMatch[1]}`;
  }

  const digits = normalized.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function draftToIso(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null;
  }

  return `${match[3]}-${match[2]}-${match[1]}`;
}

export function BirthDateInput({
  id,
  value,
  onValueChange,
  onValidityChange,
  className,
  disabled,
  required,
  placeholder,
  ...props
}: BirthDateInputProps) {
  const isMobile = useIsMobile();
  const hasTouchInput = (
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)
    || (typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(pointer: coarse)').matches)
  );
  const usesPhoneInput = isMobile || hasTouchInput;
  const generatedId = useId();
  const inputId = id ?? `birth-date-${generatedId}`;
  const pickerRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const emittedValueRef = useRef<string | null>(null);
  const [draft, setDraft] = useState(() => isoToDraft(value));
  const [isInvalid, setIsInvalid] = useState(false);

  useEffect(() => {
    if (emittedValueRef.current === value) {
      emittedValueRef.current = null;
      return;
    }
    setDraft(isoToDraft(value));
    setIsInvalid(false);
    textInputRef.current?.setCustomValidity('');
    onValidityChange?.(!value || isValidBirthDate(value));
  }, [onValidityChange, value]);

  const emitValue = (nextValue: string, isValid = true) => {
    emittedValueRef.current = nextValue;
    onValidityChange?.(isValid);
    onValueChange(nextValue);
  };

  if (!usesPhoneInput) {
    return (
      <Input
        {...props}
        id={inputId}
        type="date"
        value={value}
        min={BIRTH_DATE_BOUNDS.min}
        max={BIRTH_DATE_BOUNDS.max}
        required={required}
        disabled={disabled}
        autoComplete={props.autoComplete ?? 'bday'}
        className={className}
        onChange={(event) => {
          const nextValue = event.target.value;
          const valid = !nextValue || isValidBirthDate(nextValue);
          emitValue(valid ? nextValue : '', valid);
        }}
      />
    );
  }

  const updateValue = (nextDraft: string, input: HTMLInputElement) => {
    const isoValue = draftToIso(nextDraft);
    const isWithinBounds = Boolean(
      isoValue && isValidBirthDate(isoValue),
    );
    const invalid = nextDraft.length > 0 && !isWithinBounds;

    setDraft(nextDraft);
    setIsInvalid(invalid);
    input.setCustomValidity(invalid ? 'Enter a valid past date as DD/MM/YYYY.' : '');
    emitValue(isWithinBounds && isoValue ? isoValue : '', !invalid);
  };

  const clearDate = () => {
    setDraft('');
    setIsInvalid(false);
    textInputRef.current?.setCustomValidity('');
    emitValue('');
    textInputRef.current?.focus();
  };

  const openCalendar = () => {
    const picker = pickerRef.current;
    if (!picker) return;

    try {
      if (typeof picker.showPicker === 'function') picker.showPicker();
      else picker.click();
    } catch {
      picker.click();
    }
  };

  return (
    <div className="relative w-full">
      <Input
        {...props}
        ref={textInputRef}
        id={inputId}
        type="text"
        inputMode="numeric"
        enterKeyHint="done"
        dir="ltr"
        value={draft}
        required={required}
        disabled={disabled}
        autoComplete={props.autoComplete ?? 'bday'}
        placeholder={placeholder ?? 'DD/MM/YYYY'}
        aria-invalid={isInvalid || undefined}
        className={cn('h-11 pe-[5.5rem]', className)}
        onChange={(event) => updateValue(formatTypedDate(event.target.value), event.currentTarget)}
      />

      <div className="absolute inset-y-0 end-0 flex items-center pe-0.5">
        {draft && !disabled && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 text-muted-foreground"
            aria-label="Clear date of birth"
            title="Clear date of birth"
            onClick={clearDate}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 text-muted-foreground"
          disabled={disabled}
          aria-label="Open birth date calendar"
          title="Open calendar"
          onClick={openCalendar}
        >
          <CalendarDays className="h-4 w-4" />
        </Button>
      </div>

      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        min={BIRTH_DATE_BOUNDS.min}
        max={BIRTH_DATE_BOUNDS.max}
        disabled={disabled}
        className="pointer-events-none absolute bottom-0 end-0 h-px w-px opacity-0"
        onChange={(event) => {
          const nextValue = event.target.value;
          setDraft(isoToDraft(nextValue));
          setIsInvalid(false);
          textInputRef.current?.setCustomValidity('');
          emitValue(nextValue);
        }}
      />
    </div>
  );
}
