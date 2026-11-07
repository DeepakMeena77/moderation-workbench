import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { forwardRef, useId, useImperativeHandle, useRef, type KeyboardEvent } from 'react';
import { FilterChip } from './FilterChip';

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  /** Shown as a tooltip when the option is disabled, so the reason is never colour alone (03 sec. 4). */
  disabledReason?: string;
}

export interface ChoiceChipsProps<T extends string> {
  label: string;
  options: ReadonlyArray<ChoiceOption<T>>;
  /** Selected values; a single-choice group holds at most one. */
  value: readonly T[];
  onChange: (value: T[]) => void;
  multiple?: boolean;
  error?: string | null;
}

export interface ChoiceChipsHandle {
  focus: () => void;
}

// A labelled group of filter chips: single choice (role radiogroup) or multiple (role group of checkboxes).
// Arrow keys move between chips, Space or Enter toggles (03 sec. 8). Errors are linked with aria-describedby.
function ChoiceChipsInner<T extends string>(
  { label, options, value, onChange, multiple = false, error }: ChoiceChipsProps<T>,
  ref: React.ForwardedRef<ChoiceChipsHandle>,
) {
  const labelId = useId();
  const errorId = useId();
  const chips = useRef<Array<HTMLDivElement | null>>([]);
  const enabled = options.map((o) => !o.disabledReason);
  const firstFocusable = Math.max(
    0,
    options.findIndex((o, i) => enabled[i] && (value.length === 0 || value.includes(o.value))),
  );

  useImperativeHandle(ref, () => ({ focus: () => chips.current[firstFocusable]?.focus() }), [firstFocusable]);

  const toggle = (option: ChoiceOption<T>) => {
    if (option.disabledReason) return;
    if (multiple) {
      onChange(value.includes(option.value) ? value.filter((v) => v !== option.value) : [...value, option.value]);
    } else {
      onChange([option.value]);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, index: number) => {
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (delta === 0) return;
    event.preventDefault();
    for (let step = 1; step <= options.length; step++) {
      const next = (index + delta * step + options.length * step) % options.length;
      if (enabled[next]) {
        chips.current[next]?.focus();
        return;
      }
    }
  };

  return (
    <Box>
      <Typography id={labelId} variant="h4" component="p" sx={{ mb: 2 }}>
        {label}
      </Typography>
      <Box
        role={multiple ? 'group' : 'radiogroup'}
        aria-labelledby={labelId}
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
        sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}
      >
        {options.map((option, index) => {
          const selected = value.includes(option.value);
          const chip = (
            <FilterChip
              key={option.value}
              ref={(node: HTMLDivElement | null) => {
                chips.current[index] = node;
              }}
              selected={selected}
              role={multiple ? 'checkbox' : 'radio'}
              aria-checked={selected}
              aria-disabled={option.disabledReason ? true : undefined}
              tabIndex={multiple ? (enabled[index] ? 0 : -1) : index === firstFocusable ? 0 : -1}
              label={option.label}
              onClick={() => toggle(option)}
              onKeyDown={(event) => {
                if (event.key === ' ' || event.key === 'Enter') {
                  event.preventDefault();
                  toggle(option);
                  return;
                }
                onKeyDown(event, index);
              }}
              sx={option.disabledReason ? { opacity: 0.38, cursor: 'not-allowed' } : undefined}
            />
          );
          return option.disabledReason ? (
            // describeChild: the reason is a description, so the chip keeps its own name ("Label").
            <Tooltip key={option.value} title={option.disabledReason} describeChild>
              {chip}
            </Tooltip>
          ) : (
            chip
          );
        })}
      </Box>
      {error ? (
        <Typography id={errorId} variant="caption" component="p" color="error" sx={{ mt: 2 }}>
          {error}
        </Typography>
      ) : null}
    </Box>
  );
}

export const ChoiceChips = forwardRef(ChoiceChipsInner) as <T extends string>(
  props: ChoiceChipsProps<T> & { ref?: React.Ref<ChoiceChipsHandle> },
) => ReturnType<typeof ChoiceChipsInner>;
