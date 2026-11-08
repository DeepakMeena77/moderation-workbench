import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { forwardRef, useId, useImperativeHandle, useRef, type KeyboardEvent } from 'react';
import { layout, m3 } from '../theme/theme';

export interface OptionCard<T extends string> {
  value: T;
  title: string;
  /** One line saying what choosing this does ("No violation; keep it visible"). */
  description: string;
  /** Disables the card and explains why in a tooltip, so the reason is never colour alone. */
  disabledReason?: string;
}

export interface OptionCardsProps<T extends string> {
  label: string;
  options: ReadonlyArray<OptionCard<T>>;
  value: T | null;
  onChange: (value: T) => void;
  error?: string | null;
}

export interface OptionCardsHandle {
  focus: () => void;
}

// Option cards (03 sec. 4): a single choice as a row of selectable cards, each with a title and a one-line
// consequence. A radio group: arrow keys move between cards, Space or Enter selects (03 sec. 8). Selected: the neutral
// selected fill, a firmer border and a filled radio mark. Three columns, one below 480 px of container width.
function OptionCardsInner<T extends string>(
  { label, options, value, onChange, error }: OptionCardsProps<T>,
  ref: React.ForwardedRef<OptionCardsHandle>,
) {
  const baseId = useId();
  const labelId = `${baseId}-label`;
  const errorId = `${baseId}-error`;
  const cards = useRef<Array<HTMLDivElement | null>>([]);
  const enabled = options.map((o) => !o.disabledReason);
  const selectedIndex = options.findIndex((o) => o.value === value);
  const firstFocusable = Math.max(
    0,
    selectedIndex >= 0 && enabled[selectedIndex] ? selectedIndex : enabled.indexOf(true),
  );

  useImperativeHandle(ref, () => ({ focus: () => cards.current[firstFocusable]?.focus() }), [firstFocusable]);

  const choose = (option: OptionCard<T>) => {
    if (!option.disabledReason) onChange(option.value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, index: number) => {
    const option = options[index];
    if (!option) return;
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      choose(option);
      return;
    }
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
        cards.current[next]?.focus();
        return;
      }
    }
  };

  return (
    <Box sx={{ containerType: 'inline-size' }}>
      <Typography id={labelId} variant="h4" component="p" sx={{ mb: 2 }}>
        {label}
      </Typography>
      <Box
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 2,
          '@container (max-width: 480px)': { gridTemplateColumns: 'minmax(0, 1fr)' },
        }}
      >
        {options.map((option, index) => {
          const selected = option.value === value;
          const disabled = Boolean(option.disabledReason);
          const titleId = `${baseId}-${option.value}-title`;
          const descId = `${baseId}-${option.value}-desc`;
          const card = (
            <Box
              key={option.value}
              ref={(node: HTMLDivElement | null) => {
                cards.current[index] = node;
              }}
              role="radio"
              aria-checked={selected}
              aria-labelledby={titleId}
              aria-describedby={descId}
              aria-disabled={disabled ? true : undefined}
              tabIndex={index === firstFocusable ? 0 : -1}
              data-ui="section"
              onClick={() => choose(option)}
              onKeyDown={(event) => onKeyDown(event, index)}
              sx={(t) => {
                const p = m3(t);
                return {
                  position: 'relative',
                  display: 'grid',
                  gridTemplateColumns: 'auto minmax(0, 1fr)',
                  columnGap: 3,
                  rowGap: 1,
                  alignItems: 'start',
                  p: 3,
                  borderRadius: `${layout.controlRadius}px`,
                  border: `1px solid ${selected ? p.borderHover : p.border}`,
                  backgroundColor: selected ? p.selected : p.card,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.5 : 1,
                  // Hover is a state layer over the card, so the card's own fill stays a surface token.
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 'inherit',
                    backgroundColor: p.onSurface,
                    opacity: 0,
                    pointerEvents: 'none',
                  },
                  '&:hover::before': disabled ? {} : { opacity: 0.04 },
                };
              }}
            >
              <Box
                aria-hidden
                sx={(t) => ({
                  width: 16,
                  height: 16,
                  mt: 0.5,
                  borderRadius: '50%',
                  boxSizing: 'border-box',
                  border: `1px solid ${selected ? m3(t).onSurface : m3(t).borderHover}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  '&::after': selected
                    ? { content: '""', width: 8, height: 8, borderRadius: '50%', backgroundColor: m3(t).onSurface }
                    : {},
                })}
              />
              <Box sx={{ minWidth: 0 }}>
                <Typography id={titleId} variant="h4" component="span" sx={{ display: 'block' }}>
                  {option.title}
                </Typography>
                <Typography
                  id={descId}
                  variant="caption"
                  component="span"
                  color="text.secondary"
                  sx={{ display: 'block' }}
                >
                  {option.description}
                </Typography>
              </Box>
            </Box>
          );
          return option.disabledReason ? (
            <Tooltip key={option.value} title={option.disabledReason} describeChild>
              {card}
            </Tooltip>
          ) : (
            card
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

export const OptionCards = forwardRef(OptionCardsInner) as <T extends string>(
  props: OptionCardsProps<T> & { ref?: React.Ref<OptionCardsHandle> },
) => ReturnType<typeof OptionCardsInner>;
